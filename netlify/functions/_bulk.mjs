// _bulk.mjs — chunking and isolation policy for bulk writes.
//
// Deliberately free of any db import. `_lib.mjs` pulls in ../../db/index.js,
// which is TypeScript, so anything living there can only be tested under `tsx` —
// i.e. in `npm run test:int`, which needs a real database and does NOT run in the
// gates job. A rule nobody can test in CI is a rule that quietly stops holding.
// Everything here is pure policy over an injected client, so it runs under plain
// `node --test` alongside the rest of the suite.
//
// CHUNK x columns must stay under the Postgres ceiling of 65,535 bind parameters.
// 400 x ~37 = ~14,800, leaving room for the schema to roughly quadruple.
import { and, eq, inArray, sql } from 'drizzle-orm';
// The ownership POLICY lives in one place and is applied here too. Both modules
// are pure, so importing costs nothing and removes the possibility of the bulk
// path and the single-record path disagreeing -- which is exactly what happened.
import { mayMutate } from './_ownership.mjs';

export const BULK_CHUNK = 400;

// ── bulkInsert ───────────────────────────────────────────────────────────────
// The INSERT half of the same problem. bulkUpsert fixed the PUT path last
// session; POST was still `db.insert(t).values(allRows)` — ONE statement for
// every row in the import (18b8):
//
//   - above ~1,872 accounts / ~1,771 contacts it exceeds the Postgres 65,535
//     bind-parameter ceiling and fails outright;
//   - and being one statement, it is atomic — a single bad row (an over-length
//     field, a repeated id) rolls back the entire import with nothing saved and
//     no indication of which row was at fault.
//
// `onConflictDoNothing()` did NOT mitigate that, despite the comment claiming it
// "skips duplicates instead of erroring". The only unique constraint is the id
// primary key and every id is a fresh crypto.randomUUID() from the client, so the
// clause could never fire. It is removed rather than replaced: deduping by name
// at insert time would fight the smart-merge tooling that already owns that
// decision, and a clause that cannot fire is worse than none — it reads as
// protection that was never there.
//
// ISOLATION BY BISECTION, not row-by-row.
// A failed chunk is split in half and each half retried, recursing to a single
// row. One bad row in a 400-row chunk costs ~9 extra statements instead of 400 —
// which matters because 400 round-trips at ~30ms is 12s against a 10s Netlify
// function timeout, i.e. the "safe" fallback would itself have been the outage.
//
// DEADLINE. Every path is bounded by a wall-clock budget. Whatever has landed is
// reported honestly and the remainder comes back as failed-not-attempted, so the
// client can tell the user exactly which rows to re-import. A truthful partial
// result beats a 502 that says nothing about what was written.
//
// `client` is a test seam. Chunk sizes, bisection depth and the deadline are all
// properties of the TRAFFIC, invisible in the return value — a single statement
// and four chunked ones produce an identical response. tests/bulk-insert.test.mjs
// passes a recording stub and asserts on the statements issued. It defaults to
// the real db, so no caller passes it.
export const BULK_INSERT_BUDGET_MS = 7500;   // Netlify hard-kills at 10s; leave headroom

export async function bulkInsert({ table, rows, orgId, budgetMs = BULK_INSERT_BUDGET_MS, client }) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return { inserted: 0, insertedIds: [], failed: [], timedOut: false };
    }

    const deadline = Date.now() + budgetMs;
    const insertedIds = [];
    const failed = [];
    let timedOut = false;

    // orgId is stamped here and never taken from the payload, so a caller cannot
    // write into another tenant by putting an orgId in the CSV.
    const stamped = rows.map(r => ({ ...r, orgId }));

    const attempt = async (slice) => {
        if (slice.length === 0) return;
        if (Date.now() > deadline) {
            timedOut = true;
            for (const r of slice) failed.push({ id: r.id ?? null, error: 'Not attempted — the import exceeded its time budget.' });
            return;
        }
        try {
            const done = await client.insert(table).values(slice).returning({ id: table.id });
            for (const d of done) insertedIds.push(d.id);
        } catch (err) {
            if (slice.length === 1) {
                // The message is the driver's own and can carry column values, so
                // it is logged in full and only the first line is returned.
                console.error('bulkInsert row failed', slice[0]?.id, err?.message);
                failed.push({ id: slice[0]?.id ?? null, error: String(err?.message || 'Insert failed').split('\n')[0].slice(0, 200) });
                return;
            }
            const mid = Math.floor(slice.length / 2);
            await attempt(slice.slice(0, mid));
            await attempt(slice.slice(mid));
        }
    };

    for (let i = 0; i < stamped.length; i += BULK_CHUNK) {
        await attempt(stamped.slice(i, i + BULK_CHUNK));
    }

    return { inserted: insertedIds.length, insertedIds, failed, timedOut };
}

// ── bulkUpsert ───────────────────────────────────────────────────────────────
// The UPDATE half. Moved here from _lib.mjs after it shipped a 500 that no test
// in the gates job could have caught, for the reason given at the top of this
// file: _lib.mjs imports db/index.js, which is TypeScript.
//
// Contract, unchanged:
//  - PUT is strictly an update. Rows whose id is not already present in this org
//    come back as `notFound`; the upsert half can never create a record.
//  - `setWhere` pins org_id, so an id belonging to another tenant is not updated
//    even if it were guessed.
//  - ownership is resolved once for the whole batch rather than per row.
//  - CHUNK x columns stays under the 65,535 bind-parameter ceiling.
export const BULK_IMMUTABLE = new Set(['id', 'orgId', 'createdAt']);

