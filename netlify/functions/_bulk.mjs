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

