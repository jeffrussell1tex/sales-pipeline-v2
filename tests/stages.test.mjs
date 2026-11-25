// tests/stages.test.mjs — one list of deal stages, the org's (state §0.299; guide §18b142). The server's half against a
// database is tests/integration/deal-stage.itest.mjs; here the rule, the import, and the lines every screen reads it by.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
    orgStages, firstStageOf, stagesDrawn, stageNamed, stageToStore, stageRefusal, laneReader, categoryOf, categoryLabel, categoryWords, FORECAST_CATEGORIES, commitStagesOf, quoteReader, reopenStage,
    stagesRefused, stagesToStore, removedStages, stagesInUseWords, stageRowsOf, stagesSent, dealsByStage, movedRow, STAGE_MAX,
    decideStages, addedRow, editedRow, removedRow, dealsIn, nameLocked, removable, typedWeight, renameWords, stageRenames, containedRenames, renamesLanded, renamedDeal, renamedViews, STAGE_NOT_SAVED, STAGE_ONCE, KEEP_THE_CLOSES,
} from '../src/utils/stages.js';
import { openStagesOf } from '../src/utils/stageOrder.js';
import { stages as appStages } from '../src/utils/constants.js';
import { DEFAULT_SETTINGS } from '../src/utils/settingsDefaults.js';
import { planDealImport } from '../src/utils/importLinks.js';
import { buildOpportunityRow } from '../src/utils/importRows.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
// Without its comment lines: a line commented out is not the line.
const code = (p) => read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n');
const count = (s, x) => s.split(x).length - 1;
const CLOSES = [{ name: 'Closed Won', weight: 100 }, { name: 'Closed Lost', weight: 0 }];
const LIST = [{ name: 'Lead in', weight: 10 }, { name: 'Site visit', weight: 40 }, { name: 'Bid sent', weight: 70 }, { name: 'Verbal', weight: 90 }, ...CLOSES];
const ORG = { funnelStages: LIST };
// Where a deal's category and the stages it falls back to are named (state §0.301): the rule (stages.js, stageOrder.js); the
// best-case stage in the Forecast view's words (PipelineTab); the commit stages in the List's words; the window's press, its
// touched mark, what it leaves out and a new deal's none; an automation's payload, the field a rule may set and the value a
// condition asks for; a report's filter; the public API's answer; the column.
const CATEGORY_READS = {
    'netlify/functions/opportunities.mjs': 2, 'netlify/functions/public-api.mjs': 1, 'src/Tabs/PipelineTab.jsx': 2, 'src/components/ListView.jsx': 2,
    'src/components/modals/OpportunityModal.jsx': 4, 'src/utils/automationEvents.js': 5, 'src/utils/reportQuery.js': 1, 'src/utils/stageOrder.js': 2, 'src/utils/stages.js': 9,
};
const APP = ['Qualification', 'Discovery', 'Evaluation (Demo)', 'Proposal', 'Negotiation/Review', 'Contracts', 'Closed Won', 'Closed Lost'];

test("the org's stages: the open ones in order, then the two closes, there whatever is stored; none stored, or junk, the app's own", () => {
    assert.deepEqual(orgStages(ORG), ['Lead in', 'Site visit', 'Bid sent', 'Verbal', 'Closed Won', 'Closed Lost']);
    assert.deepEqual(orgStages({ funnelStages: [{ name: 'Closed Lost' }, { name: 'B' }, 'A', { name: 'B' }, null, { name: '  ' }, { weight: 5 }, 7] }), ['B', 'A', 'Closed Won', 'Closed Lost']);
    for (const none of [null, undefined, {}, { funnelStages: null }, { funnelStages: [] }, { funnelStages: 'junk' }, { funnelStages: {} }, { funnelStages: [null] }, { funnelStages: CLOSES }]) assert.deepEqual(orgStages(none), APP, JSON.stringify(none));
    assert.deepEqual(APP, appStages, 'the app\'s own list');
    assert.deepEqual(DEFAULT_SETTINGS.funnelStages.map((s) => s.name), APP, 'the seed every workspace\'s settings are is the same list');
    assert.equal(firstStageOf(ORG), 'Lead in');
    assert.equal(firstStageOf({}), 'Qualification');
});

test('a board draws every stage a deal on it is in: the org\'s, then any other before the closes — no deal is left off', () => {
    const own = orgStages(ORG);
    assert.deepEqual(stagesDrawn(own, []), own);
    assert.deepEqual(stagesDrawn(own, null), own);
    assert.deepEqual(stagesDrawn(['A', 'Closed - pending', 'Closed Won', 'Closed Lost'], [{ stage: 'Closed - pending' }]), ['A', 'Closed - pending', 'Closed Won', 'Closed Lost'], 'only the two closes are the closes');
    const deals = [{ stage: 'Old one' }, { stage: 'Verbal' }, { stage: 'bid sent' }, { stage: 'Old one' }, { stage: '' }, {}, null, { stage: 7 }, { stage: 'Closed Won' }];
    assert.deepEqual(stagesDrawn(own, deals), ['Lead in', 'Site visit', 'Bid sent', 'Verbal', 'Old one', 'bid sent', 'Closed Won', 'Closed Lost']);
    for (const d of deals.filter((x) => x && typeof x.stage === 'string' && x.stage)) assert.ok(stagesDrawn(own, deals).includes(d.stage));
});

test('a stage named: the exact one, else the one of the same name in any case or spacing, in the org\'s spelling; else none', () => {
    const list = ['bid sent', 'Bid sent', 'Closed Won'];
    assert.equal(stageNamed(list, 'Bid sent'), 'Bid sent', 'the exact one first');
    assert.equal(stageNamed(list, '  BID   sent '), 'bid sent');
    assert.equal(stageNamed(list, 'closed won'), 'Closed Won');
    for (const none of ['', '  ', null, undefined, 7, {}, ['Bid sent'], 'Bid']) assert.equal(stageNamed(list, none), null);
    const own = orgStages(ORG);
    for (const none of [undefined, null, '', '   ']) assert.deepEqual(stageToStore(none, own, 'Verbal'), { stage: null }, 'not named');
    assert.deepEqual(stageToStore('site VISIT', own), { stage: 'Site visit' });
    assert.deepEqual(stageToStore(' old ONE', own, 'Old one'), { stage: 'Old one' }, 'the stage the deal has is never asked');
    assert.deepEqual(stageToStore('Site visit', own, 'Old one'), { stage: 'Site visit' });
    assert.deepEqual(stageToStore('Old one', own, 'Verbal'), { refused: stageRefusal('Old one') });
    assert.equal(stageRefusal(' Old one '), '"Old one" is not one of your organization\'s stages — pick one from the list.');
    for (const bad of [7, true, {}, ['Verbal']]) assert.deepEqual(stageToStore(bad, own, 'Verbal'), { refused: stageRefusal(JSON.stringify(bad)) });
    // The org's own spelling, named exactly, is a move onto it from another spelling of it (the first review).
    for (const [sent, held] of [['Closed Won', 'closed won'], ['Verbal', ' verbal']]) assert.deepEqual(stageToStore(sent, own, held), { stage: sent }, 'REGRESSION: the move answered 200 and dropped');
    assert.deepEqual(stageToStore('CLOSED won', own, 'closed won'), { stage: 'closed won' }, 'another spelling of what it has is no move');
});

test('the rows of a write: each decided, all or none — a create\'s blank the first, a save\'s not named, a row naming no stage as it was; a row the caller may not write refuses nothing', () => {
    const own = orgStages(ORG);
    const made = decideStages([{ id: 'a' }, { id: 'b', stage: ' ' }, { id: 'c', stage: 'verbal', x: 1 }, { id: 'd', stage: null }], own, { create: true });
    assert.deepEqual(made, { rows: [{ id: 'a', stage: 'Lead in' }, { id: 'b', stage: 'Lead in' }, { id: 'c', stage: 'Verbal', x: 1 }, { id: 'd', stage: 'Lead in' }] });
    const priors = new Map([['a', { stage: 'Old one' }], ['b', { stage: 'Verbal' }], ['c', { stage: 'Lead in' }]]);
    const rows = [{ id: 'a', stage: 'old one' }, { id: 'b', stage: '', n: 1 }, { id: 'c', n: 2 }, { id: 'c', stage: 'SITE visit' }, { id: 'b', stage: undefined }];
    assert.deepEqual(decideStages(rows, own, { priors }), { rows: [{ id: 'a', stage: 'Old one' }, { id: 'b', n: 1 }, { id: 'c', n: 2 }, { id: 'c', stage: 'Site visit' }, { id: 'b' }] });
    assert.equal('stage' in decideStages([{ id: 'b', stage: '' }], own, { priors }).rows[0], false, 'a blank is not a key of the write');
    const bad = decideStages([{ id: 'a', stage: 'Verbal' }, { id: 'b', stage: 'Nope' }, { id: 'c', stage: 'Old one' }], own, { priors });
    assert.deepEqual(bad, { status: 400, error: stageRefusal('Nope'), field: 'stage', ids: ['b', 'c'] });
    assert.deepEqual(decideStages([{ id: 'z', stage: 'Nope' }], own, { create: true }), { status: 400, error: stageRefusal('Nope'), field: 'stage', ids: ['z'] });
    // Asked of the rows the caller may write alone; the org's own stages land as named on any.
    const mayAsk = (r) => r.id === 'a';
    assert.deepEqual(decideStages([{ id: 'b', stage: 'Nope', n: 1 }, { id: 'c', stage: 'verbal' }, { id: 'a', stage: 'Verbal' }], own, { priors, mayAsk }), { rows: [{ id: 'b', n: 1 }, { id: 'c', stage: 'Verbal' }, { id: 'a', stage: 'Verbal' }] });
    assert.deepEqual(decideStages([{ id: 'a', stage: 'Nope' }, { id: 'b', stage: 'Nope' }], own, { priors, mayAsk }).ids, ['a']);
    assert.deepEqual(decideStages([null, 'x'], own, { priors }), { rows: [null, 'x'] });
});