// Columns the INSERT arm cannot omit: NOT NULL with no database default.
//
// This is the crux of the 500. `INSERT ... ON CONFLICT DO UPDATE` is an INSERT
// first: Postgres forms the candidate tuple and checks its constraints BEFORE it
// resolves the conflict and switches to the update. So every NOT NULL column
// without a default must be present in the values -- even for a row that already
// exists and will only ever be updated.
//
// `opportunities.pipelineId` is exactly that, and once partial rows stopped
// sending it (correctly -- a CSV does not describe which pipeline a deal is in),
// every bulk overwrite 500'd on a NOT NULL violation.
//
// The fix is NOT to send it back as a value the caller invented. It is to
// backfill it FROM THE ROW THAT ALREADY EXISTS, and to keep it out of the SET
// clause, so the tuple can form and the update still writes only what the caller
// supplied.
const requiredColumns = (table) =>
    Object.keys(table).filter((k) => {
        const c = table[k];
        return c && c.name && c.notNull && !c.hasDefault && !BULK_IMMUTABLE.has(k);
    });

// `canSeeAll` is an EXPLICIT parameter and defaults to false.
//
// It used to be encoded as `callerName === null`, with the comment "callerName
// null means the caller may edit everything (canSeeAll role)". But null is also
// what the caller resolver returns when it CANNOT IDENTIFY the caller, so one
// value carried two opposite meanings -- "trusted, skip the check" and "unknown,
// check nothing is possible" -- and the permissive one won:
//
//     if (callerName !== null && prior.owner && prior.owner !== callerName)
//
// An unidentifiable caller skipped the branch entirely and could overwrite every
// owned row in the org. Unreachable while every caller resolved to a name; the
// identity split made it reachable, and an integration test caught it live.
//
// This is the same defect as `ownerColumn: undefined` documented at the top of
// _ownership.mjs -- a falsy value read as "no restriction" by the guard. Guide
// 18b19: where a lookup feeds an authorization decision, absence must be an
// error or a refusal, never a permission.
//
// The default is false, so a caller that forgets to pass it refuses Admins on
// the bulk path rather than authorizing everyone. That is visible and annoying;
// the other direction is silent and unbounded.
export async function bulkUpsert({ table, rows, orgId, ownerColumn = null, callerName = null, canSeeAll = false, client }) {
    const db = client;
    if (!Array.isArray(rows) || rows.length === 0) return { updated: 0, notFound: [], forbidden: [] };

    const ids = rows.map(r => r.id).filter(Boolean);
    if (ids.length !== rows.length) {
        const err = new Error('every row in a bulk update requires an id');
        err.statusCode = 400;
        throw err;
    }

    // One query establishes existence, ownership AND the NOT NULL backfill for
    // the whole batch. Reading the required columns here is what lets a partial
    // payload through without inventing values for the columns it omits.
    const required = requiredColumns(table);
    const projection = { id: table.id };
    if (ownerColumn) projection.owner = ownerColumn;
    for (const k of required) projection[k] = table[k];

    const existing = await db.select(projection).from(table)
        .where(and(eq(table.orgId, orgId), inArray(table.id, ids)));
    const byId = new Map(existing.map(r => [r.id, r]));

    const notFound = [];
    const forbidden = [];
    const eligible = [];
    for (const row of rows) {
        const prior = byId.get(row.id);
        if (!prior) { notFound.push(row.id); continue; }
        // One policy, shared with assertOwnership. An unassigned row is mutable
        // by anyone; an owned row needs a caller who matches it; a caller with
        // no resolvable name owns nothing and is refused.
        if (!mayMutate({ owner: prior.owner, callerName, canSeeAll })) {
            forbidden.push(row.id); continue;
        }
        eligible.push(row);
    }
    if (eligible.length === 0) return { updated: 0, notFound, forbidden };

    // The SET clause is derived from the columns the CALLER supplied, before any
    // backfill. That is what makes a partial PUT non-destructive (18b13): a
    // column the payload never mentioned is never written.
    const cols = [...new Set(eligible.flatMap(Object.keys))]
        .filter(k => !BULK_IMMUTABLE.has(k) && table[k]?.name);
    const set = Object.fromEntries(cols.map(k => [k, sql`excluded.${sql.identifier(table[k].name)}`]));
    set.updatedAt = sql`now()`;

    // Backfill runs only on the VALUES, never on SET. These columns exist solely
    // so the candidate tuple can be formed; the ON CONFLICT branch discards them.
    const backfill = (row) => {
        const prior = byId.get(row.id);
        const out = { ...row, orgId };
        for (const k of required) {
            if (!(k in out) && prior && prior[k] !== undefined) out[k] = prior[k];
        }
        return out;
    };

    let updated = 0;
    for (let i = 0; i < eligible.length; i += BULK_CHUNK) {
        const chunk = eligible.slice(i, i + BULK_CHUNK).map(backfill);
        const done = await db.insert(table).values(chunk)
            .onConflictDoUpdate({ target: table.id, setWhere: eq(table.orgId, orgId), set })
            .returning({ id: table.id });
        updated += done.length;
    }
    return { updated, notFound, forbidden };
}
