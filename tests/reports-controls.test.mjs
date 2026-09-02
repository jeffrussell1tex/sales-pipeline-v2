// tests/reports-controls.test.mjs
//
// Audit batch 6 (0.68 tier 2, class H): controls that promised an action and
// did nothing, and a print path no button could reach whose feeders ran on
// every render. Pinned as text: the dead path is gone, every inert control is
// gone or wired, the Actions report has a nav entry, and "Save as my report"
// saves a report that can be opened again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/Tabs/ReportsTab.jsx', import.meta.url), 'utf8');

test('the unreachable print block and its top-level feeders are gone', () => {
    for (const id of ['handlePrintReport', 'generateReport', 'ReportBtn', 'printSection', 'printBtnStyle', 'revenueByQuarter', 'monthlyData', 'topAccounts', 'accountRevMap', 'byStage', 'maxStageVal', 'quarterMonths', 'getRepQuarterQuota']) {
        assert.doesNotMatch(src, new RegExp('\\b' + id + '\\b'), id);
    }
    assert.doesNotMatch(src, /'Prospecting'/, 'no fabricated stage name anywhere');
});

test('every report sub-tab has a nav entry and an export label, including Actions', () => {
    for (const key of ['pipeline', 'performance', 'activity', 'history', 'leads', 'actions', 'custom']) {
        assert.match(src, new RegExp(`\\{ key:'${key}',`), `nav entry ${key}`);
    }
    const lbl = src.match(/const lbl=\{([^}]*)\}\[reportSubTab\]/);
    assert.ok(lbl, 'the export label map');
    for (const key of ['pipeline', 'performance', 'activity', 'history', 'leads', 'actions', 'custom']) assert.match(lbl[1], new RegExp(`\\b${key}:`), `label ${key}`);
    assert.doesNotMatch(lbl[1], /\brevenue:/, 'a sub-tab that no longer exists');
});

test('no control promises an action it does not perform', () => {
    assert.doesNotMatch(src, /⛶ Fullscreen/);
    assert.doesNotMatch(src, />See all →</);
    assert.doesNotMatch(src, /··· Export/);
    assert.doesNotMatch(src, /View all rows/);
    assert.doesNotMatch(src, /last viewed today/, 'an invented usage history');
    assert.doesNotMatch(src, />Regenerate</);
    assert.doesNotMatch(src, /aiRefine/);
    assert.doesNotMatch(src, /onClick=\{\(\)=>\{\}\}/, 'a click handler that does nothing');
});

test('the six template Save buttons save a real report that names its template, and a saved card opens it', () => {
    const saves = src.match(/handleSaveReport\(\{ name:'[^']+', source:'[^']+', dims:\[\], metrics:\[\], chartType:'template', description:'[^']+', config:\{ templateId:'t[1-6]' \} \}\)/g) || [];
    assert.equal(saves.length, 6, 'six wired Save buttons');
    const ids = saves.map(s => s.match(/templateId:'(t[1-6])'/)[1]).sort();
    assert.deepEqual(ids, ['t1', 't2', 't3', 't4', 't5', 't6']);
    assert.doesNotMatch(src, /<button style=\{\{[^}]*\}\}>\+ Save as my report<\/button>/, 'no Save button without a handler');
    assert.match(src, /const handleSaveReport = React\.useCallback\(async \(\{ name, source, dims, metrics, chartType, description, config = null \}\)/);
    assert.match(src, /chartType, description, config, ownerId: currentUser/);
    assert.match(src, /onClick=\{\(\)=>\{ if \(r\.config\?\.templateId\) setActiveTemplate\(r\.config\.templateId\); \}\}/, 'a saved card opens its template');
});

test('Duplicate lists the real saved reports and copies one; Email to owner mails an address, not a name', () => {
    assert.match(src, /const DUPES = \(savedReportsList\|\|\[\]\)\.map\(/);
    assert.doesNotMatch(src, /const DUPES = pinnedCards/);
    assert.doesNotMatch(src, /updated:'Today'/);
    assert.ok(src.includes("updated:dayOf(r.updatedAt||r.createdAt)||'—'"), 'the row date is the local day of an instant, not a UTC slice (18b26)');
    assert.ok(!src.includes("createdAt||'').slice(0,10)"), 'no UTC slice of an instant');
    assert.match(src, /name: r\.src\.name \+ ' \(copy\)'/);
    assert.match(src, /const ownerEmail = \(settings\?\.users\|\|\[\]\)\.find\(u => u\.name === owner\)\?\.email \|\| '';/);
    assert.match(src, /mailto:\$\{ownerEmail\}/);
    assert.doesNotMatch(src, /mailto:\$\{owner\}/);
});
