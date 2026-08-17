// bulkClient is the client half of 18b8, and — exactly like bulkInsert — every
// property that makes it correct is invisible from the outside. You cannot tell a
// chunked PUT from a single one by looking at the return value, and you cannot
// tell "accumulated across chunks" from "threw on the first failure" without
// watching the traffic. So the fake fetch below records every request issued, and
// these tests assert on the SHAPE of the traffic.
//
// The behaviours being pinned are the ones that shipped broken:
//   - saveBulk threw from inside its own loop, discarding the counts from chunks
//     that had already been written server-side (18b15 forbids this for postNew;
//     it was live in the PUT half)
//   - the opportunities overwrite path bypassed chunking entirely, sending one
//     request for the whole file and reading the body only on failure, so
//     `updated`, `notFound` and `forbidden` were discarded and an overwrite that
//     matched zero ids rendered as success
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBulkClient, BULK_CHUNK } from '../src/utils/bulkClient.js';

// ── fake fetch ───────────────────────────────────────────────────────────────
// Records each request and replays a queued response. A response is
// { ok, status, body } and the queue is consumed in order; when it runs out the
// default responder answers.
const requests = [];
let queue = [];
let responder = null;

const fakeFetch = async (url, options) => {
    const rows = JSON.parse(options.body);
    requests.push({ url, method: options.method, ids: rows.map(r => r.id), size: rows.length });
    const spec = queue.length ? queue.shift() : responder(rows);
    return {
        ok: spec.ok !== false,
        status: spec.status || (spec.ok === false ? 500 : 200),
        json: async () => {
            if (spec.nonJson) throw new SyntaxError('Unexpected token < in JSON');
            return spec.body;
        },
    };
};

const reset = (defaultResponder) => {
    requests.length = 0;
    queue = [];
    responder = defaultResponder;
};

const rows = (n, prefix = 'r') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, name: `Row ${i}` }));

// Server behaviours worth naming.
const insertsAll   = (sent) => ({ body: { insertedIds: sent.map(r => r.id) } });
const updatesAll   = (sent) => ({ body: { updated: sent.length, notFound: [], forbidden: [] } });

const client = () => makeBulkClient(fakeFetch);

// ── construction ─────────────────────────────────────────────────────────────

test('makeBulkClient refuses a non-function fetch rather than failing at the first request', () => {
    assert.throws(() => makeBulkClient(undefined), TypeError);
    assert.throws(() => makeBulkClient({ post: true }), TypeError);
});

// ── chunking ─────────────────────────────────────────────────────────────────

test('putBulk sends 1,000 overwrites as 3 chunks of at most 400, not one request', async () => {
    reset(updatesAll);
    await client().putBulk('/x', rows(1000));
    assert.equal(requests.length, 3);
    assert.deepEqual(requests.map(r => r.size), [400, 400, 200]);
    assert.ok(requests.every(r => r.size <= BULK_CHUNK));
});

test('postNew sends 1,000 new records as 3 chunks of at most 400', async () => {
    reset(insertsAll);
    await client().postNew('/x', rows(1000));
    assert.equal(requests.length, 3);
    assert.deepEqual(requests.map(r => r.size), [400, 400, 200]);
});

test('an empty list issues no request at all', async () => {
    reset(updatesAll);
    const r = await client().putBulk('/x', []);
    assert.equal(requests.length, 0);
    assert.equal(r.attempted, 0);
    assert.equal(r.updated, 0);
});

// ── never throw, and keep what already landed ────────────────────────────────

test('putBulk does not throw when a middle chunk fails, and keeps the earlier chunks', async () => {
    reset(updatesAll);
    queue = [
        { body: { updated: 400, notFound: [], forbidden: [] } },
        { ok: false, status: 500, body: { error: 'db timeout', requestId: 'req_9' } },
    ];
    const r = await client().putBulk('/x', rows(1000));

    // The counts from chunk 1 survive — those rows are already written.
    assert.equal(r.updated, 400);
    assert.equal(r.appliedIds.length, 400);
    // Chunk 3 was never sent, so it stopped rather than continuing blindly.
    assert.equal(requests.length, 2);
    // attempted is the caller's whole list, so the shortfall is honest: 600, not 400.
    assert.equal(r.attempted, 1000);
    assert.match(r.error, /db timeout/);
    assert.match(r.error, /req_9/, 'requestId must reach the message so the function log is findable');
});

test('postNew does not throw when a middle chunk fails, and keeps the earlier chunks', async () => {
    reset(insertsAll);
    queue = [
        { body: { insertedIds: rows(400).map(r => r.id) } },
        { ok: false, status: 503, body: { error: 'upstream unavailable' } },
    ];
    const r = await client().postNew('/x', rows(1000));
    assert.equal(r.landed.length, 400);
    assert.equal(r.attempted, 1000);
    assert.match(r.error, /upstream unavailable/);
});

