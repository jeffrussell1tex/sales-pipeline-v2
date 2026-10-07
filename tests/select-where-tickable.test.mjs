// tests/select-where-tickable.test.mjs
//
// Select is offered where rows can be ticked (state §0.179; §0.178's found (c) and (d);
// Jeff: "Hide Select there", "Only in Select mode").
//
// Before: the Pipeline's List view — its default — took no selection, so an Admin's
// Select ticked nothing there (the grid with a checkbox column, `listGridCols`, was left
// in PipelineTab, unused, when the view moved to ListView.jsx); Select showed in the
// Forecast view, on a phone's card list and in Contacts' Company layout, none of which
// tick a row; and a Kanban card's checkbox showed on hover for everyone and ticked a
// card outside Select mode, where nothing acts on a selection.
//
// THE GUARD: every Select toggle under src is one this suite checks, with the views it
// shows in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const between = (src, from, to) => { const a = src.indexOf(from); assert.ok(a >= 0, from); const b = src.indexOf(to, a + from.length); assert.ok(b > a, to); return src.slice(a, b); };

const srcFiles = () => {
    const out = [];
    const walk = (dir) => {
        for (const e of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
            const p = dir + e.name;
            if (e.isDirectory()) walk(p + '/');
            else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(p);
        }
    };
    walk('src/');
    return out;
};

// ── the guard ───────────────────────────────────────────────────────────────

test('THE GUARD — every Select toggle under src is one this suite checks', () => {
    const toggles = srcFiles().filter((f) => read(f).includes('setSelectMode(m => !m)')).sort();
    assert.deepEqual(toggles, ['src/Tabs/AccountsTab.jsx', 'src/Tabs/ContactsTab.jsx', 'src/Tabs/PipelineTab.jsx'],
        'a new Select toggle: offer it only where its rows can be ticked, and add it here');
});

// ── the Pipeline ────────────────────────────────────────────────────────────

test('Pipeline: Select and Delete (N) are offered where rows tick — not in Forecast, not on a phone; entering Forecast leaves Select mode', () => {
    const src = read('src/Tabs/PipelineTab.jsx');
    assert.ok(src.includes("const selectableView = pipelineView !== 'forecast';"));
    assert.ok(src.includes('{isAdmin && selectableView && selectMode && selectedOpps.length > 0 && (\n                        <button className="spt-pipeline-select"'), 'Delete (N)');
    assert.ok(src.includes('{isAdmin && selectableView && (\n                        <button className="spt-pipeline-select"\n                            onClick={() => { setSelectMode(m => !m); setSelectedOpps([]); }}'), 'the Select toggle');
    assert.ok(src.includes("onClick={() => { setPipelineView(v.id); setFunnelExpandedStage(null); if (v.id === 'forecast') { setSelectMode(false); setSelectedOpps([]); } }}"), 'into Forecast, out of Select mode');
    assert.ok(!src.includes('listGridCols'), 'the unused grid is gone');
    // Each view Select shows in takes the selection.
    for (const view of ['ListView', 'FunnelView', 'KanbanView']) {
        const el = between(src, `<${view}\n`, '/>');
        for (const prop of ['selectMode={selectMode}', 'selectedOpps={selectedOpps}', 'setSelectedOpps={setSelectedOpps}']) {
            assert.ok(el.includes(prop), `${view} takes ${prop}`);
        }
    }
    // A phone shows the card list, which ticks nothing: the class hides Select and Delete (N) there.
    const css = read('src/index.css');
    assert.ok(css.includes('            .spt-pipeline-mobile  { display: block !important; }\n            .spt-pipeline-desktop { display: none !important; }\n            /* The cards tick nothing, so Select and Delete (N) are not offered (state §0.179) */\n            .spt-pipeline-select  { display: none !important; }'),
        'inside the phone block, beside the rule that swaps the views for the cards');
    const phone = css.lastIndexOf('@media (max-width: 640px)', css.indexOf('.spt-pipeline-select  { display: none !important; }'));
    assert.ok(phone >= 0, 'the rule sits in a max-width: 640px block');
});

