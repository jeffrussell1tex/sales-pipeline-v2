// _lib.mjs — shared helpers for Netlify functions.
import { randomUUID } from 'crypto';
import { db } from '../../db/index.js';
import { auditLog, users } from '../../db/schema.js';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { bulkInsert as coreBulkInsert, bulkUpsert as coreBulkUpsert } from './_bulk.mjs';
import { ownerColumnOf, ownerKeyFor, ownerNameKeyFor, mayMutate, OWNERSHIP_FORBIDDEN, isAppUserId } from './_ownership.mjs';
// Audit streaming (state §0.87): every row written here is delivered to the
// org's destinations after the insert. _auditStream.mjs must not import this file.
import { streamAudit } from './_auditStream.mjs';

// Browser origins allowed to call the API. Kept in sync with the Clerk
// authorizedParties list in auth.mjs. Exported for the CORS follow-up; any
// origin not on this list already fails Clerk auth.
export const ALLOWED_ORIGINS = [
    'https://salespipelinetracker.com',
    'https://sales-pipeline-v2.netlify.app',
    'https://accelerep.netlify.app',
    'http://localhost:5173',
    'http://localhost:8888',
];
const PRIMARY_ORIGIN = 'https://salespipelinetracker.com';

// Echo the caller's origin only if allow-listed; otherwise the primary domain.
export function allowOrigin(event) {
    const origin = event?.headers?.origin || event?.headers?.Origin || '';
    return ALLOWED_ORIGINS.includes(origin) ? origin : PRIMARY_ORIGIN;
}

// Standardized 500 body: logs the real error server-side with a correlation id
// and returns ONLY a generic message + that id to the client, so DB driver text
// and stack traces never leak. Returns the JSON string for use as a 500 body.
export function serverErrorBody(err, label = 'function') {
    const requestId = randomUUID();
    console.error(`[${label}] error ${requestId}:`, err?.message, err?.stack);
    return JSON.stringify({ error: 'Internal server error', requestId });
}

// Best-effort audit-log writer shared by entity endpoints. Never throws —
// an audit failure must not fail (or roll back the visibility of) the
// operation being audited; it is logged server-side instead.
export async function writeAudit(orgId, { action, entityType, entityId, entityName = null, detail = null, userId = null, userName = null }) {
    try {
        const [row] = await db.insert(auditLog).values({
            id: 'audit_' + randomUUID(),
            orgId,
            action,
            entityType,
            entityId: String(entityId || ''),
            entityName,
            detail,
            userId,
            userName,
            timestamp: new Date(),
        }).returning();
        await streamAudit(orgId, row);
    } catch (e) {
        console.warn('writeAudit error:', e.message);
    }
}

// ── Caller identity ──────────────────────────────────────────────────────────
//
// Resolves a Clerk userId to the caller's ROSTER ROW for this org: their
// permanent app id and their current display name.
//
// TWO THINGS CHANGED HERE AND BOTH MATTER.
//
// 1. The lookup is now `clerkUserId`, not `id`. `users.id` is app-owned and no
//    longer holds the Clerk identity, so matching on it would silently find
//    nothing -- and a null caller name fails CLOSED in mayMutate(), which
//    presents as "every rep is refused on every owned record" rather than as an
//    error. Fail-closed is right, but only if the lookup is right.
//
// 2. It is scoped to orgId. It never was. That was survivable only because a
//    Clerk id could appear in exactly one row -- users.email was globally
//    unique, so one person could belong to one org, full stop. Now that a
//    person can hold a roster row in several orgs, an unscoped lookup returns
//    an ARBITRARY one of them, and would authorize a write in org A using the
//    name from org B. Removing the global email constraint is what makes this
//    scoping mandatory rather than merely correct.
//
// Cached briefly per warm container since it runs on every rep-role mutation.
// Returns nulls on miss/error -- callers treat a null name as "owns nothing".
const callerCache = new Map();
const CALLER_NAME_TTL_MS = 30_000;

