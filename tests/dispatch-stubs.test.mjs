// tests/dispatch-stubs.test.mjs
//
// Two dispatch buttons rendered and did nothing (state §9 "Unwired stubs", closed
// in §0.109): "Manual pick" in the crew builder and "Test auto-create" in the
// job-templates panel. A control that reads as an action and silently is not one
// is the "renders and does nothing" class the scanners cannot see; both are gone,
// and the copy that pointed at Manual pick with it. These scans keep them gone
// until the feature behind either is actually built.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

test('DispatchTab: no inert "Manual pick" button, and no copy telling the user to click it', () => {
    const s = code(read('src/Tabs/DispatchTab.jsx'));
    assert.ok(!s.includes('Manual pick'), 'DispatchTab still carries "Manual pick"');
    assert.ok(s.includes('distance from job, and customer preference.'), 'the scoring explanation stays');
    // §9 "Priority vocabulary normalization" asked for the dual-accept alias to
    // be collapsed in its own commit once the vocabulary was one; it is.
    assert.ok(!s.includes('prioColor2'), 'the prioColor2 alias is collapsed — one priority colour map');
});

test('DispatchJobTemplatesDetail: no inert "Test auto-create" button', () => {
    const s = code(read('src/Tabs/settings/dispatch/DispatchJobTemplatesDetail.jsx'));
    assert.ok(!s.includes('Test auto-create'), 'DispatchJobTemplatesDetail still carries "Test auto-create"');
    assert.ok(s.includes('extraActions={'), 'the New template action is still offered');
});