test('the lanes: a deal\'s own forecast category; with none, its stage — the last two open ones commit, the one before best case, every other, off the list too, pipeline; an open deal in one lane always, a closed one in none', () => {
    const lane = laneReader(ORG), at = (read) => (stage) => read({ stage });
    assert.deepEqual(['Lead in', 'Site visit', 'Bid sent', 'Verbal', 'Old one', '', undefined].map(at(lane)), ['pipeline', 'best', 'commit', 'commit', 'pipeline', 'pipeline', 'pipeline']);
    assert.deepEqual(APP.slice(0, 6).map(at(laneReader({}))), ['pipeline', 'pipeline', 'pipeline', 'best', 'commit', 'commit'], 'the app\'s own list as before');
    // Its own category first, whatever its stage (Jeff, 25 Nov).
    const own = (stage) => ['commit', 'best_case', 'pipeline', 'omit'].map((forecastCategory) => lane({ stage, forecastCategory }));
    for (const stage of ['Lead in', 'Site visit', 'Verbal', 'Old one', undefined]) assert.deepEqual(own(stage), ['commit', 'best', 'pipeline', 'omit'], `REGRESSION: ${stage} counted by its stage`);
    for (const none of [null, undefined, '', '   ', 7, {}, []]) assert.equal(lane({ stage: 'Verbal', forecastCategory: none }), 'commit', JSON.stringify(none));
    for (const [typed, l] of [['Commit', 'commit'], [' BEST CASE ', 'best'], ['best-case', 'best'], ['Omit', 'omit'], ['Best  Case', 'best'], ['best_ case', 'best'], ['likely', 'pipeline'], ['constructor', 'pipeline'], ['bestcase', 'pipeline']]) assert.equal(lane({ stage: 'Verbal', forecastCategory: typed }), l, typed);
    for (const stage of ['Closed Won', 'Closed Lost']) for (const forecastCategory of ['commit', 'best_case', 'omit', null]) assert.equal(lane({ stage, forecastCategory }), null, 'a closed deal is forecast no more');
    for (const x of [null, undefined]) assert.equal(lane(x), null);
    assert.deepEqual(['Commit', ' Best Case', 'omit', 'not a one', '', null, 5].map((forecastCategory) => categoryOf({ forecastCategory })), ['commit', 'best_case', 'omit', 'not_a_one', null, null, null]);
    assert.deepEqual(['COMMIT', 'best_case', 'pipeline', 'omit', ' At risk ', '', null, 5].map((forecastCategory) => categoryLabel({ forecastCategory })), ['Commit', 'Best Case', 'Pipeline', 'Omit', 'At risk', null, null, null]);
    assert.deepEqual(FORECAST_CATEGORIES.map((c) => [c.value, c.label, c.lane, c.hint]), [['commit', 'Commit', 'commit', 'High confidence — counts in commit'], ['best_case', 'Best Case', 'best', 'Upside — possible but not certain'], ['pipeline', 'Pipeline', 'pipeline', 'Too early to call'], ['omit', 'Omit', 'omit', 'Left out of commit and best case']], 'what the window stores is what the lanes read');
    assert.equal(categoryOf(null), null);
    // What the window says: the one chosen, or where one with none counts.
    const said = (stage, forecastCategory) => categoryWords({ stage, forecastCategory }, ORG);
    assert.deepEqual([said('Verbal'), said('Site visit', null), said('Lead in', ''), said('Closed Won')], ['Not set — counted by its stage: Commit.', 'Not set — counted by its stage: Best Case.', 'Not set — counted by its stage: Pipeline.', 'Not set.']);
    assert.deepEqual([said('Lead in', 'commit'), said('Lead in', 'Best Case'), said('Verbal', 'pipeline'), said('Verbal', 'omit')], ['Rep is confident this deal closes this period.', 'Best Case — upside if everything goes right.', 'Pipeline — tracking but not yet forecastable.', 'Left out of commit and best case.']);
    assert.deepEqual([said('Verbal', ' likely '), said('Verbal', 'constructor')], ['"likely" is none of the four — counted as Pipeline.', '"constructor" is none of the four — counted as Pipeline.']);
    assert.deepEqual(commitStagesOf(ORG), ['Bid sent', 'Verbal']);
    assert.deepEqual(commitStagesOf({}), ['Negotiation/Review', 'Contracts']);
    const quoted = (s) => [...orgStages(s), 'Old one'].filter(quoteReader(s));
    assert.deepEqual(quoted(ORG), ['Site visit', 'Bid sent', 'Verbal', 'Old one'], 'one off the list is drawn on the board, and quoted');
    assert.deepEqual(quoted({ funnelStages: [{ name: 'Open' }, ...CLOSES] }), ['Open', 'Old one'], 'the one, where there is only one');
    assert.deepEqual(quoted({}), ['Discovery', 'Evaluation (Demo)', 'Proposal', 'Negotiation/Review', 'Contracts', 'Old one']);
});

// What a rename carries (state §0.302); against a database, tests/integration/stage-rename.itest.mjs.
test('a rename: the entry that says which stored stage it was; refused of a close, onto one, of none stored, of one twice; every one at once', () => {
    const of = (names, more = []) => [...LIST.map((s) => (names[s.name] ? { ...s, name: names[s.name], was: s.name } : s)), ...more];
    assert.deepEqual(stageRenames(of({ 'Bid sent': ' Quoted ' }), LIST), [{ from: 'Bid sent', to: 'Quoted' }]);
    assert.deepEqual(stageRenames(of({ 'Bid sent': 'Verbal', Verbal: 'Bid sent' }), LIST), [{ from: 'Bid sent', to: 'Verbal' }, { from: 'Verbal', to: 'Bid sent' }]);
    assert.deepEqual(stageRenames([{ name: 'Bid ', was: 'A' }, { name: 'B', was: 'Bid ' }], [{ name: 'A' }, { name: 'Bid ' }]), [{ from: 'A', to: 'Bid ' }, { from: 'Bid ', to: 'B' }], 'a stored name is the one stored');
    for (const was of [undefined, null, '', '  ', 7, {}, 'Bid sent']) assert.deepEqual(stageRenames([{ name: 'Bid sent', was }], LIST), [], JSON.stringify(was));
    assert.deepEqual([stageRenames([{ name: ' Bid sent ', was: 'Bid sent' }], LIST), stageRenames(['Bid sent', null, 5], LIST)], [[], []]);
    const error = (sent, stored = LIST) => stagesRefused(sent, stored)?.error ?? null;
    assert.deepEqual([error(of({ 'Bid sent': 'Quoted' })), error(of({ 'Bid sent': 'Verbal', Verbal: 'Bid sent' })), error(of({ 'Bid sent': 'bid SENT' }))], [null, null, null]);
    assert.equal(error(of({ 'Closed Won': 'Won it' })), KEEP_THE_CLOSES);
    assert.equal(error([...LIST.slice(0, 3), { name: 'Closed Won', was: 'Verbal', weight: 100 }, LIST[5]]), KEEP_THE_CLOSES, "REGRESSION: an open stage's deals are won");
    assert.equal(error(of({}, [{ name: 'Re-won', was: 'Closed Won', weight: 5 }])), KEEP_THE_CLOSES, "REGRESSION: every deal won is open");
    for (const was of ['Nope', 'bid sent', 'Bid sent ']) assert.equal(error(of({}, [{ name: 'New', was, weight: 5 }])), STAGE_NOT_SAVED(was), 'the stored name, exactly');
    assert.equal(error(of({ Verbal: 'One' }, [{ name: 'Two', was: 'Verbal', weight: 5 }])), STAGE_ONCE('Verbal'));
    assert.match(STAGE_NOT_SAVED('Nope'), /"Nope" is not one of the stages as saved/);
    // A name the stored list holds twice, or one that reads as closed, is no name for another stage.
    const twice = [{ name: 'A', weight: 1 }, { name: 'B', weight: 1 }, { name: 'B', weight: 1 }, ...CLOSES], odd = [{ name: 'A', weight: 1 }, { name: 'won', weight: 1 }, ...CLOSES];
    assert.equal(error([{ name: 'B', was: 'A', weight: 1 }, { name: 'B', weight: 1 }, ...CLOSES], twice), 'Another stage is named "B".', "REGRESSION: two stages' deals become one's");
    assert.match(error([{ name: 'won', was: 'A', weight: 1 }, ...CLOSES], odd), /would read as a closed deal/);
    // A 'contains' condition follows where the new name picks out what the old one did.
    const kept = (renames, rest) => containedRenames(renames, rest).map((r) => r.from);
    assert.deepEqual([kept([{ from: 'Proposal', to: 'Quote' }], ['Lead in']), kept([{ from: 'Proposal', to: 'Quote' }], ['proposal review']), kept([{ from: 'Proposal', to: 'Quote' }], ['QUOTE sent']), kept([{ from: 'Proposal', to: 'Quote' }, { from: 'Proposal Review', to: 'Quote Review' }], ['A']), kept([{ from: 'Proposal', to: 'Quote' }, { from: 'Proposal Review', to: 'Check' }], ['A'])], [['Proposal'], [], [], ['Proposal', 'Proposal Review'], ['Proposal Review']]);
    const of2 = (...n) => n.map((name) => ({ name })), chain = { list: of2('B', 'D', 'C'), renames: [{ from: 'A', to: 'B' }, { from: 'B', to: 'D' }] }, swap = { list: of2('B', 'A'), renames: [{ from: 'A', to: 'B' }, { from: 'B', to: 'A' }] };
    assert.deepEqual([renamesLanded([swap, chain], of2('B', 'D', 'C')), renamesLanded([swap, chain], of2('B', 'A')), renamesLanded([swap], of2('A', 'B')), renamesLanded([swap, chain], of2('B', 'D')), renamesLanded([], of2('A')), renamesLanded([chain], null)], [chain.renames, swap.renames, [], [], [], []], "REGRESSION: half of a chain");
    // What it drops: a renamed stage is not dropped, whatever it is called; one whose name another takes is.
    assert.deepEqual([removedStages(of({ 'Bid sent': 'Quoted' }), LIST), removedStages(of({ 'Bid sent': 'Verbal', Verbal: 'Bid sent' }), LIST)], [[], []]);
    assert.deepEqual(removedStages(of({ 'Bid sent': 'Verbal' }).filter((s) => s.was || s.name !== 'Verbal'), LIST), ['Verbal'], "REGRESSION: another stage's deals are taken for its own");
    assert.deepEqual(removedStages(of({ 'Bid sent': 'Quoted' }, [{ name: 'Bid sent', weight: 1 }]), LIST), []);
    assert.deepEqual([removedStages(LIST.map((s) => ({ ...s, name: ` ${s.name} ` })), LIST), removedStages([{ name: 'Bid ' }], [{ name: 'Bid ' }, { name: 'C' }])], [[], ['C']], 'as it is stored');
    // Stored, and sent: what the page alone reads left out, the stage a row was only where it is renamed.
    assert.deepEqual(stagesToStore(of({ 'Bid sent': ' Quoted ' }), LIST)[2], { name: 'Quoted', weight: 70 });
    const rows = stageRowsOf(LIST);
    assert.deepEqual(stagesSent(editedRow(rows, 'st_2', 'name', ' Quoted '), LIST).slice(1, 3), [{ name: 'Site visit', weight: 40 }, { name: 'Quoted', weight: 70, was: 'Bid sent' }]);
    assert.ok(!stagesSent(editedRow(rows, 'st_2', 'name', ' Bid sent '), LIST).some((s) => 'was' in s));
});

