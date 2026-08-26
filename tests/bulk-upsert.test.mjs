// bulkUpsert lived in _lib.mjs, which imports db/index.js (TypeScript), so it ran
// only under `tsx` and never in the gates job. It shipped a 500 that a test would
// have caught in one line:
//
//   `INSERT ... ON CONFLICT DO UPDATE` is an INSERT first. Postgres forms the
//   candidate tuple and checks its constraints BEFORE resolving the conflict, so
//   every NOT NULL column without a default must be present in the values -- even
//   for a row that already exists and will only ever be updated.
//
// Once partial rows correctly stopped sending `pipelineId` (a CSV does not
// describe which pipeline a deal is in), every bulk overwrite died on a NOT NULL
// violation with an opaque "Internal server error".
//
// The two properties in tension are both asserted below, because fixing either
// one alone reintroduces the other bug:
//   - a column the payload omitted must NOT be written  (18b13, data loss)
//   - a NOT NULL column must still reach the INSERT arm (this 500)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bulkUpsert } from '../netlify/functions/_bulk.mjs';

// ── fake table ───────────────────────────────────────────────────────────────
// Mirrors the Drizzle column surface bulkUpsert reads: name, notNull, hasDefault.
const col = (name, opts = {}) => ({ name, notNull: !!opts.notNull, hasDefault: !!opts.hasDefault });
const table = {
    id:               col('id', { notNull: true }),
    orgId:            col('org_id', { notNull: true }),
    pipelineId:       col('pipeline_id', { notNull: true }),   // the one that 500'd
    stage:            col('stage', { notNull: true }),
    opportunityName:  col('opportunity_name'),
    arr:              col('arr'),
    notes:            col('notes'),
    comments:         col('comments', { hasDefault: true }),
    stageHistory:     col('stage_history', { hasDefault: true }),
    ownerId:          col('owner_id'),
    createdAt:        col('created_at', { notNull: true, hasDefault: true }),
    updatedAt:        col('updated_at', { notNull: true, hasDefault: true }),
};

// ── fake db ──────────────────────────────────────────────────────────────────
let stored = [];
let projectionAsked = null;
let insertedChunks = [];
let setClause = null;

const fakeDb = {
    select: (projection) => {
        projectionAsked = Object.keys(projection);
        return {
            from: () => ({
                where: async () => stored.map(r => {
                    const out = {};
                    for (const k of Object.keys(projection)) {
                        // The projection key is ownerId now. It used to be
                        // 'owner', and when the code moved and this did not,
                        // prior.ownerId came back UNDEFINED — which read as
                        // "unassigned" and made every owned row writable. The
                        // mismatch failed OPEN, silently. _bulk.mjs now
                        // distinguishes undefined (column not projected) from
                        // null (genuinely unowned) and throws on the first.
                        out[k] = k === 'ownerId' ? r.ownerId : r[k];
                    }
                    return out;
                }),
            }),
        };
    },
    insert: () => ({
        values: (chunk) => {
            insertedChunks.push(chunk);
            return {
                onConflictDoUpdate: (cfg) => {
                    setClause = Object.keys(cfg.set);
                    return { returning: async () => chunk.map(r => ({ id: r.id })) };
                },
            };
        },
    }),
};

const reset = (rows) => {
    stored = rows;
    projectionAsked = null;
    insertedChunks = [];
    setClause = null;
};

const existingDeal = {
    id: 'o1', orgId: 'org_1', pipelineId: 'pipe_enterprise', stage: 'Qualification',
    opportunityName: 'ZZTest Alpha Renewal', arr: 25000, notes: 'seed',
    comments: [{ text: 'comment survival probe' }], stageHistory: [{ stage: 'Qualification' }],
    salesRep: 'Jeff',
    // Ownership keys on the ID. salesRep stays as the DISPLAY name, and is
    // deliberately a different value from the owner id so that anything still
    // comparing names cannot accidentally agree with the id comparison.
    ownerId: 'usr_jeff',
    // Present so the "do not backfill defaulted columns" assertions have
    // something to catch. A fixture that omits a column cannot prove the code
    // declined to copy it -- it proves only that there was nothing to copy.
    createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-10T00:00:00Z',
};

