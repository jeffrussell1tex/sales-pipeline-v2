// The receipt exists because the importer's Results screen used to recover its
// numbers by regex-parsing a thrown error message, so a message reading "2 of 3
// new companies failed to save" on a 5-contact import rendered "1 of 5 records
// saved" — both numbers wrong, in the reassuring direction (guide 18b15).
//
// These tests pin the arithmetic and, more importantly, the DIRECTION: numbers
// become prose and never the reverse. The regression test at the bottom is the
// original defect, expressed as an assertion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    emptyReceipt, mergeReceipts, receiptFromInsert, receiptFromUpdate,
    receiptFromPreflight, isClean, isPartial, describeReceipt,
    ImportError, receiptFromError,
} from '../src/utils/importReceipt.js';

const invariant = (r) => assert.equal(
    r.attempted, r.created + r.updated + r.failed,
    `attempted (${r.attempted}) must equal created+updated+failed (${r.created}+${r.updated}+${r.failed})`
);

// ── builders ─────────────────────────────────────────────────────────────────

test('a clean insert accounts for every row', () => {
    const r = receiptFromInsert({ attempted: 100, landed: Array(100).fill({}) });
    assert.equal(r.created, 100);
    assert.equal(r.failed, 0);
    invariant(r);
    assert.ok(isClean(r));
});

test('rows in chunks never sent still count as failed', () => {
    // postNew stops at the first failing chunk. The old code reported only
    // failed.length, so 1,100 unsent rows vanished from the total.
    const r = receiptFromInsert({ attempted: 1500, landed: Array(400).fill({}), error: 'db timeout' });
    assert.equal(r.created, 400);
    assert.equal(r.failed, 1100, 'the 1,100 rows never sent are still a shortfall');
    invariant(r);
});

test('an update records its reasons as a breakdown of failed, not as additions', () => {
    const r = receiptFromUpdate({ attempted: 10, updated: 7, notFound: ['a', 'b'], forbidden: ['c'] });
    assert.equal(r.updated, 7);
    assert.equal(r.failed, 3);
    assert.equal(r.notFound, 2);
    assert.equal(r.forbidden, 1);
    invariant(r);
});

test('skipped and dropped sit outside the attempted invariant', () => {
    // Neither was ever sent. Folding them into `failed` is how "6 rows in, 0 out"
    // came to render as success.
    const r = receiptFromPreflight({ skipped: 4, dropped: 6 });
    assert.equal(r.attempted, 0);
    assert.equal(r.failed, 0);
    invariant(r);
});

// ── merge ────────────────────────────────────────────────────────────────────

test('merging the phases of one import sums the counts', () => {
    const r = mergeReceipts(
        receiptFromPreflight({ skipped: 2, dropped: 1 }),
        receiptFromInsert({ attempted: 10, landed: Array(10).fill({}) }),
        receiptFromUpdate({ attempted: 5, updated: 5 }),
    );
    assert.equal(r.created, 10);
    assert.equal(r.updated, 5);
    assert.equal(r.skipped, 2);
    assert.equal(r.dropped, 1);
    assert.equal(r.attempted, 15);
    invariant(r);
});

test('the first error wins, because later phases never ran', () => {
    const r = mergeReceipts(
        receiptFromInsert({ attempted: 3, landed: [], error: 'accounts failed' }),
        receiptFromUpdate({ attempted: 0, updated: 0, error: 'second' }),
    );
    assert.equal(r.error, 'accounts failed');
});

test('merging nothing, or holes, yields an empty receipt rather than NaN', () => {
    const r = mergeReceipts(null, undefined, emptyReceipt());
    assert.deepEqual(r, emptyReceipt());
    invariant(r);
});

// ── predicates ───────────────────────────────────────────────────────────────

test('dropped rows make an import not clean', () => {
    // The whole point. Six rows in, zero out, no error thrown — the old modal
    // called this success and showed a green tick.
    const r = mergeReceipts(receiptFromPreflight({ dropped: 6 }), receiptFromInsert({ attempted: 0, landed: [] }));
    assert.equal(isClean(r), false);
});