test("a renamed stage in the app's copy: the deal's stage and its history, the rest as it was; a browser's saved views", () => {
    const renames = [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }];
    const deal = { id: 'd', stage: 'A', probability: 30, stageHistory: [{ stage: 'A', prevStage: 'B', date: 'x' }, null, 'A', { stage: 'D', prevStage: 'A' }, { stage: 'D' }] };
    assert.deepEqual(renamedDeal(deal, renames), { id: 'd', stage: 'B', probability: 30, stageHistory: [{ stage: 'B', prevStage: 'C', date: 'x' }, null, 'A', { stage: 'D', prevStage: 'B' }, { stage: 'D' }] });
    for (const same of [{ stage: 'D', stageHistory: [{ stage: 'D' }] }, { stage: 'a' }, { stage: 'D', stageHistory: 'A' }, null, undefined]) assert.equal(renamedDeal(same, renames), same);
    assert.deepEqual([renamedDeal({ stage: 'B' }, renames), renamedDeal({ stage: 'D', stageHistory: [{ stage: 'B', prevStage: 'D' }] }, renames)], [{ stage: 'C' }, { stage: 'D', stageHistory: [{ stage: 'C', prevStage: 'D' }] }]);
    assert.equal(renamedDeal({ stage: 'A', stageHistory: deal.stageHistory.slice(4) }, renames).stageHistory.length, 1);
    assert.deepEqual(renamedViews([{ id: 1, stage: ['A', 'D'], rep: ['A'] }, { id: 2 }, null, { stage: 'A' }], renames), [{ id: 1, stage: ['B', 'D'], rep: ['A'] }, { id: 2 }, null, { stage: 'A' }]);
    assert.deepEqual([renamedViews(null, renames), renamedViews('x', renames)], [null, 'x']);
    // The server's statements, as they stand: what they write is run by the integration suite alone (SQL) — a change here is run there
    // before this list is changed with it.
    const r = code('netlify/functions/_stageRename.mjs');
    assert.deepEqual(r.slice(r.indexOf('const listOf = ')).trimEnd().split('\n'), RENAME_SQL);
    const s = code('netlify/functions/settings.mjs');
    for (const x of ['stageRenameStatements({ orgId, renames: renamedStages, rest: restStages, rev: newRevs.funnelStages }) : [];', 'const restStages = heldStages ? orgStages({ funnelStages: heldStages }).filter((s) => !goneStages.includes(s) && !renamedStages.some((r) => r.from === s)) : [];', "const many = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;", 'const [dealsCarried, historiesCarried, rulesCarried, reportsCarried] = renamedRows.splice(renaming.length).map((rows) => rows.length);', "`${many(dealsCarried, 'deal')}, ${many(rulesCarried, 'automation')}, ${many(reportsCarried, 'saved report')}`", 'renamed: { deals: dealsCarried, histories: historiesCarried, automations: rulesCarried, reports: reportsCarried }']) assert.equal(count(s, x), 1, x);
    const page = code('src/Tabs/settings/salesProcess/FunnelStagesDetail.jsx');
    assert.ok(page.includes("const renameSavedViews = (orgId, renames) => {\n    const key = 'pipelineSavedViews:' + (orgId || 'none');\n    try { const held = localStorage.getItem(key); if (held) localStorage.setItem(key, JSON.stringify(renamedViews(JSON.parse(held), renames))); }") && code('src/Tabs/PipelineTab.jsx').includes("const savedViewsKey = 'pipelineSavedViews:' + (activeOrgId || 'none');"), 'the key PipelineTab reads');
    assert.ok(code('netlify/functions/opportunities.mjs').includes("if (!move) for (const k of ['stage', 'stageChangedDate', 'wonDate', 'lostReason', 'lostCategory', 'lostDate', 'probability']) if (k === 'stage' || k === 'stageChangedDate' || !(k in data)) delete updateData[k];") && code('netlify/functions/opportunities.mjs').includes('const stageChanged = !!move && upserted.stage !== previousStage;'), 'a save that moves no stage writes none, nor what follows one, and says no move');
});

test('a deal reopened goes to a stage the org has: the one it was closed from in this window, the one its latest close left, else the last open one', () => {
    const own = orgStages(ORG);
    const history = [{ stage: 'Closed Lost', prevStage: 'Lead in' }, { stage: 'Site visit', prevStage: 'Closed Lost' }, null, { stage: 'Closed Won', prevStage: 'Bid sent' }, { stage: 'Verbal', prevStage: 'Closed Won' }];
    assert.equal(reopenStage(own, { left: 'Site visit', history }), 'Site visit');
    assert.equal(reopenStage(own, { history }), 'Bid sent', "the latest close's");
    assert.equal(reopenStage(own, { left: 'Gone', history }), 'Bid sent', 'one the org has no more is not gone back to');
    assert.equal(reopenStage(own, { left: 'Gone', held: 'Gone', history }), 'Gone', 'but the one the deal is stored in is: nothing moved it');
    assert.equal(reopenStage(own, { history: [{ stage: 'Closed Won', prevStage: 'Gone' }] }), 'Verbal');
    for (const none of [undefined, {}, { history: null }, { history: [] }, { left: 'Closed Won', history: 'junk' }]) assert.equal(reopenStage(own, none), 'Verbal', JSON.stringify(none));
});

