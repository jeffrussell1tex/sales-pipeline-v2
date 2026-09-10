// tests/job-editor-save.test.mjs
//
// Saving a job with no category (state §0.113). Jeff set a preferred start
// time and Save answered "Internal server error". Bisected field by field in
// the pane: the start time was innocent — `jobType: null` and `trade: null`
// each 500 alone. Both columns are NOT NULL (defaults 'hvac'/'repair'); the
// create path writes '' for "— None —", but the Jobs editor's save sent null,
// so ANY job without a category could not be saved from the editor. Now the
// server coerces a null to '' on the dispatcher PUT (matching create) and the
// editor sends '' in the first place. The behaviour itself is proved against
// the test database in tests/integration/customer-notify.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

test('dispatcher PUT: a null trade or jobType becomes the empty string the column accepts', () => {
    const f = code(read('netlify/functions/dispatch-jobs.mjs'));
    assert.ok(f.includes("            scalarFields.forEach(f => { if (f in data) updates[f] = data[f]; });\n            for (const f of ['trade', 'jobType']) if (f in data && data[f] == null) updates[f] = '';"),
        'the coercion runs right after the scalar copy, on the dispatcher path');
    assert.ok(f.includes("                trade:            data.trade            ?? '',"), 'create already wrote the empty string');
});

test('the Jobs editor sends the empty string for "— None —", never null', () => {
    const s = code(read('src/Tabs/DispatchTab.jsx'));
    assert.ok(s.includes("                    jobType:         draft.jobType || '',"));
    assert.ok(s.includes("                    trade:           draft.trade   || '',"));
    assert.ok(!s.includes('jobType:         draft.jobType || null,'));
});