export async function resolveCaller(clerkUserId, orgId) {
    const empty = { id: null, name: null };
    if (!clerkUserId || !orgId) return empty;
    const key = `${orgId}::${clerkUserId}`;
    const cached = callerCache.get(key);
    if (cached && Date.now() - cached.ts < CALLER_NAME_TTL_MS) return cached.caller;
    try {
        const [row] = await db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(and(eq(users.clerkUserId, clerkUserId), eq(users.orgId, orgId)));
        const caller = { id: row?.id || null, name: row?.name || null };
        callerCache.set(key, { caller, ts: Date.now() });
        if (callerCache.size > 500) callerCache.delete(callerCache.keys().next().value);
        return caller;
    } catch (e) {
        console.warn('resolveCaller error:', e.message);
        return empty;
    }
}

// Display-name half. FOR RENDERING, AUDIT AND EXPORT ONLY.
//
// NOTHING AUTHORIZES ON THIS ANY MORE. Ownership compares ids (see getCallerId
// below and mayMutate in _ownership.mjs). It is kept because audit rows, email
// templates and the visibility filters still render a human-readable name, and
// because a name is what a CSV carries.
//
// orgId is REQUIRED and throws when absent rather than defaulting to an
// unscoped query. Guide 18b19: where a lookup feeds a decision, absence must be
// an error and never a value -- a missing orgId that quietly widened the search
// is exactly the failure this rule exists to prevent.
export async function getCallerName(clerkUserId, orgId) {
    if (!orgId) {
        throw new Error(
            '_lib.getCallerName: orgId is required. Pass the orgId from verifyAuth() -- ' +
            'an unscoped caller lookup can resolve a name from a different tenant.'
        );
    }
    const { name } = await resolveCaller(clerkUserId, orgId);
    return name;
}

// The id half — THIS is what authorization compares.
//
// Returns the caller's `users.id` (`usr_<uuid>`), or null when they have no
// roster row in this org. Null fails CLOSED in mayMutate(): a caller who owns
// nothing is refused every owned record. That is the safe direction, but only
// because the lookup itself is right -- resolveCaller matches on clerkUserId and
// scopes to orgId, and getting either wrong presents as "every rep is refused
// everything" rather than as an error.
export async function getCallerId(clerkUserId, orgId) {
    if (!orgId) {
        throw new Error(
            '_lib.getCallerId: orgId is required. Pass the orgId from verifyAuth() -- ' +
            'an unscoped caller lookup can resolve an id from a different tenant.'
        );
    }
    const { id } = await resolveCaller(clerkUserId, orgId);
    return id;
}

// ── Display name -> users.id ─────────────────────────────────────────────────
//
// The one place a NAME becomes an ID. Needed because names arrive from outside:
// a CSV column, a roster picker that still sends a label, a legacy payload.
//
// AMBIGUITY IS REFUSED, NOT GUESSED. If two roster rows in one org share a
// display name, this throws a 409 naming both. That collision is precisely what
// Phase 2 exists to eliminate, and the alternatives are both worse:
//
//   - picking the first match assigns the record to an arbitrary one of two
//     people, permanently, in a column nobody will ever re-check;
//   - stamping null creates an UNASSIGNED record, and unassigned records are
//     mutable by anyone -- a quiet authorization hole dressed as a successful
//     write.
//
// A name that matches nobody returns null, which is different: that is a genuine
// "no such owner", and the caller decides whether to leave the record unassigned
// or reject the row.
//
// Matching is trimmed and case-insensitive because CSV data is neither. The
// roster is small (tens of rows) and cached per warm container, so this is one
// query per org rather than one per row of an import.
const rosterCache = new Map();
const ROSTER_TTL_MS = 30_000;

async function orgRoster(orgId) {
    const cached = rosterCache.get(orgId);
    if (cached && Date.now() - cached.ts < ROSTER_TTL_MS) return cached.rows;
    const rows = await db.select({ id: users.id, name: users.name, email: users.email })
        .from(users).where(eq(users.orgId, orgId));
    rosterCache.set(orgId, { rows, ts: Date.now() });
    if (rosterCache.size > 200) rosterCache.delete(rosterCache.keys().next().value);
    return rows;
}

/**
 * Clears the cached views of the `users` table for one org. Call after ANY write
 * to `users` in the same request.
 *
 * There are TWO caches over that table and both are 30s, so clearing one and not
 * the other leaves half a stale answer:
 *
 *   rosterCache  orgId              name -> id resolution (resolveOwnerId)
 *   callerCache  orgId::clerkUserId this caller's own id and name (resolveCaller)
 *
 * The caller cache is the one with teeth. It caches a MISS as `{id: null}`, and a
 * null caller id fails CLOSED in mayMutate() — so a user whose roster row was
 * created or linked moments ago owns nothing at all until the entry expires.
 * Dropping both together is why this takes an orgId and not a user id.
 */