test('a stages list a save sends: what is refused, each in its words; the app\'s own list and an org\'s are not', () => {
    assert.equal(stagesRefused(LIST), null);
    assert.equal(stagesRefused(DEFAULT_SETTINGS.funnelStages), null);
    assert.equal(stagesRefused([{ name: 'x'.repeat(STAGE_MAX), weight: 0, type: 'Open', color: '#fff' }, ...CLOSES]), null);
    const bad = (list, words) => assert.deepEqual(stagesRefused(list), { status: 400, error: words, field: 'funnelStages' }, JSON.stringify(list));
    for (const x of [null, undefined, '', 'junk', 7, {}]) bad(x, 'Send the stages as a list.');
    for (const n of ['', '  ', null, undefined, 7, {}]) bad([{ name: n, weight: 1 }, ...CLOSES], 'Give each stage a name.');
    for (const e of [null, 7, '']) bad([e, ...CLOSES], 'Give each stage a name.');
    bad([{ name: 'x'.repeat(STAGE_MAX + 1), weight: 1 }, ...CLOSES], 'A stage\'s name is 100 characters at most.');
    bad([...LIST, { name: ' VERBAL', weight: 1 }], 'Another stage is named "VERBAL".');
    const closes = 'Closed Won and Closed Lost keep their names — every deal won or lost is told by them.';
    bad([], closes); bad(LIST.slice(0, 5), closes); bad([...LIST.slice(0, 4), LIST[5]], closes);
    bad(LIST.map((s) => (s.name === 'Closed Lost' ? { ...s, name: 'closed lost' } : s)), closes);
    bad([...LIST, { name: 'closed won', weight: 1 }], 'Another stage is named "closed won".');
    bad([...LIST.slice(0, 4), 'Closed Won', 'Closed Lost'], closes);
    bad(CLOSES, 'Keep at least one open stage.');
    for (const n of ['Closed', 'closed - no bid', 'Closedown', 'Won', ' lost ']) bad([...LIST, { name: n, weight: 1 }], `"${n.trim()}" would read as a closed deal — name an open stage something else.`);
    for (const w of [-1, 101, 12.5, '50', null, undefined, NaN, true]) bad([...LIST, { name: 'New', weight: w }], 'Give each stage a default probability from 0 to 100.');
    bad(['Plain text', ...LIST], 'Give each stage a default probability from 0 to 100.');
    for (const w of [0, 100]) assert.equal(stagesRefused([...LIST, { name: 'New', weight: w }]), null);
    for (const w of [101, '50', null]) for (const c of [0, 1]) bad([...LIST.slice(0, 4), ...CLOSES.map((s, i) => (i === c ? { ...s, weight: w } : s))], 'Give each stage a default probability from 0 to 100.');
    bad([{ name: 'New', weight: 1 }, { name: 'New', weight: 2 }, ...CLOSES], 'Another stage is named "New".');
    // A name of the stored list's is held once, by the row that holds it: another row of it is refused, wherever it stands.
    const twin = (list, words = 'Verbal') => assert.equal(stagesRefused(list, LIST)?.error, `Another stage is named "${words}".`, JSON.stringify(list));
    twin([...LIST, { name: 'Verbal', weight: 50 }]); twin([{ name: 'Verbal', weight: 50 }, ...LIST]); twin([...LIST, { name: 'Verbal ', weight: 1 }]); twin([{ name: 'VERBAL', weight: 1 }, ...LIST], 'VERBAL');
    twin(LIST.map((s) => (s.name === 'Lead in' ? { ...s, name: 'Verbal' } : s)));
    twin([...LIST.slice(0, 4), { name: 'Closed Won', weight: 50 }, ...CLOSES], 'Closed Won');
    assert.equal(stagesRefused([{ name: '', weight: 1 }, ...LIST], [null, ...LIST]).error, 'Give each stage a name.');
    const closeHeld = [{ name: 'Lead', weight: 1 }, { name: 'closed won', weight: 2 }, CLOSES[1]];
    assert.equal(stagesRefused(stagesSent(stageRowsOf(closeHeld), closeHeld), closeHeld), null, 'the two closes are always the org\'s: one stored in another case refuses no save');
    const same = [{ name: 'Same', weight: 1 }, { name: 'Same', weight: 2 }, ...CLOSES];
    assert.equal(stagesRefused(same, same), null); assert.equal(stagesRefused([...same, same[0]], same).error, 'Another stage is named "Same".');
    // What the stored list holds, exactly, is never asked again: a save of the page sends it whole.
    const odd = [{ name: 'Bid ', weight: 1 }, { name: 'Won', weight: 2 }, { name: 'Same', weight: 3 }, { name: 'same', weight: 4 }, { name: 'y'.repeat(101), weight: 5 }, { name: 'Closedown ', weight: 6 }, ...CLOSES];
    assert.equal(stagesRefused(odd, odd), null);
    assert.equal(stagesRefused(odd, []).error, 'A stage\'s name is 100 characters at most.');
    assert.equal(stagesRefused([...odd, { name: 'SAME', weight: 1 }], odd).error, 'Another stage is named "SAME".');
    assert.equal(stagesRefused([{ name: 'Lost', weight: 1 }, ...odd], odd).error, '"Lost" would read as a closed deal — name an open stage something else.');
    assert.equal(stagesRefused(odd.map((s) => ({ ...s, weight: 101 })), odd).error, 'Give each stage a default probability from 0 to 100.');
    assert.equal(stagesRefused(odd, 'junk').status, 400);
    assert.deepEqual(stagesToStore([{ name: 'Bid ', weight: 1 }, { name: ' New ', weight: 2 }], odd), [{ name: 'Bid ', weight: 1 }, { name: 'New', weight: 2 }], 'a held name as its deals hold it');
});

test('what a save drops, by the exact name its deals hold, and the words while any deal is in it', () => {
    assert.deepEqual(removedStages(LIST, LIST), []);
    assert.deepEqual(removedStages([LIST[3], LIST[0], ...CLOSES], LIST), ['Site visit', 'Bid sent']);
    assert.deepEqual(removedStages(LIST.map((s) => (s.name === 'Verbal' ? { ...s, name: 'verbal' } : s)), LIST), ['Verbal'], 'a changed name that does not say which stage it was, another case of it too');
    assert.deepEqual(removedStages(LIST, []), APP.slice(0, 6), 'the app\'s own where none was stored');
    assert.deepEqual(removedStages(LIST.slice(0, 4), LIST), [], 'the closes are always there');
    assert.deepEqual(stagesToStore([{ name: '  Verbal ', weight: 5, x: 1 }]), [{ name: 'Verbal', weight: 5, x: 1 }]);
    assert.equal(stagesInUseWords([], { Verbal: 2 }), null);
    assert.equal(stagesInUseWords(['Verbal', 'Bid sent'], { Other: 2, Verbal: 0 }), null);
    assert.equal(stagesInUseWords(['Verbal', 'Bid sent'], { 'Bid sent': 2 }), '"Bid sent" still has 2 deals. Move them to another stage first.');
    assert.equal(stagesInUseWords(['Verbal', 'Bid sent'], { Verbal: 1, 'Bid sent': 2 }), '"Verbal" still has 1 deal; "Bid sent" still has 2 deals. Move them to another stage first.');
});

test('the page: its rows, each once and with a key of its own, the closes last; the app\'s own where the list names no open stage', () => {
    const rows = stageRowsOf([{ name: 'Closed Lost', weight: 0 }, { name: 'A', weight: 5, type: 'Won', color: '#111' }, { name: 'B', weight: 7 }, { name: 'A', weight: 9 }, { name: 'a', weight: 3 }, { name: '  ' }, null]);
    assert.deepEqual(rows.map((r) => [r.name, r.was, r.weight, r.close]), [['A', 'A', 5, false], ['B', 'B', 7, false], ['a', 'a', 3, false], ['Closed Won', 'Closed Won', 100, true], ['Closed Lost', 'Closed Lost', 0, true]], 'REGRESSION: two of one name locked the page');
    assert.equal(new Set(rows.map((r) => r.key)).size, rows.length);
    for (const none of [undefined, null, [], CLOSES, [null], 'junk']) assert.deepEqual(stageRowsOf(none).map((r) => [r.name, r.weight]), DEFAULT_SETTINGS.funnelStages.map((s) => [s.name, s.weight]), JSON.stringify(none));
    assert.deepEqual(stageRowsOf([{ name: 'A', weight: 1 }]).map((r) => [r.name, r.weight]), [['A', 1], ['Closed Won', 100], ['Closed Lost', 0]]);
    assert.deepEqual(stagesSent(stageRowsOf([{ name: 'Closed Lost', weight: 5, note: 'x' }, { name: 'A', weight: 1 }, { name: 'Closed Won', weight: 95 }])), [{ name: 'A', weight: 1 }, { name: 'Closed Won', weight: 95 }, { name: 'Closed Lost', weight: 5, note: 'x' }], 'the closes as stored');
    assert.deepEqual(stagesSent(rows).map((s) => Object.keys(s).sort().join()), Array(5).fill('name,weight'), 'neither the page\'s own fields nor a type or colour nothing reads');
    assert.deepEqual(stagesSent([{ name: ' C ', weight: 1, was: null, key: 'k', close: false, note: 'kept' }, { name: 'Bid ', was: 'Bid ', key: 'x', weight: 2 }], [{ name: 'Bid ' }]), [{ name: 'C', weight: 1, note: 'kept' }, { name: 'Bid ', weight: 2 }]);
    assert.equal(stagesRefused(stagesSent(stageRowsOf(DEFAULT_SETTINGS.funnelStages))), null);
});

