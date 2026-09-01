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

// ── Auto-assign all is role-gated ────────────────────────────────────────────
// Found by Karen's rep-path pass (1 Sep): the button rendered for a rep. When
// this gate landed the server still honored each individual PUT (reps could
// edit unassigned rows — claiming), so the client gate was the ONLY gate.
// Since §0.58 the server refuses rep ownership writes too (below); this button
// gate remains as the UX half — a rep must not be offered a control whose
// every click the server will now 403.

test('the Auto-assign all button is gated on canDistribute, exactly once', () => {
    const gated = src.split('{canDistribute && (').length - 1;
    assert.equal(gated, 1, 'mass distribution renders only for Admin/Manager (canSeeAll)');
    assert.equal(src.includes('canDistribute={canSeeAll}'), true,
        'the gate must key on the shared canSeeAll predicate, not a re-derived role check');
});

// ── Assignment is a MANAGED action on the SERVER (§0.58, 2 Sep) ──────────────
// Jeff's call: only Admin/Manager change lead ownership — reps do not assign,
// not even to themselves; claiming goes through the request flow. The gate
// lives in leads.mjs PUT between ownerIdForUpdate and the merge, and it denies
// on EITHER half changing: the resolved owner id, or the display-name string
// (the string half is what catches a label that resolves to nobody on an
// unassigned row — null === null on the id side while the lead is made to
// LOOK assigned). Behavior is proven by seven tests in
// tests/integration/leads.itest.mjs; these source assertions exist so the
// mutation harness (unit suites only) sees the gate too.

const leadsSrc = readFileSync(new URL('../netlify/functions/leads.mjs', import.meta.url), 'utf8');

test('the server assignment gate exists, role-scoped, exactly once', () => {
    const gate = leadsSrc.split('if (ownPut.change && !canSeeAll(userRole))').length - 1;
    assert.equal(gate, 1, 'leads.mjs PUT must refuse ownership changes from non-canSeeAll callers');
});

test('the server gate compares BOTH halves — owner id and display-name string', () => {
    assert.equal(leadsSrc.includes('if (!sameOwner || !sameName)'), true,
        'dropping the string half re-opens the display-name spoof on unassigned rows (null === null on the id side)');
});

test('the CREATE gate exists — a rep may not name someone else on POST', () => {
    const gate = leadsSrc.split('if (!canSeeAll(userRole) && suppliedNamePost)').length - 1;
    assert.equal(gate, 1, 'the single POST must refuse a non-canSeeAll caller naming anyone but themselves');
});

test('the explicit-blank pool seed is canSeeAll-only and mention-keyed', () => {
    assert.equal(leadsSrc.includes("canSeeAll(userRole) && ('assignedTo' in data)"), true,
        'an ABSENT key must keep caller-owns-what-they-create; only a canSeeAll caller\'s PRESENT-and-blank key seeds the pool');
});