export function invalidateRoster(orgId) {
    if (!orgId) { rosterCache.clear(); callerCache.clear(); return; }
    rosterCache.delete(orgId);
    const prefix = `${orgId}::`;
    for (const key of callerCache.keys()) {
        if (key.startsWith(prefix)) callerCache.delete(key);
    }
}

export async function resolveOwnerId(name, orgId) {
    if (!orgId) throw new Error('_lib.resolveOwnerId: orgId is required.');
    const wanted = String(name ?? '').trim().toLowerCase();
    if (!wanted) return null;

    const matches = (await orgRoster(orgId))
        .filter((u) => String(u.name ?? '').trim().toLowerCase() === wanted);

    if (matches.length === 0) return null;
    if (matches.length > 1) {
        const err = new Error(
            `Ambiguous owner: ${matches.length} users in this organization are named ` +
            `"${String(name).trim()}" (${matches.map((m) => m.email || m.id).join(', ')}). ` +
            `Rename one of them, or assign this record by picking the user directly.`
        );
        err.statusCode = 409;
        err.ambiguous = true;
        err.candidates = matches.map((m) => ({ id: m.id, email: m.email }));
        throw err;
    }
    return matches[0].id;
}

/**
 * The owner id to stamp on a record being created or re-assigned.
 *
 * `suppliedName` is whatever the payload called the owner -- null/absent when the
 * client said nothing. The rule:
 *
 *   a name was supplied  -> resolve it (throws on ambiguity, null on no match)
 *   nothing was supplied -> the CALLER owns what they create
 *
 * The second half is the point of Phase 2 step 3: the server already knows who
 * is calling, from the JWT. The client no longer has to have resolved its own
 * identity before a record can be created -- which is the class of bug that
 * produced importRows.js:103, where a blank Sales Rep was filled in with
 * whatever string the browser happened to be calling the current user, up to and
 * including their email address.
 */
export async function ownerIdForWrite({ suppliedName, clerkUserId, orgId }) {
    const supplied = String(suppliedName ?? '').trim();
    if (supplied) return await resolveOwnerId(supplied, orgId);
    return await getCallerId(clerkUserId, orgId);
}

// ── Stamping ownership on writes ─────────────────────────────────────────────
//
// The endpoints call these rather than assembling an ownerId themselves, for the
// reason 18b19 gives about the ownership COLUMN: a rule copied into six handlers
// is six chances to get it subtly different, and the differences are invisible
// because each one reads fine on its own.

/**
 * A single CREATE through the UI.
 *
 * A named owner is resolved; nothing named means THE CALLER OWNS WHAT THEY
 * CREATE. The server has known who is calling since the JWT was verified, so the
 * client never has to have resolved its own identity first — which is the class
 * of bug that produced `importRows.js:103`, where a blank Sales Rep was filled in
 * with whatever string the browser was calling the current user, up to and
 * including their email address.
 */
export async function stampOwnerId(row, entity, { clerkUserId, orgId }) {
    const nameKey = ownerNameKeyFor(entity);
    return {
        ...row,
        ownerId: await ownerIdForWrite({ suppliedName: row?.[nameKey], clerkUserId, orgId }),
    };
}

/**
 * A BULK create — a CSV import.
 *
 * Deliberately different from the single-create path in one respect: a blank
 * owner stays UNASSIGNED rather than defaulting to the caller.
 *
 * That difference is the point, not an inconsistency. Creating a deal in the UI
 * means you own it. Importing three hundred rows of somebody else's spreadsheet
 * does not make you the owner of all of them — and stamping the importer was
 * exactly what `importRows.js:103` did, which is why an unassigned opportunity
 * could not be created by import AT ALL. Unassigned records are mutable by any
 * writer, so leaving them null is also what lets a rep pick them up afterwards.
 *
 * Names that are ambiguous or match nobody are REPORTED, not guessed at, and the
 * row is still imported — unowned. 18b16: a row you alter must say so.
 */