test('the page: a row added before the closes, edited, taken out, moved among the open ones; which one is fixed', () => {
    const rows = stageRowsOf([{ name: 'A', weight: 5 }, { name: 'B', weight: 7 }, ...CLOSES]);
    const names = (r) => r.map((x) => x.name).join();
    const two = addedRow(addedRow(rows, 1), 2);
    assert.deepEqual(two.map((r) => [r.name, r.key, r.close]), [['A', 'st_0', false], ['B', 'st_1', false], ['', 'new_1', false], ['', 'new_2', false], ['Closed Won', 'st_2', true], ['Closed Lost', 'st_3', true]]);
    assert.deepEqual([two[2].weight, two[2].was], [50, null]);
    assert.equal(names(editedRow(two, 'new_2', 'name', 'D')), 'A,B,,D,Closed Won,Closed Lost');
    assert.equal(editedRow(two, 'st_0', 'weight', 9)[0].weight, 9);
    assert.equal(names(removedRow(two, 'new_1')), 'A,B,,Closed Won,Closed Lost');
    assert.equal(removedRow(two, 'new_1')[2].key, 'new_2');
    assert.equal(names(movedRow(rows, 1, -1)), 'B,A,Closed Won,Closed Lost');
    assert.equal(names(movedRow(rows, 0, 1)), 'B,A,Closed Won,Closed Lost');
    for (const [i, by] of [[0, -1], [1, 1], [2, -1], [2, 1], [3, -1], [9, 1]]) assert.equal(movedRow(rows, i, by), rows, `${i} ${by}: nothing moves`);
    const typed = editedRow(addedRow(rows, 1), 'new_1', 'name', 'Closed Won');
    assert.equal(names(movedRow(typed, 2, -1)), 'A,Closed Won,B,Closed Won,Closed Lost', 'a row added here is an open one, whatever is typed in it');
    const n = dealsByStage([{ stage: 'A' }, { stage: 'A' }, { stage: 'Closed Won' }, null, {}]);
    assert.deepEqual([n, dealsByStage(null)], [{ A: 2, 'Closed Won': 1 }, {}]);
    assert.deepEqual([...rows, two[2]].map((r) => [dealsIn(r, n), nameLocked(r, n), removable(r, n)]), [[2, false, false], [0, false, true], [1, true, false], [0, true, false], [0, false, true]]);
    const named = (i, name) => renameWords(editedRow(rows, rows[i].key, 'name', name)[i], n);
    assert.deepEqual([named(0, 'Lead'), named(1, ' Lead '), named(0, 'A'), named(0, ' A '), named(0, '  '), renameWords(two[2], n), named(2, 'Won it')], ['Renames "A" — its 2 deals with it', 'Renames "B"', null, null, null, null, null]);
    assert.equal(renameWords(editedRow(rows, 'st_0', 'name', 'Lead')[0], { A: 1 }), 'Renames "A" — its 1 deal with it');
    assert.equal(removable(editedRow(rows, 'st_0', 'name', 'Lead')[0], n), false, 'renamed or not, its deals are in it');
    assert.deepEqual(['5', '150', '-3', '', 'x', '12.9', 7].map(typedWeight), [5, 100, 0, 0, 0, 12, 7]);
});

const ACCOUNTS = [{ id: 'a1', name: 'Acme', accountTier: 'account' }];
const plan = (recs, deals = [], stages = orgStages(ORG)) => planDealImport(recs.map((r) => ({ account: 'Acme', ...r })), recs.map((_, i) => i + 2), ACCOUNTS, deals, stages);

test('a deal import: a Stage is one of the org\'s, in its spelling, or the one its duplicate holds — else the row is refused at Preview; a blank one is the server\'s', () => {
    const deals = [{ id: 'd1', opportunityName: 'Held', account: 'Acme', accountId: 'a1', stage: 'Old one' }];
    const p = plan([{ opportunityName: 'One', stage: 'BID sent ' }, { opportunityName: 'Two', stage: 'Proposal' }, { opportunityName: 'Three' }, { opportunityName: 'Held', stage: 'old one' }, { opportunityName: 'Five', stage: '' }], deals);
    assert.deepEqual(p.records.map((r) => [r.opportunityName, r.stage]), [['One', 'Bid sent'], ['Three', undefined], ['Held', 'Old one'], ['Five', '']]);
    assert.deepEqual(p.refused, [{ rowNumber: 3, field: 'Stage', value: 'Proposal', why: '“Proposal” is not one of your organization\'s stages — “Lead in”, “Site visit”, “Bid sent”, “Verbal”, “Closed Won”, “Closed Lost”.' }]);
    assert.equal(p.conflicts.length, 1);
    assert.deepEqual(plan([{ opportunityName: 'Held', stage: 'Nowhere' }], deals).refused.map((r) => r.field), ['Stage'], 'another stage than the one it holds is asked');
    assert.equal(plan([{ opportunityName: 'One', stage: 'Proposal' }], [], null).records.length, 1, 'no list given: not asked');
    assert.equal(buildOpportunityRow({ account: 'Acme' }, { newId: () => 'x' }).stage, '');
    assert.equal(buildOpportunityRow({ account: 'Acme', stage: 'Bid sent' }, { newId: () => 'x' }).stage, 'Bid sent');
});

