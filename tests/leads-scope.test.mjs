// The Mine scope on Leads is STRICTLY owned-by-me (Jeff's call, 1 Sep, made
// on the first rep-path browser pass): `!!l.ownerId && l.ownerId === currentUserId`.
//
// Two ways this dies silently, both pinned here as source assertions because
// the rule lives in client code the mutation harness can only see through a
// unit suite (§18b23):
//
//   1. The filter reverts to the pre-1-Sep shape (`!l.ownerId ||`), which
//      folded UNASSIGNED rows into Mine and made Mine identical to All in an
//      org where no other rep owns anything — the finding of that first pass.
//   2. The `!!l.ownerId` null-guard is dropped (§18b22): during the ?me=true
//      load window currentUserId is null, and a bare `l.ownerId ===
//      currentUserId` hands every unassigned row to the null caller via
//      null === null.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/Tabs/LeadsTab.jsx', import.meta.url), 'utf8');

test('Mine scope is strictly owned-by-me, with the 18b22 null-guard, exactly once', () => {
    const strict = src.split('.filter(l => !!l.ownerId && l.ownerId === currentUserId)').length - 1;
    assert.equal(strict, 1, 'the Mine filter must be `!!l.ownerId && l.ownerId === currentUserId`, exactly once');
});

test('the permissive pre-1-Sep Mine shape (unassigned folded in) must not return', () => {
    assert.equal(src.includes('!l.ownerId || l.ownerId === currentUserId'), false,
        'Mine must not include unassigned rows — they live under All, the Unassigned chip and the triage lane');
});

test('the Mine filter never keys on the display name (§18b22)', () => {
    assert.equal(src.includes('l.assignee === currentUser'), false,
        'scope must key on ownerId, never on assignee — two users sharing a name must not share a scope');
});
