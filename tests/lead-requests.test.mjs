// Source assertions for lead-requests.mjs (§0.58) — the claims the mutation
// harness needs visible from a unit suite (§18b23). Behavior is proven by the
// twelve tests in tests/integration/lead-requests.itest.mjs; these pin the
// three lines whose silent loss would matter most, because the harness runs
// only `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../netlify/functions/lead-requests.mjs', import.meta.url), 'utf8');
// Comments narrate these rules at length and must not satisfy the scans.
const code = src.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');

test('approve/deny is role-gated to Admin/Manager, and the gate is returned', () => {
    assert.ok(code.includes("requireRole(auth, ['Admin', 'Manager'], headers)"),
        'the PUT resolve path must be Admin/Manager-only');
    assert.ok(code.includes('if (forbiddenRole) return forbiddenRole;'),
        'a computed gate that is never returned enforces nothing');
});

test('requesterId is stamped from the CALLER — the payload\'s requesterId is never read', () => {
    assert.ok(code.includes('requesterId: callerId,'),
        'the insert must stamp getCallerId(), the same rule that keeps ownerId honest');
    assert.equal(code.includes('data.requesterId'), false,
        'a client-supplied requester is how one rep files requests as another');
});

test('approve assigns BOTH halves of ownership from the requester row', () => {
    assert.ok(code.includes('.set({ ownerId: requester.id, assignedTo: requester.name,'),
        'the owner id and the display name must move together — a label without an owner is the §0.58 spoof shape');
});