// ── Every reader reads the one list ──────────────────────────────────────────
test('THE GUARD: no screen draws, counts or makes a deal by a list of stages written into it — the Pipeline tab, the deal window, the import, Quotes', () => {
    const app = code('src/App.jsx');
    assert.equal(count(app, 'const stages = useMemo(() => orgStages(settings), [settings?.funnelStages]);'), 1, 'kept between renders: the import plans its file once');
    assert.ok(!/import \{[^}]*\bstages\b[^}]*\} from '\.\/utils\/constants'/.test(app), 'REGRESSION: the app handed out its own list');
    const kanban = code('src/components/KanbanView.jsx'), funnel = code('src/components/FunnelView.jsx'), pipe = code('src/Tabs/PipelineTab.jsx'), list = code('src/components/ListView.jsx');
    for (const [f, s] of [['Kanban', kanban], ['Funnel', funnel]]) {
        assert.equal(count(s, "const visibleStages = stagesDrawn(stages, pipelineFilteredOpps).filter(s => s !== 'Closed Lost');"), 1, `REGRESSION: the ${f} left off a deal in a stage of its org's`);
    }
    assert.equal(count(pipe, "stages={stagesDrawn(stages, [...visibleOpportunities, ...pipelineStageFilter.filter(s => s !== '__allOpen__').map(stage => ({ stage }))])}"), 1, 'the stage filter, and the stage it filters by');
    for (const x of ["const open        = smartFilteredOpps.filter(o => !['Closed Won','Closed Lost'].includes(o.stage));", "const commitDeals = open.filter(o => laneOf(o) === 'commit')", "const bestDeals   = open.filter(o => laneOf(o) === 'best')", "const pipeDeals   = open.filter(o => laneOf(o) === 'pipeline')", "const omitDeals   = open.filter(o => laneOf(o) === 'omit')", '{omitDeals.length > 0 && <ForecastLane label="Omitted" subtitle={`${omitDeals.length} left out of commit and best case`} opps={omitDeals} total={sumARR(omitDeals)}', "What's committed, what's likely, what's coming.", "const commitOpps = visibleOpportunities.filter(o => laneOf(o) === 'commit');", "pipelineFilteredOpps.filter(o => laneOf(o) === 'commit').reduce("]) assert.equal(count(pipe, x), 1, x);
    // A column for a stage off the org's list is drawn, never dropped on.
    assert.deepEqual([count(kanban, 'if (!stages.includes(stage)) return; e.preventDefault();'), count(kanban, 'if (stages.includes(stage)) handleKanbanDrop(stage);'), count(kanban, 'handleKanbanDrop(stage)')], [2, 2, 2]);
    assert.equal(count(pipe, 'const laneOf = laneReader(settings);'), 1);
    assert.deepEqual(['commit', 'best', 'pipeline', 'omit'].map((l) => count(pipe, `laneOf(o) === '${l}'`)), [3, 1, 1, 1]);
    assert.ok(pipe.includes("{`${bestDeals.length} marked best case${bestStage ? ` or in ${bestStage}` : ''}`}") && pipe.includes('const bestStage   = bestCaseFallbackStages(openStagesOf(settings))[0];') && pipe.includes('{`${pipeDeals.length} in neither`}'));
    for (const [label, deals] of [['Commit', 'commitDeals'], ['Best case', 'bestDeals'], ['Pipeline', 'pipeDeals'], ['Omitted', 'omitDeals']]) assert.equal((pipe.match(new RegExp(`<ForecastLane label="${label}"\\s.*\\sopps=\\{${deals}\\}\\s+total=\\{sumARR\\(${deals}\\)\\}\\s+accent=\\{T\\.\\w+\\} deps=\\{cardCtx\\}/>`)) || []).length, 1, label);
    // Run: the header's commit and the four lanes, over deals of every kind.
    const deals = [['late', 'Verbal', null, 1, '2026-09-02'], ['soon', 'Verbal', null, 2, '2026-01-02'], ['left out', 'Verbal', 'omit', 4, '2026-05-01'], ['called', 'Lead in', 'Commit', 8, ''], ['won', 'Closed Won', 'commit', 16, ''], ['likely', 'Lead in', 'best_case', 32, '2026-03-01'], ['site', 'Site visit', null, 64, '2026-02-01'], ['early', 'Lead in', null, 128, '2026-02-02'], ['marked', 'Verbal', 'pipeline', 256, '2026-02-01'], ['left first', 'Lead in', 'omit', 512, '2026-04-01']].map(([id, stage, forecastCategory, arr, forecastedCloseDate]) => ({ id, stage, forecastCategory, arr: String(arr), forecastedCloseDate }));
    const cut = (from, to) => { const i = pipe.indexOf(from); assert.ok(i >= 0 && pipe.indexOf(to, i) > i, from); return pipe.slice(i, pipe.indexOf(to, i)); };
    const run = new Function('laneOf', 'pipelineFilteredOpps', 'smartFilteredOpps', 'bestCaseFallbackStages', 'openStagesOf', 'settings', cut('    const commitARR ', '    const weightedARR') + cut('                    const open        = ', '                    const weekStart ') + 'return { commitARR, lanes: [commitDeals, bestDeals, pipeDeals, omitDeals].map((l) => l.map((d) => d.id)), sums: [commitDeals, bestDeals, pipeDeals, omitDeals].map(sumARR), forecastTotalARR, bestStage };');
    assert.deepEqual(run(laneReader(ORG), deals, deals, (l) => l.slice(-3, -2), () => ['Lead in', 'Site visit', 'Bid sent', 'Verbal'], ORG), { commitARR: 11, lanes: [['soon', 'late', 'called'], ['site', 'likely'], ['marked', 'early'], ['left first', 'left out']], sums: [11, 96, 384, 516], forecastTotalARR: 1023, bestStage: 'Site visit' });
    assert.equal(count(list, 'const commitStages = commitStagesOf(settings);'), 1);
    assert.equal(count(list, "const commit   = opps.filter(o => laneOf(o) === 'commit')"), 1);
    assert.deepEqual([count(list, 'qSummary(g.opps, laneOf, '), count(list, 'qSummary(activeGroup.opps, laneOf, '), count(list, 'const laneOf = laneReader(settings);'), count(list, 'laneOf={laneOf}'), count(list, 'commitStages={commitStages}'), count(list, "{ label: 'Commit',    value: fmtMoney(sum.commit),   sub: `marked commit, else in ${commitStages.join(' or ')}`,")], [1, 1, 1, 1, 1, 1]);
    // Home and Reports read the same one (state §0.301).
    const home = code('src/Tabs/HomeTab.jsx'), rep = code('src/Tabs/ReportsTab.jsx');
    assert.deepEqual([count(home, 'const laneOf         = laneReader(settings);'), count(home, "return laneOf(o) === 'commit' && cd >= quarterStart && cd <= quarterEnd;")], [1, 1]);
    assert.deepEqual([count(rep, 'laneReader(settings);'), count(rep, "openOpps.filter(o=> laneOf(o) === 'commit')"), count(rep, "openOpps.filter(o=> laneOf(o) === 'best')"), count(rep, "rOpen.filter(o=> laneOf(o) === 'commit').reduce((s,o)=>s+(parseFloat(o.arr)||0),0);"), count(rep, "allOpen.filter(o => laneOf(o) === 'commit')")], [3, 1, 1, 1, 1]);
    const held = deals.filter((d) => d.stage !== 'Closed Won'), won = deals.filter((d) => d.stage === 'Closed Won');
    const slice = (from, to) => { const i = rep.indexOf(from); assert.ok(i >= 0 && rep.indexOf(to, i) > i, from); return rep.slice(i, rep.indexOf(to, i)); };
    assert.deepEqual(new Function('laneReader', 'settings', 'openOpps', 'wonOpps', slice('                            const laneOf      = ', '                            const attainPct ') + 'return [commitVal, bestCaseVal];')(laneReader, ORG, held, won), [27, 123], 'the period\'s commit and best case, run');
    assert.deepEqual(new Function('laneReader', 'settings', 'allOpen', slice('        const laneOf = laneReader(settings);\n        const commitOpps', '        const atRiskOpps') + slice('        const commitTotal = ', '        const riskTotal') + 'return commitTotal;')(laneReader, ORG, held), 11, 'the deal review\'s, run');
    assert.deepEqual([count(rep, ": commitOpps.map((o,i) => ("), count(rep, 'value={fmtShort(commitTotal)}'), count(rep, "{ label:'Commit',        value:commitVal, ")], [1, 1, 1]);
    assert.deepEqual([count(rep, "${esc(categoryLabel(opp)||'—')}"), count(rep, "{categoryLabel(selectedOpp) || '—'}"), count(rep, '· marked commit, or with no forecast category in the last two stages`}'), count(code('src/utils/reportQuery.js'), '(o) => categoryLabel(o) || NONE, true)')], [1, 1, 1, 1]);
    assert.equal(count(code('src/Tabs/settings/salesProcess/FunnelStagesDetail.jsx'), "A deal's own forecast category says whether it is commit or best case; with none set, the last two open stages are commit and the one before them best case."), 1);
    const modal = code('src/components/modals/OpportunityModal.jsx');
    assert.equal(count(modal, 'const stages = orgStages(settings);'), 1);
    // The window shows the category the deal has, none when it has none, and takes it off again.
    for (const x of ['const sel = categoryOf(formData) === value;', "onClick={() => handleChange('forecastCategory', sel ? null : value)}", '{categoryWords(formData, settings)}', '{FORECAST_CATEGORIES.map(({ value, label, hint }) => {', 'const { bg, fg, bd } = CATEGORY_TONES[value];', 'title={sel ? `${hint} · press again for none` : hint}', 'probability: null, forecastCategory: null, arr: 0,', 'const categoryTouched = useRef(false);', "        if (field === 'forecastCategory') categoryTouched.current = true;\n        if (field === 'stage') {\n", '                                                        {label}\n                                                    </button>', 'border: `1.5px solid ${sel ? bd : T.border}`,', 'background: sel ? bg : T.surface,\n                                                            color: sel ? fg : T.inkMuted,', '>drives commit and best case</span>', '                                            {categoryWords(formData, settings)}\n                                        </div>', "...(categoryTouched.current ? [] : ['forecastCategory']),"]) assert.equal(count(modal, x), 1, x);
    for (const c of FORECAST_CATEGORIES) assert.equal((modal.match(new RegExp(`^    ${c.value}:\\s+\\{ bg: [^,]+(?:,[^,]+)*?, +fg: T\\.\\w+, +bd: \\S.* \\},$`, 'gm')) || []).length, 1, `a colour for ${c.value}`);
    // THE GUARD: no screen decides on a deal's category, or on the stages it falls back to, itself.
    const walk = (dir) => readdirSync(new URL('../' + dir, import.meta.url), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(dir + e.name + '/') : /\.jsx?$/.test(e.name) ? [dir + e.name] : []));
    // Every file that names one, with how many times it does: a new read of either is a decision to look at.
    const NAMES = /forecastCategory|commitFallbackStages|bestCaseFallbackStages|commitStagesOf/g;
    const named = Object.fromEntries([...walk('src/'), ...readdirSync(new URL('../netlify/functions/', import.meta.url)).filter((f) => f.endsWith('.mjs')).map((f) => 'netlify/functions/' + f)].map((f) => [f, (code(f).match(NAMES) || []).length]).filter(([, n]) => n));
    assert.deepEqual(named, CATEGORY_READS);
    for (const x of ["painPoints: '', contacts: '', stage: firstStageOf(settings),", '            stage:           base.stage ?? firstStageOf(settings),', 'const allStages = stages;', 'const target = reopenStage(stages, { left: prevOpenStageRef.current, held: opportunity?.stage, history: opportunity?.stageHistory });', 'if (!isClosed) { prevOpenStageRef.current = formData.stage || null; prevProbRef.current = formData.probability; }']) assert.equal(count(modal, x), 1, x);
    const quotes = code('src/Tabs/QuotesTab.jsx');
    assert.ok(quotes.includes('const toQuote = useMemo(() => quoteReader(settings), [settings?.funnelStages]);') && quotes.includes('.filter(o => toQuote(o.stage) && !quotedOppIds.has(o.id))') && quotes.includes('[opportunities, quotedOppIds, toQuote]);'));
    // The funnel's figures between one stage and the next: the org's own, in order.
    for (const x of ['const inOrder = stageData.filter(d => stages.includes(d.stage));', 'const before = (sd) => { const k = inOrder.indexOf(sd); return k > 0 ? inOrder[k - 1].count : sd.count; };', 'prevCount={before(sd)}', 'const topStage      = inOrder[0];', 'const bottomStage   = inOrder[inOrder.length - 1];', '{inOrder.slice(0, -1).map((sd, i) => {', 'const next = inOrder[i + 1];']) assert.equal(count(funnel, x), 1, x);
    const scoring = code('src/Tabs/settings/salesProcess/DealScoringDetail.jsx');
    for (const x of ['const openRows = stageRowsOf(settings?.funnelStages).filter((s) => !s.close);', 'const example = openRows[Math.floor(openRows.length / 2)].name;', 'const exampleWeight = stageWeightOf(example, settings?.funnelStages);', 'a deal in {example} ({exampleWeight}%) with no activities logged reads {Math.round(exampleWeight * 0.7)}%.']) assert.equal(count(scoring, x), 1, x);
    const reports = code('src/Tabs/ReportsTab.jsx');
    for (const x of ['{worstStage&&<> Pair that with', "loss{worstStage.count === 1 ? '' : 'es'} at {worstStage.stage} stage"]) assert.equal(count(reports, x), 1, x);
    for (const x of ['const lostByStageRows = lostByStageRowsOf(lostOppsD, openStagesOf(settings));', 'const worstStage = lostByStageRows.reduce((a, r) => (!a || r.count > a.count ? r : a), null);',
        'const funnelStages = openStagesOf(settings).map(name => ({ name, ...(settings?.funnelStages || []).find(s => s?.name === name) }));']) assert.equal(count(reports, x), 1, x);
    assert.ok(read('src/components/layout/ModalLayer.jsx').includes('                    stages={stages}\n                    dealPipeline='));
});