test('Pipeline List view: Select mode leads with a checkbox column, and a click ticks the row instead of opening the deal', () => {
    const src = read('src/components/ListView.jsx');
    assert.ok(src.includes("const listCols = (canSeeAll, selectMode) => (selectMode ? '32px ' : '') + (canSeeAll"));
    assert.equal(src.split('gridTemplateColumns: listCols(canSeeAll, selectMode),').length - 1, 2, 'the header and the row share one grid');
    assert.ok(src.includes('            {selectMode && <div/>}\n            <div>Deal</div>'), 'the header keeps the checkbox column');
    assert.ok(src.includes('onClick={() => (selectMode ? onToggleSelect(opp.id) : onEdit(opp))}'));
    assert.ok(src.includes("            {selectMode && (\n                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}\n                    onClick={e => { e.stopPropagation(); onToggleSelect(opp.id); }}>"), 'the checkbox, in Select mode only');
    assert.ok(src.includes("background: isSelected ? 'rgba(42,38,34,0.05)' : hover ? T.surface2 : 'transparent',"), 'a ticked row reads as ticked');
    assert.ok(src.includes('export default function ListView({ pipelineFilteredOpps, handleEdit, selectMode = false, selectedOpps = [], setSelectedOpps }) {'));
    assert.ok(src.includes('const toggleSelect = (id) => setSelectedOpps && setSelectedOpps(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));'));
    assert.ok(src.includes('                                    selectMode={selectMode}\n                                    isSelected={selectedOpps.includes(opp.id)}\n                                    onToggleSelect={toggleSelect}'), 'each row its own state');
    assert.ok(src.includes('<TableHeader canSeeAll={canSeeAll} selectMode={selectMode}/>'));
});

test('Kanban: a card\'s checkbox shows in Select mode only', () => {
    const src = read('src/components/KanbanView.jsx');
    assert.ok(src.includes('            {selectMode && (\n                <div\n                    onClick={e => { e.stopPropagation(); onSelect(opp.id); }}'), 'the checkbox, in Select mode only');
    assert.ok(!src.includes('(hover || isSelected || selectMode)'), 'not on hover');
    assert.ok(src.includes('paddingRight: selectMode ? 22 : 0,'), 'the name leaves room for it only when it is there');
    assert.ok(src.includes('onClick={() => selectMode ? onSelect(opp.id) : onOpen(opp)}'), 'a click on the card ticks it in Select mode');
});

// ── Contacts and Accounts ───────────────────────────────────────────────────

test('Contacts: Select and Delete (N) are the name-sorted list\'s; choosing Company leaves Select mode', () => {
    const src = read('src/Tabs/ContactsTab.jsx');
    assert.ok(src.includes("const selectableLayout = contactsSortBy !== 'company';"));
    assert.ok(src.includes('{canEdit && selectableLayout && selectMode && selectedIds.length > 0 && ('), 'Delete (N)');
    assert.ok(src.includes('{canEdit && selectableLayout && (\n                        <button onClick={() => { setSelectMode(m => !m); setSelectedIds([]); }}'), 'the Select toggle');
    assert.ok(src.includes("        setContactsSortBy(key);\n        if (key === 'company') { setSelectMode(false); setSelectedIds([]); }"), 'into Company, out of Select mode');
    assert.ok(src.includes('setContactsSortBy={chooseSort}'), 'the sort tabs choose through it');
    // The layouts as they are: the flat table ticks; the Company layout takes no selection.
    const company = between(src, '<CompanyTwoPane', '/>');
    assert.ok(!company.includes('selectMode'), 'the Company layout ticks nothing — if it learns to, offer Select there');
    const flat = src.slice(src.indexOf('{/* ── Flat table (Last Name / First Name modes) ── */}'));
    assert.ok(flat.includes('selectMode={selectMode}'), 'the flat table takes Select mode');
});

test('Accounts: each of its three views ticks rows, so Select stays in all of them', () => {
    const src = read('src/Tabs/AccountsTab.jsx');
    assert.ok(between(src, 'const sharedRowProps = {', '};').includes('selectMode, onToggleSelect: toggleSelect,'));
    assert.ok(between(src, 'const SignalView = () => (', 'const BusinessBookView').includes('<TableColumnHeader selectMode={selectMode}'));
    assert.ok(between(src, 'const SignalView = () => (', 'const BusinessBookView').includes('{...sharedRowProps}'));
    assert.ok(between(src, 'const BusinessBookView = () => {', 'const ListView').includes('selectMode={selectMode} isSelected={selectedIds.includes(acc.id)} onToggleSelect={toggleSelect}'));
    assert.ok(between(src, 'const ListView = () => {', "{view === 'list'").includes('<TableColumnHeader selectMode={selectMode}'));
    for (const v of ["{view === 'list'     && <ListView />}", "{view === 'business' && <BusinessBookView />}", "{view === 'signal'   && <SignalView />}"]) {
        assert.ok(src.includes(v), v);
    }
});
