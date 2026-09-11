// tests/pipeline-time-window.test.mjs
//
// Jeff (11 Sep): "I keep trying to select all time and it allows me to select
// it but it does not actually use that selection and when I reopen the filter
// it still is closed won but has switched back to this quarter for time." The
// Filter popover's Apply mapped BOTH "All time" and "This quarter" to an empty
// quarter filter (c25a043, 21 Apr), and an empty filter was redisplayed as
// "This quarter" — so "This quarter" never filtered anything (its match rule in
// timeFilterOpts was never reached) and "All time" always read back as "This
// quarter". Now only "All time" is the empty filter, and the empty filter reads
// back as "All time". Source scans (§18b23).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');
const s = code(read('src/Tabs/PipelineTab.jsx'));

test('Apply stores the chosen window; only "All time" is the empty filter', () => {
    assert.ok(s.includes("        setPipelineQuarterFilter(draftTimeWindow === 'allTime' ? [] : [draftTimeWindow]);"), '"This quarter" is stored and therefore filters');
    assert.ok(!s.includes("draftTimeWindow === 'thisQuarter' ? []"), 'the April mapping that threw "This quarter" away is gone');
});

test('the popover reads the empty filter back as "All time" — on mount, on reopen, and on Reset', () => {
    assert.equal(s.match(/pipelineQuarterFilter\[0\] \|\| 'allTime'/g)?.length, 2, 'the draft\'s initial value and the reopen effect');
    assert.ok(!s.includes("pipelineQuarterFilter[0] || 'thisQuarter'"), 'nothing redisplays an empty filter as This quarter');
    assert.ok(s.includes("        setDraftTimeWindow('allTime');"), 'Reset returns to the unfiltered default');
});

test('the match table still has a real rule for every window the popover offers', () => {
    for (const key of ['thisQuarter', 'nextQuarter', 'thisAndNext', 'annual', 'allTime']) {
        // Once in the popover's option list, once in the tab's match table.
        const hits = s.match(new RegExp(`\\{ key: '${key}',\\s+label: `, 'g')) || [];
        assert.equal(hits.length, 2, `${key}: offered by the popover and matched by the tab`);
    }
    assert.ok(s.includes("        { key: 'thisQuarter', label: 'This quarter', match: o => o.forecastedCloseDate && getQuarterLabel(getQuarter(o.forecastedCloseDate), o.forecastedCloseDate) === currentQL2 },"));
});