// The class: no list of the app's own stages, and none of them by name, decides anything under src/ or netlify/functions/ —
// but where it is named, with why.
const APP_NAMES = ['Prospecting', 'Qualification', 'Discovery', 'Evaluation (Demo)', 'Proposal', 'Negotiation', 'Negotiation/Review', 'Contracts', 'Closing'];
const NAMED = {
    'src/utils/constants.js': "the app's own list, and the demo deals of an old sample",
    'src/utils/settingsDefaults.js': 'the seed a workspace starts with — the same list (above)',
    'netlify/functions/pipeline-alerts.mjs': 'the momentum alert leaves out the last two of the app\'s own — filed (OPEN_ITEMS §4.5, left by §0.299)',
};
function stagesWritten(text) {
    const s = text.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    const lists = [...s.matchAll(/\[[^[\]]*\]/g)].filter((m) => APP_NAMES.filter((n) => m[0].includes(`'${n}'`) || m[0].includes(`"${n}"`)).length >= 2);
    const one = [...s.matchAll(/(?:\|\||\?\?|===|!==|\bstage:)\s*['"]([^'"]+)['"]/g)].filter((m) => APP_NAMES.includes(m[1]));
    return lists.length + one.length;
}
test('THE GUARD, class-wide: no stage of the app\'s own is written into code that decides on deals, unless named', () => {
    for (const bad of ["const x = ['Discovery', 'Proposal'];", 'new Set(["Negotiation",\n "Closing"])', "stage: 'Qualification'", "a.stage || 'Discovery'", "s === 'Proposal'", 's !== "Contracts"', "x ?? 'Proposal'"]) assert.ok(stagesWritten(bad) > 0, bad);
    for (const fine of ["// ['Discovery', 'Proposal']", "['Closed Won', 'Closed Lost']", "['Proposal Sent', 'Demo']", "status === 'Qualified'", "['Discovery']"]) assert.equal(stagesWritten(fine), 0, fine);
    const walk = (d) => readdirSync(new URL('../' + d, import.meta.url), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : /\.(jsx?|mjs)$/.test(e.name) ? [`${d}/${e.name}`] : []));
    const files = [...walk('src'), ...walk('netlify/functions')];
    assert.ok(files.length >= 300, `the files scanned (${files.length})`);
    const found = files.filter((f) => stagesWritten(read(f)) > 0);
    assert.deepEqual(found.sort(), Object.keys(NAMED).sort(), 'a file here: read the org\'s list (src/utils/stages.js), or name it with its reason');
});

test('THE GUARD: every write of a deal asks the one rule, in order, and answers its refusal; the settings save too', () => {
    const o = code('netlify/functions/opportunities.mjs'), l = code('netlify/functions/_links.mjs'), s = code('netlify/functions/settings.mjs');
    assert.deepEqual([count(o, 'await checkStages('), count(o, 'await checkStages(people.rows, orgId, { create: true });'), count(o, 'await checkStages([data], orgId, { create: true });'),
        count(o, 'await checkStages(data, orgId, { priors, mayAsk: mayName });'), count(o, 'await checkStages([data], orgId, { priors: new Map([[data.id, existing]]) });')], [4, 1, 1, 1, 1]);
    assert.equal(count(o, 'const mayName = (r) => priors.has(r.id) && mayMutate({ ownerId: priors.get(r.id).ownerId, callerId, canSeeAll: canSeeAll(userRole) });'), 1);
    assert.equal(count(o, 'if (inStage.error) return { statusCode: inStage.status, headers, body: JSON.stringify({ error: inStage.error, field: inStage.field }) };'), 2);
    assert.equal(count(o, 'if (inStages.error) return { statusCode: inStages.status, headers, body: JSON.stringify({ error: inStages.error, field: inStages.field, ids: inStages.ids }) };'), 2);
    const order = (src, ...xs) => { let at = -1; for (const x of xs) { const i = src.indexOf(x, at + 1); assert.ok(i > at, x); at = i; } };
    order(o, 'await checkStages(people.rows, orgId, { create: true });', 'people.rows = inStages.rows;', 'await stampOwnerIds(people.rows.map(',
        'await checkStages([data], orgId, { create: true });', 'data.stage = inStage.rows[0].stage;', 'const named = { ...data, ...people.set };',
        'await checkStages(data, orgId, { priors, mayAsk: mayName });', 'data.splice(0, data.length, ...inStages.rows);', 'const staged = applyStageChanges(',
        'await checkStages([data], orgId, { priors: new Map([[data.id, existing]]) });', "if ('stage' in inStage.rows[0]) data.stage = inStage.rows[0].stage; else delete data.stage;", 'const move = stageMoveOf(existing, data, {');
    assert.ok(o.includes('    stage:              data.stage               ?? null,'), 'REGRESSION: a blank read as Discovery');
    assert.equal(count(l, "    if (!how.create && !rows.some((r) => r && typeof r === 'object' && 'stage' in r)) return { rows };\n    const funnelStages = await funnelInOrg(orgId);"), 1);
    assert.ok(l.includes('const list = row?.funnelStages ?? row?.stages;') && l.includes('return Array.isArray(list) && list.length ? list : DEFAULT_SETTINGS.funnelStages;'), 'the saved list, else the old column, else the app\'s own');
    order(s, 'const stale = sent.checked', "const heldStages = 'funnelStages' in data ? funnelStagesOf(existing[0]) : null;", 'const badStages = heldStages ? stagesRefused(data.funnelStages, heldStages) : null;',
        'if (badStages) return { statusCode: badStages.status, headers, body: JSON.stringify({ error: badStages.error, field: badStages.field }) };', 'const goneStages = heldStages ? removedStages(data.funnelStages, heldStages) : [];',
        'const renamedStages = heldStages ? stageRenames(data.funnelStages, heldStages) : [];', 'if (heldStages) data.funnelStages = stagesToStore(data.funnelStages, heldStages);', 'if (goneStages.length) {', '.where(and(eq(opportunities.orgId, orgId), inArray(opportunities.stage, goneStages)));', 'const held = stagesInUseWords(goneStages, dealsByStage(rows));',
        "if (held) return { statusCode: 409, headers, body: JSON.stringify({ error: held, code: 'inUse', field: 'funnelStages' }) };", 'const linked = await checkSettingsLinks(');
});