export async function stampOwnerIds(rows, entity, { clerkUserId, orgId, defaultToCaller = false }) {
    const nameKey = ownerNameKeyFor(entity);
    const fallback = defaultToCaller ? await getCallerId(clerkUserId, orgId) : null;
    const ambiguous = new Set();
    const unmatched = new Set();

    const out = [];
    for (const row of rows) {
        const supplied = String(row?.[nameKey] ?? '').trim();
        let ownerId = fallback;
        if (supplied) {
            try {
                ownerId = await resolveOwnerId(supplied, orgId);
                if (ownerId === null) unmatched.add(supplied);
            } catch (err) {
                if (!err?.ambiguous) throw err;
                ambiguous.add(supplied);
                ownerId = null;
            }
        }
        out.push({ ...row, ownerId });
    }
    return { rows: out, ambiguousOwners: [...ambiguous], unmatchedOwners: [...unmatched] };
}

/**
 * An UPDATE. Answers "should ownerId be written, and to what?"
 *
 * Returns `{ change: false }` when the payload never mentioned the owner, so a
 * partial PUT cannot blank an ownership it said nothing about (18b13).
 *
 * The result is an OBJECT rather than a bare value on purpose. The natural
 * shape here returns `undefined` for "leave it alone" and `null` for "clear it",
 * and this codebase has been bitten four times by one value carrying two
 * meanings — `users.id`, `callerName`, `users.email`, `ownerColumn`. An explicit
 * flag cannot be misread by the first caller that writes `if (x)`.
 *
 * Reads the RAW payload, never the sanitized row: `sanitize()` is a full-row
 * builder, so every owner key exists in its output whether or not the caller
 * sent one, and `nameKey in clean` is therefore always true.
 */
export async function ownerIdForUpdate({ payload, entity, orgId }) {
    const nameKey = ownerNameKeyFor(entity);
    if (!payload || !(nameKey in payload)) return { change: false };
    const supplied = String(payload[nameKey] ?? '').trim();
    if (!supplied) return { change: true, ownerId: null };      // explicitly cleared
    return { change: true, ownerId: await resolveOwnerId(supplied, orgId) };
}

/**
 * Turns an ambiguous-owner error into a 409 the client can act on.
 *
 * Returns null for any other error so the caller falls through to its own 500.
 * Without this the collision surfaces as "Internal server error" plus a
 * correlation id, and the one thing the user needs to know — that two people in
 * their organization share a display name — is only in the server log.
 */
export function ambiguousOwnerResponse(err, headers) {
    if (!err?.ambiguous) return null;
    return {
        statusCode: err.statusCode || 409,
        headers,
        body: JSON.stringify({ error: err.message, ambiguous: true, candidates: err.candidates || [] }),
    };
}

// ── Sequential record numbers ────────────────────────────────────────────────
// CUST-0001 / JOB-2026-0042 / Q-2026-001 are all generated by reading the current
// maximum and adding one. That is two statements with a gap between them, so two
// concurrent requests can read the same maximum and both write the same number.
//
// The unique indexes in schema.ts turn that silent duplicate into a Postgres
// unique_violation (SQLSTATE 23505). This helper is the other half: it retries,
// so the loser of the race simply takes the next number instead of erroring.
//
// Only 23505 is retried. Any other failure is a real error and is rethrown
// immediately rather than being retried into a timeout.
const isUniqueViolation = (err) =>
    err?.code === '23505' ||
    err?.cause?.code === '23505' ||
    /duplicate key value violates unique constraint/i.test(err?.message || '');

export async function withNumberRetry(attempt, { tries = 5, label = 'record number' } = {}) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
        try {
            return await attempt(i);
        } catch (err) {
            if (!isUniqueViolation(err)) throw err;
            lastErr = err;
            // Small jittered backoff so simultaneous callers do not re-collide in
            // lockstep on the retry.
            await new Promise(r => setTimeout(r, 10 + Math.floor(Math.random() * 40)));
        }
    }
    const e = new Error(`Could not assign a unique ${label} after ${tries} attempts. Please try again.`);
    e.cause = lastErr;
    throw e;
}