test('skipped duplicates alone are still a clean import', () => {
    const r = mergeReceipts(receiptFromPreflight({ skipped: 6 }), receiptFromInsert({ attempted: 4, landed: Array(4).fill({}) }));
    assert.ok(isClean(r), 'the user chose to skip these; nothing went wrong');
});

test('partial means something landed AND something did not', () => {
    const all  = receiptFromInsert({ attempted: 5, landed: Array(5).fill({}) });
    const some = receiptFromInsert({ attempted: 5, landed: Array(2).fill({}), error: 'boom' });
    const none = receiptFromInsert({ attempted: 5, landed: [], error: 'boom' });
    assert.equal(isPartial(all), false);
    assert.equal(isPartial(some), true);
    assert.equal(isPartial(none), false, 'nothing landed — that is a failure, not a partial');
});

// ── prose is terminal ────────────────────────────────────────────────────────

test('describeReceipt names both what saved and what did not', () => {
    const r = receiptFromUpdate({ attempted: 10, updated: 7, notFound: ['a', 'b'], forbidden: ['c'] });
    const s = describeReceipt(r, 'contact');
    assert.match(s, /7 overwritten/);
    assert.match(s, /3 did not save/);
    assert.match(s, /2 no longer exist/);
    assert.match(s, /1 owned by another rep/);
});

test('describeReceipt says so plainly when nothing was saved', () => {
    const r = mergeReceipts(receiptFromPreflight({ dropped: 6 }));
    assert.match(describeReceipt(r), /Nothing was saved/);
    assert.match(describeReceipt(r), /required fields were empty/);
});

test('singular and plural both read correctly', () => {
    assert.match(describeReceipt(receiptFromInsert({ attempted: 1, landed: [{}] }), 'contact'), /1 contact created/);
    assert.match(describeReceipt(receiptFromInsert({ attempted: 2, landed: [{}, {}] }), 'contact'), /2 contacts created/);
});

// ── the error carries fields, not a sentence ─────────────────────────────────

test('ImportError carries the receipt so nothing has to parse its message', () => {
    const r = receiptFromUpdate({ attempted: 10, updated: 7, notFound: ['a', 'b', 'c'] });
    const err = new ImportError(r, 'account');
    assert.equal(receiptFromError(err), r);
    assert.equal(receiptFromError(err).updated, 7);
    assert.equal(receiptFromError(err).failed, 3);
    assert.ok(err instanceof Error);
    assert.ok(err.message.length > 0, 'a message still exists for the console');
});

test('an ordinary error yields no receipt, so a bug is not rendered as a counted partial', () => {
    assert.equal(receiptFromError(new TypeError('x is not a function')), null);
    assert.equal(receiptFromError(undefined), null);
    assert.equal(receiptFromError({ receipt: 'not an object' }), null);
});

// ── REGRESSION ───────────────────────────────────────────────────────────────

test('REGRESSION: a 5-contact import whose accounts phase fails reports 5, not 3', () => {
    // The original defect. The accounts phase threw "2 of 3 new companies failed
    // to save"; the modal regexed (\d+) of (\d+) out of it and rendered
    // "1 of 5 records saved" — a number describing companies, presented as
    // contacts, on a total it did not come from.
    const receipt = mergeReceipts(
        receiptFromInsert({ attempted: 3, landed: [{}], error: null }),   // companies: 1 of 3 landed
        receiptFromPreflight({}),                                          // contacts phase never ran
    );
    const err = new ImportError(receipt, 'company');
    const got = receiptFromError(err);

    assert.equal(got.created, 1);
    assert.equal(got.failed, 2);
    assert.equal(got.attempted, 3, 'the total describes companies, and says so');

    // And the numbers are not recoverable-by-accident from the message: whatever
    // the wording, the caller reads fields.
    assert.equal(got.created + got.failed, got.attempted);
});
