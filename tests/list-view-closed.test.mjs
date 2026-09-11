// tests/list-view-closed.test.mjs
//
// Jeff (11 Sep): "I marked an opp won. Filtered by won deals only and it
// returned nothing in the list." The Filter popover offers Closed Won and
// Closed Lost, the tab's own filter kept the six won deals ("Showing 6 of 6",
// "$1.0M total pipeline"), and ListView then dropped every closed deal itself
// ("Exclude closed deals (same as other views)" — since 740cac7, 27 Apr), so
// the list read "No deals match the current filter." The tab decides what the
// list shows: its "All open" default already excludes closed deals when no
// stage filter is set. Source scans (§18b23).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

test('ListView shows the deals the tab handed it — no closed-stage filter of its own', () => {
    const s = code(read('src/components/ListView.jsx'));
    assert.ok(s.includes('    const listOpps = pipelineFilteredOpps;'), 'the list is the filtered set, closed deals included when the filter asked for them');
    assert.ok(!s.includes("!['Closed Won', 'Closed Lost'].includes(o.stage)"), 'the unconditional drop is gone');
    assert.ok(s.includes('    const groups = groupByQuarter(listOpps, fiscalStart);'));
    assert.ok(s.includes('    if (listOpps.length === 0) {'), 'the empty state keys on the same set');
});

test('the tab still hides closed deals by default, and only by default', () => {
    const s = code(read('src/Tabs/PipelineTab.jsx'));
    assert.ok(s.includes("            if (smartPreset === null && pipelineStageFilter.length === 0) {\n                return opp.stage !== 'Closed Won' && opp.stage !== 'Closed Lost';\n            }"),
        '"All open" with no stage filter excludes closed deals — the default the list used to duplicate');
    assert.ok(s.includes("            if (pipelineStageFilter.includes('__allOpen__')) return opp.stage !== 'Closed Won' && opp.stage !== 'Closed Lost';"));
    assert.ok(s.includes('<option value="Closed Won">Closed Won</option>'), 'the popover offers Closed Won — so the list must be able to show it');
    assert.ok(s.includes('pipelineFilteredOpps={smartFilteredOpps}\n                        handleEdit={handleEdit}\n                    />'), 'ListView receives the smart-filtered set');
});