test('THE GUARD: the Funnel stages page names, orders and removes a stage — none a deal is in — and draws no control that does nothing', () => {
    const p = code('src/Tabs/settings/salesProcess/FunnelStagesDetail.jsx');
    for (const x of [
        'const { opportunities, setOpportunities, loadOpportunities, activeOrgId } = useApp();', 'const unproven = React.useRef([]);', 'if (e.unknown) unproven.current = [...unproven.current, { list: stagesToStore(stages, settings?.funnelStages), renames: stageRenames(stages, settings?.funnelStages) }];',
        '            unproven.current = [];\n', 'const afterLatest = async () => {\n        loadOpportunities();\n', 'const ours = renamesLanded(unproven.current, list);\n        if (ours.length) renameSavedViews(activeOrgId, ours);\n    };', 'setSettings(prev => { done(prev?.funnelStages); return prev; })', 'const saved = stageRowsOf(settings?.funnelStages);', 'const [rows, setRows]     = useState(saved);', 'const counts = dealsByStage(opportunities);',
        'const change = (fn) => { setRows(fn); setDirty(true); };', 'const update = (key, field, val) => change(prev => editedRow(prev, key, field, val));',
        'const addStage = () => { const n = added.current += 1; change(prev => addedRow(prev, n)); };', 'headAction={<button onClick={addStage}',
        'const n = dealsIn(s, counts);', 'const locked = nameLocked(s);', 'const words = renameWords(s, counts);', 'flexShrink:0, maxWidth:150 }}>{words}</span>}', 'const fixed = s.close;', '{locked\n', 'key: s.key,',
        'const up = movedRow(rows, i, -1) !== rows, down = movedRow(rows, i, 1) !== rows;', 'order: fixed ? null : (', 'disabled={!up}', 'disabled={!down}',
        "onChange={e => update(s.key, 'name', e.target.value)}", "onChange={e => update(s.key, 'weight', typedWeight(e.target.value))}", 'remove: removable(s, counts) ? <button', 'onClick={() => change(prev => removedRow(prev, s.key))}',
        'onClick={() => change(prev => movedRow(prev, i, -1))}', 'onClick={() => change(prev => movedRow(prev, i, 1))}',
        'const stages = stagesSent(rows, settings?.funnelStages);', 'const words = stagesRefused(stages, settings?.funnelStages)?.error;', 'if (words) { setSaveError(words); throw new Error(words); }',
        'setRows(stageRowsOf(kept));', 'setSaveError(e.message);', '<fieldset disabled={saving}', 'const added = React.useRef(0);', 'const openStages = rows.filter(r => !r.close);', 'const colorOf = (r) => palette[r.close ? r.name : r.key];',
        "{!s.close ? 'Open' : s.name === 'Closed Won' ? 'Won' : 'Lost'}", 'maxLength={STAGE_MAX}', 'autoFocus={!s.was}', 'if (setSettingsDirty) setSettingsDirty(dirty); return', 'useRegisterSave(settingsSaveRef, dirty, handleSave);', 'primaryAction={handleSave}', 'value={s.weight}',
        "const handleCancel = () => { if (saving) return; setRows(saved); setDirty(false); setSaveError(''); };",
        'deals: <span style={{ fontSize:12, color:T.inkMid, fontVariantNumeric:\'tabular-nums\' }}>{n}</span>,',
    ]) assert.equal(count(p, x), 1, x);
    for (const gone of ['SPDrag', 'Probability display', 'Rep-adjustable', 'All pipelines', '⋯', '<select', 'type="color"', 'Disabling a stage']) assert.ok(!p.includes(gone), gone);
    // The save, from its first line to its last.
    const save = ['setSaving(true);', 'await putSettings({ funnelStages: stages }, opened);', 'const kept = stagesToStore(stages, settings?.funnelStages), renames = stageRenames(stages, settings?.funnelStages);', 'setSettings(prev => ({ ...prev, funnelStages: kept }));', 'if (renames.length) {', 'setOpportunities(prev => prev.map(d => renamedDeal(d, renames)));', 'renameSavedViews(activeOrgId, renames);', 'landed(answer);', 'setRows(stageRowsOf(kept));', "setSaveError('');", 'setDirty(false);', 'if (e.stale && await panelStale(e)) throw e;', 'setSaveError(e.message);', 'setSaving(false);', 'throw e;', '        setSaving(false);\n    };'];
    let at = p.indexOf('    const save = async () => {');
    assert.ok(at > 0 && count(p, '    const handleSave = once(async () => {\n        try { await save(); } catch (e) { if (e.tookLatest) await afterLatest(); throw e; }\n    });') === 1);
    for (const x of save) { const i = p.indexOf(x, at + 1); assert.ok(i > at, x); at = i; }
    assert.equal(count(p, 'setSaving(false);'), 2);
    assert.ok(read('src/Tabs/settings/salesProcess/shared.jsx').includes('<div key={row.key ?? i} style'), 'a row keeps its own element where it moves');
    assert.ok(p.indexOf('if (words)') !== -1 && p.indexOf('if (words)') < p.indexOf('await putSettings('), 'the rule is asked before anything is sent');
});

const RENAME_SQL = [
    "const listOf = (v) => sql`(case when jsonb_typeof(${v}) = 'array' then ${v} else '[]'::jsonb end)`;",
    "const entries = (list) => sql`generate_series(0, jsonb_array_length(${list}) - 1) as g(n), lateral (select ${list} -> g.n as e) as t`;",
    "",
    "export function stageRenameStatements({ orgId, renames, rest, rev }) {",
    "    const exact = sql`${JSON.stringify(Object.fromEntries(renames.map((r) => [r.from, r.to])))}::jsonb`;",
    "    const taken = new Set(rest.map((s) => s.toLowerCase()));",
    "    const folded = sql`${JSON.stringify(Object.fromEntries(renames.filter((r) => !taken.has(r.from.toLowerCase())).map((r) => [r.from.toLowerCase(), r.to])))}::jsonb`;",
    "    const part = sql`${JSON.stringify(Object.fromEntries(containedRenames(renames, rest).map((r) => [r.from.toLowerCase(), r.to])))}::jsonb`;",
    "    const targets = sql`${JSON.stringify(Object.fromEntries(renames.map((r) => [r.to, 1])))}::jsonb`;",
    "    const written = sql`exists (select 1 from ${settings} where ${settings.orgId} = ${orgId} and ${settings.extra}->'revs'->>'funnelStages' = ${rev}::text)`;",
    "    const names = (v) => sql`coalesce(${exact}->>(${v}), ${folded}->>lower(btrim(${v})))`;",
    "",
    "    const history = listOf(opportunities.stageHistory);",
    "    const isMove = sql`(jsonb_typeof(e) = 'object' and (jsonb_exists(${exact}, e->>'stage') or jsonb_exists(${exact}, e->>'prevStage')))`;",
    "    const key = (k) => sql`(case when jsonb_exists(${exact}, e->>${sql.raw(`'${k}'`)}) then jsonb_build_object(${sql.raw(`'${k}'`)}, ${exact}->>(e->>${sql.raw(`'${k}'`)})) else '{}'::jsonb end)`;",
    "",
    "    const asked = sql`(case when e->>'operator' = 'contains' then ${part}->>lower(e->>'value') else coalesce(${exact}->>(e->>'value'), ${folded}->>lower(e->>'value')) end)`;",
    "    const condition = sql`(jsonb_typeof(e) = 'object' and e->>'field' in ('stage', 'from_stage', 'to_stage') and e->>'operator' in ('eq', 'neq', 'contains')",
    "        and jsonb_typeof(e->'value') = 'string' and ${asked} is not null)`;",
    "",
    "    const where = sql`${savedReports.filters}->'where'`;",
    "    const oneName = sql`(jsonb_typeof(e->'value') = 'string' and ${names(sql`e->>'value'`)} is not null)`;",
    "    const inList = sql`(jsonb_typeof(e->'value') = 'array' and exists (select 1 from jsonb_array_elements(${listOf(sql`e->'value'`)}) as i(v) where jsonb_typeof(i.v) = 'string' and ${names(sql`i.v #>> '{}'`)} is not null))`;",
    "    const filter = sql`(jsonb_typeof(e) = 'object' and e->>'id' = 'stage' and (${oneName} or ${inList}))`;",
    "",
    "    const days = sql`${settings.extra} #> '{dealModel,usual,stageDays}'`;",
    "    return [",
    "        db.update(opportunities).set({ stage: sql`${exact}->>(${opportunities.stage})` })",
    "            .where(and(eq(opportunities.orgId, orgId), written, sql`jsonb_exists(${exact}, ${opportunities.stage})`)).returning({ id: opportunities.id }),",
    "        db.update(opportunities).set({ stageHistory: sql`(select jsonb_agg(case when ${isMove} then e || ${key('stage')} || ${key('prevStage')} else e end order by g.n) from ${entries(history)})` })",
    "            .where(and(eq(opportunities.orgId, orgId), written, sql`exists (select 1 from jsonb_array_elements(${history}) as t(e) where ${isMove})`)).returning({ id: opportunities.id }),",
    "        db.update(automations).set({ conditions: sql`(select jsonb_agg(case when ${condition} then jsonb_set(e, '{value}', to_jsonb(${asked})) else e end order by g.n) from ${entries(listOf(automations.conditions))})` })",
    "            .where(and(eq(automations.orgId, orgId), written, sql`exists (select 1 from jsonb_array_elements(${listOf(automations.conditions)}) as t(e) where ${condition})`)).returning({ id: automations.id }),",
    "        db.update(savedReports).set({ filters: sql`jsonb_set(${savedReports.filters}, '{where}', (select jsonb_agg(case when ${filter} and jsonb_typeof(e->'value') = 'string' then jsonb_set(e, '{value}', to_jsonb(${names(sql`e->>'value'`)}))",
    "                when ${filter} then jsonb_set(e, '{value}', (select jsonb_agg(case when jsonb_typeof(i.v) = 'string' then to_jsonb(coalesce(${names(sql`i.v #>> '{}'`)}, i.v #>> '{}')) else i.v end order by i.k) from generate_series(0, jsonb_array_length(${listOf(sql`e->'value'`)}) - 1) as j(k), lateral (select ${listOf(sql`e->'value'`)} -> j.k as v, j.k as k) as i)) else e end order by g.n)",
    "            from ${entries(listOf(where))}))` })",
    "            .where(and(eq(savedReports.orgId, orgId), written, sql`exists (select 1 from jsonb_array_elements(${listOf(where)}) as t(e) where ${filter})`)).returning({ id: savedReports.id }),",
    "        db.update(settings).set({ extra: sql`jsonb_set(${settings.extra}, '{dealModel,usual,stageDays}', (select jsonb_object_agg(coalesce(${exact}->>d.k, d.k), d.v) from jsonb_each(${days}) as d(k, v) where jsonb_exists(${exact}, d.k) or not jsonb_exists(${targets}, d.k)))` })",
    "            .where(and(eq(settings.orgId, orgId), sql`${settings.extra}->'revs'->>'funnelStages' = ${rev}::text`, sql`jsonb_typeof(${days}) = 'object'`,",
    "                sql`exists (select 1 from jsonb_each(case when jsonb_typeof(${days}) = 'object' then ${days} else '{}'::jsonb end) as d(k, v) where jsonb_exists(${exact}, d.k))`)).returning({ id: settings.id }),",
    "    ];",
    "}",
];