const call = (rows, extra = {}) =>
    bulkUpsert({ table, rows, orgId: 'org_1', client: fakeDb, ...extra });

// ── the 500 ──────────────────────────────────────────────────────────────────

test('a NOT NULL column omitted by the payload is backfilled from the existing row', async () => {
    reset([existingDeal]);
    await call([{ id: 'o1', stage: 'Proposal', arr: 44000 }]);
    const sent = insertedChunks[0][0];
    // Without this the INSERT arm cannot form a tuple and Postgres 500s.
    assert.equal(sent.pipelineId, 'pipe_enterprise');
});

test('the backfilled value comes from the database, never invented', async () => {
    // sanitize() defaulted this to the string 'default', which would have
    // silently moved every overwritten deal into another pipeline.
    reset([existingDeal]);
    await call([{ id: 'o1', stage: 'Proposal' }]);
    assert.notEqual(insertedChunks[0][0].pipelineId, 'default');
    assert.equal(insertedChunks[0][0].pipelineId, 'pipe_enterprise');
});

test('the existence query asks for the NOT NULL columns it will need', async () => {
    reset([existingDeal]);
    await call([{ id: 'o1', stage: 'Proposal' }]);
    assert.ok(projectionAsked.includes('pipelineId'));
    assert.ok(projectionAsked.includes('id'));
});

test('columns with a database default are not backfilled — the default handles them', async () => {
    reset([existingDeal]);
    await call([{ id: 'o1', stage: 'Proposal' }]);
    const sent = insertedChunks[0][0];
    assert.equal('comments' in sent, false, 'comments has a default; leave it to Postgres');
    assert.equal('createdAt' in sent, false);
    // Over-backfilling is not merely wasteful. Every extra column is a bind
    // parameter against the 65,535 ceiling, and a backfilled jsonb column is one
    // rename away from re-entering the SET clause and wiping the data again.
    assert.equal('updatedAt' in sent, false);
    assert.equal('stageHistory' in sent, false, 'has a default; must not ride along');
});

// ── and the data loss it must not reintroduce ────────────────────────────────

test('a backfilled column is NOT in the SET clause, so the update never writes it', async () => {
    reset([existingDeal]);
    await call([{ id: 'o1', stage: 'Proposal', arr: 44000 }]);
    assert.equal(setClause.includes('pipelineId'), false, 'backfill is for the tuple, not the update');
    assert.deepEqual(setClause.filter(k => k !== 'updatedAt').sort(), ['arr', 'stage']);
});

test('columns the payload omitted are never written', async () => {
    reset([existingDeal]);
    await call([{ id: 'o1', stage: 'Proposal' }]);
    for (const k of ['comments', 'stageHistory', 'notes', 'opportunityName']) {
        assert.equal(setClause.includes(k), false, `${k} must survive an overwrite`);
    }
});

test('updatedAt is always set', async () => {
    reset([existingDeal]);
    await call([{ id: 'o1', stage: 'Proposal' }]);
    assert.ok(setClause.includes('updatedAt'));
});

// ── contract, unchanged ──────────────────────────────────────────────────────

test('an unknown id is reported as notFound and never created', async () => {
    reset([existingDeal]);
    const r = await call([{ id: 'o1', stage: 'Proposal' }, { id: 'ghost', stage: 'Proposal' }]);
    assert.deepEqual(r.notFound, ['ghost']);
    assert.equal(r.updated, 1);
    assert.equal(insertedChunks[0].length, 1, 'the ghost row is not sent to the database');
});

test('a row owned by another rep is forbidden, not silently updated', async () => {
    reset([existingDeal]);
    const r = await call([{ id: 'o1', stage: 'Proposal' }], { ownerColumn: table.ownerId, callerId: 'usr_karen' });
    assert.deepEqual(r.forbidden, ['o1']);
    assert.equal(r.updated, 0);
    assert.equal(insertedChunks.length, 0);
});