test('a non-JSON error body does not become an exception', async () => {
    reset(updatesAll);
    queue = [{ ok: false, status: 502, nonJson: true }];
    const r = await client().putBulk('/x', rows(10));
    assert.match(r.error, /502/);
    assert.equal(r.updated, 0);
});

// ── appliedIds: the ids the server actually accepted ─────────────────────────

test('appliedIds excludes notFound and forbidden ids', async () => {
    reset(() => ({ body: { updated: 3, notFound: ['r1'], forbidden: ['r4'] } }));
    const r = await client().putBulk('/x', rows(5));
    assert.deepEqual(r.appliedIds, ['r0', 'r2', 'r3']);
    assert.equal(r.notFound.length, 1);
    assert.equal(r.forbidden.length, 1);
    assert.equal(r.updated, 3);
});

test('every id rejected means nothing is applied and nothing is reported as updated', async () => {
    reset((sent) => ({ body: { updated: 0, notFound: sent.map(r => r.id), forbidden: [] } }));
    const r = await client().putBulk('/x', rows(5));
    assert.deepEqual(r.appliedIds, []);
    assert.equal(r.updated, 0);
    assert.equal(r.attempted, 5);
    // This is the case the opportunities path used to render as "3 overwritten".
    assert.equal(r.attempted - r.updated, 5);
});

test('a chunk whose count disagrees with its own id lists is excluded, not guessed at', async () => {
    // Server says 5 updated but names one as notFound — the two cannot both be
    // true for a 5-row chunk. Applying 4 ids would be a guess.
    reset(() => ({ body: { updated: 5, notFound: ['r1'], forbidden: [] } }));
    const r = await client().putBulk('/x', rows(5));
    assert.deepEqual(r.appliedIds, [], 'an inconsistent chunk contributes no ids');
    assert.equal(r.discrepancy, 1);
});

test('a discrepancy in one chunk does not poison the others', async () => {
    reset(updatesAll);
    queue = [
        { body: { updated: 400, notFound: [], forbidden: [] } },
        { body: { updated: 999, notFound: [], forbidden: [] } },   // nonsense
        { body: { updated: 200, notFound: [], forbidden: [] } },
    ];
    const r = await client().putBulk('/x', rows(1000));
    assert.equal(r.appliedIds.length, 600, 'chunks 1 and 3 still apply');
    assert.ok(r.discrepancy > 0);
    assert.equal(r.error, null, 'a discrepancy is not a transport failure');
});

test('a server that omits notFound/forbidden entirely is treated as all-applied', async () => {
    // Older deploy, or an endpoint that returns only a count.
    reset((sent) => ({ body: { updated: sent.length } }));
    const r = await client().putBulk('/x', rows(3));
    assert.deepEqual(r.appliedIds, ['r0', 'r1', 'r2']);
    assert.equal(r.discrepancy, 0);
});

// ── postNew id partitioning ──────────────────────────────────────────────────

test('postNew partitions by insertedIds, not by count', async () => {
    // r1 and r3 did not insert. A count-based fallback would wrongly claim the
    // FIRST two landed; the ids say otherwise.
    reset(() => ({ body: { insertedIds: ['r0', 'r2', 'r4'] } }));
    const r = await client().postNew('/x', rows(5));
    assert.deepEqual(r.landed.map(x => x.id), ['r0', 'r2', 'r4']);
    assert.deepEqual(r.failed.map(x => x.id), ['r1', 'r3']);
});

test('postNew falls back to the count when a deploy predates insertedIds', async () => {
    reset(() => ({ body: { inserted: 2 } }));
    const r = await client().postNew('/x', rows(3));
    assert.equal(r.landed.length, 2);
    assert.equal(r.failed.length, 1);
});

// ── progress ─────────────────────────────────────────────────────────────────

test('progress is reported per chunk against the caller-supplied total, with an offset', async () => {
    reset(updatesAll);
    const seen = [];
    await client().putBulk('/x', rows(900), {
        onProgress: (done, total) => seen.push([done, total]),
        progressOffset: 100,
        progressTotal: 1000,
    });
    assert.deepEqual(seen, [[500, 1000], [900, 1000], [1000, 1000]]);
});

test('a failing chunk stops reporting progress rather than reporting completion', async () => {
    reset(updatesAll);
    queue = [
        { body: { updated: 400, notFound: [], forbidden: [] } },
        { ok: false, status: 500, body: { error: 'boom' } },
    ];
    const seen = [];
    await client().putBulk('/x', rows(1000), { onProgress: (d, t) => seen.push([d, t]) });
    assert.deepEqual(seen, [[400, 1000]], 'progress must not tick for a chunk that failed');
});

// ── method ───────────────────────────────────────────────────────────────────

test('postNew POSTs and putBulk PUTs', async () => {
    reset(insertsAll);
    await client().postNew('/x', rows(1));
    assert.equal(requests[0].method, 'POST');
    reset(updatesAll);
    await client().putBulk('/x', rows(1));
    assert.equal(requests[0].method, 'PUT');
});