// ── Bulk upsert ───────────────────────────────────────────────────────────────
// Shared by the array branch of PUT on contacts.mjs and accounts.mjs, used by
// the CSV importer's "overwrite" path.
//
// WHY THIS EXISTS
// The importer previously issued ONE PUT PER RECORD — `saveAll` in ModalLayer,
// CONCURRENCY 3, BATCH_SIZE 50, 100ms between batches. Re-importing a 1,504-row
// contacts file meant ~500 sequential round-trips: 75 seconds to 2.5 minutes of
// a frozen tab. Meanwhile the POST path did the opposite and crammed every row
// into ONE statement, which breaks above the Postgres 65,535 bind-parameter
// ceiling (accounts: 35 columns -> 1,872 rows). Neither extreme is right.
//
// (bulkUpsert itself now lives in _bulk.mjs; this note stays with the callers.)
//
// A server-side loop of single-row upserts was rejected: ~30ms per Neon HTTP
// statement x 200 rows overruns Netlify's 10s function timeout. This emits one
// multi-row INSERT ... ON CONFLICT DO UPDATE per chunk, using `excluded.<col>`
// so each row updates with ITS OWN values — a plain `set: {...row}` would apply
// the first row's values to every row in the chunk.
//
// SAFETY
//  - ids are filtered against rows that already exist IN THIS ORG, so the insert
//    half can never create a record: PUT stays strictly an update, matching the
//    single-record path's 404-on-unknown-id contract.
//  - `setWhere` pins org_id, so an id belonging to another tenant is not updated
//    even if it were guessed.
//  - ownership is resolved once for the whole batch rather than per row.
//  - CHUNK x columns must stay under 65,535. 400 x ~37 = ~14,800, which leaves
//    room for the schema to roughly quadruple before this needs revisiting.

// Both bulk helpers live in _bulk.mjs so they are testable without a database —
// see the note at the top of that file. These bind the real client; callers pass
// none and keep importing from _lib.mjs.
export const bulkInsert = (args) => coreBulkInsert({ client: db, ...args });

// bulkUpsert moved here from _lib.mjs after it shipped a 500 that no CI test
// could have caught: its INSERT arm must satisfy every NOT NULL column even when
// the row already exists, and a partial payload cannot. See the NOT NULL backfill
// in _bulk.mjs.
export const bulkUpsert = (args) => coreBulkUpsert({ client: db, ...args });


// Admin and Manager see and mutate everything. Duplicated from auth.mjs rather
// than imported: auth.mjs is replaced wholesale by mock.module in the
// integration tests, and importing it here would drag the stub's completeness
// into every consumer of _lib.
const canSeeAllRole = (role) => role === 'Admin' || role === 'Manager';

// ── assertOwnership ──────────────────────────────────────────────────────────
//
// The query half of _ownership.mjs. It lives here rather than there because it
// needs db, and _ownership.mjs is kept pure so the gates and `npm test` can
// import it without tsx.
//
// Returns a ready-to-return 403 when the caller may not mutate the row, or null
// when they may. Replaces the six hand-copied lines in every mutating branch:
//
//     const forbidden = await assertOwnership({
//         table: contacts, entity: 'contact', id, orgId, userId, userRole, headers,
//     });
//     if (forbidden) return forbidden;
//
// `row` is an optimisation, not a shortcut. Branches that have ALREADY loaded
// the record pass it and no second query is issued; the policy applied is
// identical either way.
//
// A row that does not exist returns null — "not forbidden" — because 404 is the
// caller's answer to give after its own delete or update reports nothing
// touched. Answering 403 here would tell an unauthorized caller which ids exist.
export async function assertOwnership({ table, entity, id, orgId, userId, userRole, headers, row = undefined }) {
    if (canSeeAllRole(userRole)) return null;

    // Resolves the registry against the real table, and throws BY NAME if the
    // registered property is not on it — the guard contacts.createdBy needed.
    // This is now the OWNER ID column; the display name is not consulted.
    const column = ownerColumnOf(table, entity);

    let ownerId;
    if (row !== undefined) {
        if (!row) return null;
        ownerId = row[ownerKeyFor(entity)];
    } else {
        const [target] = await db.select({ ownerId: column }).from(table)
            .where(and(eq(table.id, id), eq(table.orgId, orgId)));
        if (!target) return null;
        ownerId = target.ownerId;
    }

    const callerId = await getCallerId(userId, orgId);
    if (mayMutate({ ownerId, callerId, canSeeAll: false })) return null;

    return { statusCode: 403, headers, body: JSON.stringify({ error: OWNERSHIP_FORBIDDEN }) };
}