// THESE TWO REPLACE ONE TEST THAT CONFLATED THEM, and the conflation was the bug.
//
// It read: `a null callerName may edit everything`, asserting updated === 1 for
// { callerName: null }. bulkUpsert encoded canSeeAll AS a null callerName --
//
//     if (callerName !== null && prior.owner && prior.owner !== callerName)
//
// -- so null carried two opposite meanings: "Admin, skip the check" and "the
// caller could not be identified". The permissive one won. Meanwhile
// _ownership.mjs asserted the opposite for the same input:
//
//     ✔ policy — FAIL CLOSED when the caller has no resolvable name
//
// Both suites were green. Nothing compared them, because the rule lived in two
// files and neither knew the other existed. The identity split made the second
// state reachable -- an unlinked user resolves to no name -- and an integration
// test caught a rep bulk-overwriting rows owned by someone else.
//
// So: two states, two tests, and canSeeAll is now an explicit parameter.
// The pairing is the point. Closing the fail-open path is trivial if you are
// willing to refuse Admins too; the first test is what proves the bypass still
// works, and the second is what proves it is not the default.

test('canSeeAll edits everything, including rows owned by others', async () => {
    reset([existingDeal]);
    const r = await call([{ id: 'o1', stage: 'Proposal' }], {
        ownerColumn: table.ownerId, callerId: null, canSeeAll: true,
    });
    assert.equal(r.updated, 1, 'an Admin must still bypass ownership on the bulk path');
    assert.deepEqual(r.forbidden, []);
});

test('SECURITY: a null callerName without canSeeAll may edit NOTHING it does not own', async () => {
    reset([existingDeal]);
    const r = await call([{ id: 'o1', stage: 'Proposal' }], {
        ownerColumn: table.ownerId, callerId: null, canSeeAll: false,
    });
    assert.equal(r.updated, 0, 'an unidentifiable caller owns nothing and must be refused');
    assert.deepEqual(r.forbidden, ['o1'], 'and the refusal must be REPORTED, not silent');
});

test('canSeeAll defaults to false, so a caller that forgets it fails CLOSED', async () => {
    // The default direction is the whole safety argument. A caller that omits
    // canSeeAll refuses Admins -- visible and annoying. The other default
    // authorizes everyone -- silent and unbounded.
    reset([existingDeal]);
    const r = await call([{ id: 'o1', stage: 'Proposal' }], {
        ownerColumn: table.ownerId, callerId: null,
    });
    assert.equal(r.updated, 0);
    assert.deepEqual(r.forbidden, ['o1']);
});

test('every row must carry an id', async () => {
    reset([existingDeal]);
    await assert.rejects(() => call([{ stage: 'Proposal' }]), /requires an id/);
});

test('an empty batch issues no query', async () => {
    reset([existingDeal]);
    const r = await call([]);
    assert.deepEqual(r, { updated: 0, notFound: [], forbidden: [] });
    assert.equal(insertedChunks.length, 0);
});

test('1,000 rows go out in chunks of 400', async () => {
    const many = Array.from({ length: 1000 }, (_, i) => ({ ...existingDeal, id: `o${i}` }));
    reset(many);
    await call(many.map(r => ({ id: r.id, stage: 'Proposal' })));
    assert.deepEqual(insertedChunks.map(c => c.length), [400, 400, 200]);
});

// ── REGRESSION ───────────────────────────────────────────────────────────────

test('REGRESSION: the exact CSV overwrite that 500\'d now forms a valid tuple and writes only CSV columns', async () => {
    reset([existingDeal]);
    const r = await call([{
        id: 'o1',
        opportunityName: 'ZZTest Alpha Renewal',
        stage: 'Proposal',
        arr: 44000,
        notes: 'OVERWRITTEN - stage and ARR changed',
    }]);

    const sent = insertedChunks[0][0];
    // Every NOT NULL column without a default is present, so no constraint fires.
    for (const k of Object.keys(table)) {
        if (table[k].notNull && !table[k].hasDefault && k !== 'orgId') {
            assert.ok(k in sent, `${k} is NOT NULL and must reach the INSERT arm`);
        }
    }
    assert.equal(sent.orgId, 'org_1');
    // And the deal's history survives, because it is not in the SET clause.
    assert.equal(setClause.includes('comments'), false);
    assert.equal(setClause.includes('stageHistory'), false);
    assert.equal(r.updated, 1);
});
