// bulkInsert is the INSERT half of 18b8, and every property that makes it safe is
// invisible from the outside: you cannot tell a chunked insert from a single
// statement by looking at the response. So the fake db below records every
// statement issued, and these tests assert on the SHAPE of the traffic — how many
// statements, how large, and which rows were isolated.
//
// The behaviour being pinned is the one that shipped broken: one statement for
// every row in the import, so a 2,000-row file blew the 65,535 bind-parameter
// ceiling, and a single malformed row rolled back the entire import with nothing
// saved and no indication of which row was at fault.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── fake db ──────────────────────────────────────────────────────────────────
// db.insert(table).values(rows).returning({...}) — the exact chain bulkInsert
// uses. `reject` decides which rows are "bad"; a statement containing any bad row
// throws, exactly as Postgres would.
const statements = [];
let isBadRow = () => false;
let delayPerStatement = 0;
let clock = 0;

const fakeDb = {
    insert: () => ({
        values: (rows) => ({
            returning: async () => {
                statements.push(rows.map(r => r.id));
                clock += delayPerStatement;
                const bad = rows.find(isBadRow);
                if (bad) throw new Error(`value too long for type character varying(255)\nrow id ${bad.id}`);
                return rows.map(r => ({ id: r.id }));
            },
        }),
    }),
};

const reset = () => { statements.length = 0; isBadRow = () => false; delayPerStatement = 0; clock = 0; };

// bulkInsert takes an optional `client`, so the recording stub goes in through the
// front door — no module mocks, no --experimental flag, and this file runs under
// the same plain `node --test` as every other suite.
//
// The deadline is wall-clock, so Date.now is advanced by the stub rather than by
// real sleeping: the timeout case must be provable in milliseconds, or it will not
// be tested at all. node --test gives each file its own process, so this override
// cannot leak into another suite.
const realNow = Date.now;
Date.now = () => realNow() + clock;

const { bulkInsert } = await import('../netlify/functions/_bulk.mjs');

const rows = (n, prefix = 'r') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, name: `Row ${i}` }));
const table = { id: 'id' };
const insert = (extra = {}) => ({ table, orgId: 'org_1', client: fakeDb, ...extra });

// ── chunking ─────────────────────────────────────────────────────────────────

test('1,500 rows go out in chunks of 400, not one statement', async () => {
    reset();
    const r = await bulkInsert(insert({ rows: rows(1500) }));
    assert.equal(r.inserted, 1500);
    assert.equal(statements.length, 4);                       // 400+400+400+300
    assert.equal(Math.max(...statements.map(s => s.length)), 400);
});

test('no chunk can exceed the bind-parameter ceiling', async () => {
    // 400 rows x 37 columns = 14,800 binds against a 65,535 limit. The old code
    // sent every row in one statement, which broke above ~1,872 accounts.
    reset();
    await bulkInsert(insert({ rows: rows(5000) }));
    const worstCase = Math.max(...statements.map(s => s.length)) * 37;
    assert.ok(worstCase < 65535, `${worstCase} binds in one statement`);
});

test('an empty array does no work at all', async () => {
    reset();
    const r = await bulkInsert(insert({ rows: [] }));
    assert.deepEqual(r, { inserted: 0, insertedIds: [], failed: [], timedOut: false });
    assert.equal(statements.length, 0);
});

// ── isolation ────────────────────────────────────────────────────────────────

test('one bad row does not discard the import', async () => {
    // THE regression. Previously: one statement, one bad row, zero rows saved.
    reset();
    isBadRow = (r) => r.id === 'r250';
    const result = await bulkInsert(insert({ rows: rows(400) }));
    assert.equal(result.inserted, 399);
    assert.deepEqual(result.failed.map(f => f.id), ['r250']);
    assert.ok(!result.insertedIds.includes('r250'));
});

test('isolation bisects — 400 rows costs ~9 retries, not 400', async () => {
    // Row-by-row fallback would be 400 round-trips at ~30ms = 12s, past the 10s
    // Netlify timeout: the "safe" fallback would itself have been the outage.
    reset();
    isBadRow = (r) => r.id === 'r250';
    await bulkInsert(insert({ rows: rows(400) }));
    assert.ok(statements.length <= 20, `${statements.length} statements — bisection is not engaging`);
    assert.ok(statements.length >= 10, 'expected the failed chunk to be split, not retried whole');
});

test('the failing row is reported by id and its message truncated to one line', async () => {
    reset();
    isBadRow = (r) => r.id === 'r3';
    const result = await bulkInsert(insert({ rows: rows(10) }));
    const [f] = result.failed;
    assert.equal(f.id, 'r3');
    assert.doesNotMatch(f.error, /\n/);
    assert.ok(f.error.length <= 200);
});

test('several bad rows are each isolated', async () => {
    reset();
    isBadRow = (r) => ['r5', 'r60', 'r399'].includes(r.id);
    const result = await bulkInsert(insert({ rows: rows(400) }));
    assert.equal(result.inserted, 397);
    assert.deepEqual(result.failed.map(f => f.id).sort(), ['r399', 'r5', 'r60']);
});

// ── deadline ─────────────────────────────────────────────────────────────────

test('the deadline caps the work and reports the remainder honestly', async () => {
    // A partial result naming the rows that did not land beats a 502 that says
    // nothing about what was written.
    reset();
    delayPerStatement = 3000;
    const result = await bulkInsert(insert({ rows: rows(1500), budgetMs: 5000 }));
    assert.equal(result.timedOut, true);
    assert.ok(result.inserted > 0, 'work that completed should still be reported');
    assert.equal(result.inserted + result.failed.length, 1500, 'every row is accounted for');
    assert.match(result.failed.at(-1).error, /time budget/i);
});

// ── tenancy ──────────────────────────────────────────────────────────────────

test('orgId is stamped by the server and cannot be supplied by the caller', async () => {
    reset();
    let seen = null;
    const spy = {
        insert: () => ({ values: (r) => ({ returning: async () => { seen = r; return r.map(x => ({ id: x.id })); } }) }),
    };
    await bulkInsert({ table, rows: [{ id: 'a', orgId: 'org_ATTACKER' }], orgId: 'org_MINE', client: spy });
    assert.equal(seen[0].orgId, 'org_MINE');
});
