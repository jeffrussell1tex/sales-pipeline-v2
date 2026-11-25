// tests/pipelines.test.mjs
// A deal's pipeline is one of its org's (state §0.297; guide §18b140; OPEN_ITEMS §4.2, "Left by §0.296" (a), (b) — and
// Jeff, 1 Oct, on 31 deals no screen showed: "Leave the data; fix the product"). A new deal ignored the Pipeline picked in
// its window; a deal naming a pipeline the org does not have was hidden from every screen that draws a pipeline; "the default" was a different one to
// each reader; and Settings → Pipelines drew made-up pipelines and figures, and deleted by them. The server's half is
// tests/integration/deal-pipeline.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
    FALLBACK_PIPELINE, PIPELINE_COLORS, pipelinesOf, defaultPipelineOf, entriesOf, pipelineReader, pipelineIdOf, pipelineCounts, withDefaultMarked,
    pipelinesRefused, removedPipelines, inUseWords, pipelineName, KEEP_ONE_PIPELINE, PIPELINE_NEEDS_NAME, pipelineNameTaken,
} from '../src/utils/pipelines.js';
import { DEFAULT_SETTINGS } from '../src/utils/settingsDefaults.js';
import { isOpenDeal } from '../src/utils/contactDeals.js';
import { buildOpportunityRow } from '../src/utils/importRows.js';
import { leaveOut, sentBody } from '../src/utils/leaveOut.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').split('\r\n').join('\n');
const code = (p) => read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const count = (s, x) => s.split(x).length - 1;
const slice = (s, a, z) => { const i = s.indexOf(a); assert.ok(i >= 0, a); const j = s.indexOf(z, i); assert.ok(j > i, z); return s.slice(i, j); };

const THREE = [{ id: 'new-biz', name: 'New business' }, { id: 'renewal', name: 'Renewals', isDefault: true }, { id: 'exp', name: 'Expansion', color: '#123456' }];
const ids = (list) => list.map((p) => p.id);

test('P1 — the org\'s pipelines: its stored entries with an id, the first of each, each named and coloured; one fallback, the seed, for a list of none — never empty', () => {
    assert.deepEqual([FALLBACK_PIPELINE], DEFAULT_SETTINGS.pipelines, 'the seed every workspace starts with');
    for (const none of [undefined, null, [], 'x', {}, [null], [{ name: 'No id' }], [{ id: '' }], [{ id: '  ' }], [{ id: 7 }], [['a']]]) assert.deepEqual(pipelinesOf(none), [{ ...FALLBACK_PIPELINE }], JSON.stringify(none));
    assert.deepEqual(ids(pipelinesOf([{ id: 'a' }, null, { id: 'b' }, { id: 'a', name: 'again' }, { name: 'x' }])), ['a', 'b']);
    const own = pipelinesOf(THREE);
    assert.deepEqual(own.map((p) => [p.name, p.color]), [['New business', PIPELINE_COLORS[0]], ['Renewals', PIPELINE_COLORS[1]], ['Expansion', '#123456']], 'REGRESSION: "undefined18" — a pick that cannot be seen');
    assert.equal(own[1].isDefault, true);
    assert.equal(pipelinesOf([{ id: 'a', color: '#2563EB' }])[0].color, '#2563EB');
    for (const color of [undefined, '', 'red', '#12345', '#1234567', '#2563EBFF', 'x#123456', 'var(--x)', 7]) assert.equal(pipelinesOf([{ id: 'a', color }])[0].color, PIPELINE_COLORS[0], String(color));
    assert.ok(PIPELINE_COLORS.every((c) => /^#[0-9a-f]{6}$/i.test(c)) && new Set(PIPELINE_COLORS).size === PIPELINE_COLORS.length);
    const many = pipelinesOf(Array.from({ length: PIPELINE_COLORS.length + 1 }, (_, i) => ({ id: `p${i}` })));
    assert.equal(many[PIPELINE_COLORS.length].color, PIPELINE_COLORS[0]);
    for (const name of [undefined, '', '  ', 7]) assert.equal(pipelinesOf([{ id: 'a', name }])[0].name, 'Unnamed pipeline');
    assert.equal(pipelineName({ name: ' Renewals ' }), 'Renewals');
});

test('P2 — the default: the one marked, else the first', () => {
    assert.equal(defaultPipelineOf(THREE).id, 'renewal');
    assert.equal(defaultPipelineOf([{ id: 'a' }, { id: 'default' }]).id, 'a');
    assert.equal(defaultPipelineOf([{ id: 'a' }, { id: 'b', isDefault: true }, { id: 'c', isDefault: true }]).id, 'b');
    assert.equal(defaultPipelineOf([{ id: 'a' }, { id: 'b', isDefault: 'yes' }]).id, 'a');
    assert.equal(defaultPipelineOf(null).id, 'default');
});

test('P3 — a deal counts in its own pipeline while the org has it, else in the default one — never in none', () => {
    const of = pipelineReader(THREE);
    assert.deepEqual([of({ pipelineId: 'exp' }), of({ pipelineId: 'gone' }), of({ pipelineId: 'default' }), of({ pipelineId: null }), of({}), of(null)], ['exp', 'renewal', 'renewal', 'renewal', 'renewal', 'renewal'], 'REGRESSION: 31 deals no screen shows');
    assert.deepEqual([pipelineIdOf({ pipelineId: 'new-biz' }, null), pipelineIdOf({ pipelineId: 'default' }, null), pipelineIdOf({ pipelineId: 'exp' }, THREE)], ['default', 'default', 'exp']);
});

test('P4 — what each pipeline holds is counted: open, its revenue, won, lost, by stage, and the deals that name a pipeline the org does not have', () => {
    const deals = [
        { pipelineId: 'exp', stage: 'Proposal', arr: '10.5' }, { pipelineId: 'exp', stage: 'Proposal', arr: 5 }, { pipelineId: 'exp', stage: 'Closed Won', arr: 99 }, { pipelineId: 'exp', stage: 'Closed Lost', arr: 99 },
        { pipelineId: 'gone', stage: 'Discovery', arr: 'x' }, { pipelineId: 'renewal', stage: 'Discovery', arr: 7 }, { pipelineId: 'gone', stage: 'won' },
    ];
    const c = pipelineCounts(deals, THREE, isOpenDeal);
    assert.deepEqual(c.get('exp'), { open: 2, value: 15.5, won: 1, lost: 1, strays: 0, byStage: { Proposal: 2 } });
    assert.deepEqual(c.get('renewal'), { open: 2, value: 7, won: 1, lost: 0, strays: 1, byStage: { Discovery: 2 } }, 'the open ones alone stand in what is drawn open');
    assert.deepEqual(c.get('new-biz'), { open: 0, value: 0, won: 0, lost: 0, strays: 0, byStage: {} });
    assert.deepEqual([...pipelineCounts(null, THREE, isOpenDeal).keys()], ['new-biz', 'renewal', 'exp']);
});

test('P5 — a save marks its default on one entry and one alone, and leaves what it does not draw', () => {
    const marked = (list, id) => withDefaultMarked(list, id).map((p) => (p && p.id ? [p.id, p.isDefault] : p));
    assert.deepEqual(marked(THREE, 'exp'), [['new-biz', false], ['renewal', false], ['exp', true]]);
    assert.deepEqual(marked([{ id: 'a' }, null, { id: 'b' }, { name: 'x' }, { id: 'b' }], 'b'), [['a', false], null, ['b', true], { name: 'x' }, ['b', false]]);
    assert.deepEqual(marked([{ id: 'a' }, { id: 'b' }], 'gone'), [['a', true], ['b', false]], 'the one named is dropped: the first');
    assert.deepEqual([withDefaultMarked(null, 'a'), withDefaultMarked([], 'a')], [[], []]);
    // Its other keys as stored.
    assert.deepEqual(withDefaultMarked([{ id: 'a', stages: ['x'], teams: ['t'] }], 'a')[0], { id: 'a', stages: ['x'], teams: ['t'], isDefault: true });
});

test('P6 — what a list a save sends is refused for; what the org holds already is never asked', () => {
    const no = (error) => ({ status: 400, error, field: 'pipelines' });
    for (const none of [null, [], undefined, 'x', [{ name: 'no id' }]]) {
        assert.deepEqual(pipelinesRefused(none, THREE), no(KEEP_ONE_PIPELINE), JSON.stringify(none));
        assert.equal(pipelinesRefused(none, []), null, 'an org that holds none');
    }
    assert.equal(pipelinesRefused(THREE, THREE), null);
    for (const name of ['', '  ', null, undefined, 7]) assert.deepEqual(pipelinesRefused([...THREE, { id: 'x', name }], THREE), no(PIPELINE_NEEDS_NAME), String(name));
    assert.deepEqual(pipelinesRefused([...THREE, { id: 'x', name: ' RENEWALS  ' }], THREE), no(pipelineNameTaken('RENEWALS')));
    assert.deepEqual(pipelinesRefused([THREE[0], { ...THREE[1], name: 'Expansion' }, THREE[2]], THREE), no(pipelineNameTaken('Expansion')), 'a rename onto another');
    const held = [{ id: 'a' }, { id: 'b', name: 'Same' }, { id: 'c', name: 'same' }];
    assert.equal(pipelinesRefused(held, held), null);
    assert.equal(pipelinesRefused([held[0], held[1]], held), null);
    const twice = [{ id: 'eu', name: 'EU Sales' }, { id: 'eu', name: 'EU  Sales' }];
    assert.equal(pipelinesRefused(twice, twice), null, 'an id held twice, under two names');
    assert.deepEqual(pipelinesRefused([...held, { id: 'd', name: 'Same' }], held), no(pipelineNameTaken('Same')));
    assert.deepEqual(pipelinesRefused([{ id: 'a', name: ' ' }], held), no(PIPELINE_NEEDS_NAME), 'a blank name of another kind is named anew');
    assert.equal(pipelinesRefused([{ ...THREE[1], name: 'Expansion' }, { ...THREE[2], name: 'Renewals' }], THREE), null, 'two that swap names');
});

test('P7 — what a save drops, the fallback of an org that stored none too; the words name each one with open deals, and how many', () => {
    assert.deepEqual(ids(removedPipelines([THREE[0]], THREE)), ['renewal', 'exp']);
    assert.deepEqual(ids(removedPipelines([{ id: 'x' }], null)), ['default']);
    assert.deepEqual(removedPipelines([{ id: 'default' }], undefined), []);
    assert.deepEqual(removedPipelines([], null), []);
    assert.equal(inUseWords(THREE, {}), null);
    assert.equal(inUseWords(THREE, { 'new-biz': 0, exp: 1 }), '"Expansion" still has 1 open deal. Move them to another pipeline, or close them, first.');
    assert.equal(inUseWords(THREE, { renewal: 1, exp: 2 }), '"Renewals" still has 1 open deal; "Expansion" still has 2 open deals. Move them to another pipeline, or close them, first.');
});

// ── The screens ──────────────────────────────────────────────────────────────
test('the app reads one rule: the org\'s pipelines, the one picked else the default, and each deal in the one it counts in; a deal that leaves the screen is said', () => {
    const app = code('src/App.jsx');
    assert.equal(count(app, "    const allPipelines = pipelinesOf(settings.pipelines);\n    const activePipeline = allPipelines.find(p => p.id === activePipelineId) || defaultPipelineOf(allPipelines);\n    const inPipeline = pipelineReader(allPipelines);\n"), 1);
    assert.equal(count(app, '        .filter(opp => inPipeline(opp) === activePipeline.id)\n'), 1);
    assert.ok(!/pipelineId \|\| 'default'/.test(app), 'REGRESSION: a deal naming no pipeline of the org is hidden');
    assert.ok(code('src/hooks/useUIState.js').includes('const [activePipelineId, setActivePipelineId] = useOrgBoundState(resets, null);'), 'none picked: the default, never the id of one');
    assert.ok(code('src/Tabs/PipelineTab.jsx').includes('        setDraftPipeline(defaultPipelineOf(allPipelines).id);'), 'and Reset');
    assert.ok(code('src/Tabs/PipelineTab.jsx').includes('{allPipelines.length > 1 && <><span style={{ fontWeight: 600, color: T.ink }}>{activePipeline.name}</span>'), 'the tab names the pipeline on it');
    // Said: RUN as App has it.
    const said = slice(app, '    const saidElsewhere = (deal) => {', '    _onDealElsewhereRef.current = saidElsewhere;');
    let toast = null, clear = null, now = 'org_a'; const run = (active, deal, standing = null) => { toast = standing; clear = null; new Function('allPipelines', 'inPipeline', 'activePipeline', 'setUndoToast', 'setTimeout', 'requestOrg', 'stillOrg', 'deal', `${said}\nsaidElsewhere(deal);`)(pipelinesOf(THREE), pipelineReader(THREE), active, (u) => { toast = u(toast); }, (f, ms) => { clear = [f, ms]; return 7; }, () => 'org_a', (o) => o === now, deal); };
    const say = (active, deal) => { run(active, deal); return toast ? [toast.notice] : []; };
    assert.deepEqual(say({ id: 'renewal' }, { opportunityName: 'Deal', pipelineId: 'exp' }), ['"Deal" is in the Expansion pipeline.']);
    assert.deepEqual([say({ id: 'renewal' }, { account: 'Shell', pipelineId: 'exp' }), say({ id: 'exp' }, { pipelineId: 'gone' })], [['"Shell" is in the Expansion pipeline.'], ['"The deal" is in the Renewals pipeline.']]);
    assert.deepEqual([say({ id: 'exp' }, { pipelineId: 'exp' }), say({ id: 'renewal' }, { pipelineId: 'gone' })], [[], []], 'on the screen: nothing to say');
    // It stands over nothing, and clears only itself.
    run({ id: 'renewal' }, { pipelineId: 'exp' }, { error: 'Not deleted — x' }); clear[0]();
    assert.deepEqual(toast, { error: 'Not deleted — x' }, 'REGRESSION: a refusal, or an Undo, replaced');
    run({ id: 'renewal' }, { pipelineId: 'exp' }); assert.deepEqual([clear[1], toast.timerId], [5000, 7]);
    clear[0](); assert.equal(toast, null);
    run({ id: 'renewal' }, { pipelineId: 'exp' }); now = 'org_b'; clear[0](); assert.ok(toast); now = 'org_a';
    run({ id: 'renewal' }, { pipelineId: 'exp' }); toast = { error: 'later' }; clear[0](); assert.deepEqual(toast, { error: 'later' });
    assert.ok(app.includes('        get onDealElsewhere()     { return _onDealElsewhereRef.current; },'));
    const h = code('src/hooks/useOpportunities.js');
    assert.equal(count(h, 'deps.onDealElsewhere?.('), 4, 'a create and a move, the window\'s and the Closed Lost dialog\'s');
    assert.equal(count(h, "if ('pipelineId' in sentBody(updatedOpp)) deps.onDealElsewhere?.("), 2, 'REGRESSION: every edit of a deal of another pipeline said to have moved');
    const left = leaveOut({ id: 'd', pipelineId: 'exp' }, ['pipelineId']);
    assert.deepEqual(['pipelineId' in left, 'pipelineId' in sentBody(left)], [true, false], 'the key stays on the form; what is sent leaves it out');
    for (const l of ['                    if (data) deps.onDealElsewhere?.(data.opportunity || newOpp);', '            if (!r.landed) deps.onDealElsewhere?.(r.data?.opportunity || newOpp);', "                    if ('pipelineId' in sentBody(updatedOpp)) deps.onDealElsewhere?.(data.opportunity || shownRow(updatedOpp));", "            if ('pipelineId' in sentBody(updatedOpp)) deps.onDealElsewhere?.(r.data?.opportunity || shown);"]) assert.equal(count(h, l), 1, l);
});

test('a new deal is made in the pipeline picked in its window — and an edit sends one only when one is picked there — RUN, and the window', () => {
    const h = code('src/hooks/useOpportunities.js');
    const line = '            const newOpp = { ...enrichedNew, id: newId, pipelineId: enrichedNew.pipelineId || activePipeline.id };';
    assert.equal(count(h, line), 2, 'REGRESSION: the pipeline on screen over the one picked — the window\'s create, and the Closed Lost dialog\'s');
    const made = (pipelineId) => new Function('enrichedNew', 'newId', 'activePipeline', `${line}\nreturn newOpp.pipelineId;`)({ pipelineId }, 'id_1', { id: 'new-biz' });
    assert.deepEqual([made('exp'), made(''), made(undefined), made(null)], ['exp', 'new-biz', 'new-biz', 'new-biz']);
    const m = code('src/components/modals/OpportunityModal.jsx');
    assert.ok(m.includes('    const pipelinePicked = useRef(false);') && m.includes("            ...(pipelinePicked.current ? [] : ['pipelineId']),\n") && count(m, 'pipelinePicked.current = true;') === 1, 'REGRESSION: an untouched save moves the deal — its window\'s copy, or the default in place of one the org dropped');
    assert.ok(m.includes('            pipelineId:      base.pipelineId ?? activePipelineId ??'), 'the form holds what is stored, never what it counts in');
    assert.ok(m.includes('const sel = pipelineIdOf(formData, allPipelines) === p.id;') && m.includes("onClick={() => { pipelinePicked.current = true; handleChange('pipelineId', p.id); }}"), 'the one it counts in is drawn as picked');
});

test('an import names no pipeline — the server makes its deals in the default one — and says which', () => {
    const row = (opts) => buildOpportunityRow({ opportunityName: 'A' }, { today: '2026-11-24', newId: () => 'x', ...opts });
    assert.equal('pipelineId' in row({}), false, "REGRESSION: 'default', or the first of the list");
    assert.equal(row({ pipelineId: 'exp' }).pipelineId, 'exp');
    const m = code('src/components/layout/ModalLayer.jsx');
    const imp = slice(m, 'onImportOpportunities={async (newOpps', '                        const phases = [];');
    assert.ok(imp.includes('const row = buildOpportunityRow(csv, {') && !imp.includes('pipelineId'));
    assert.ok(m.includes("dealPipeline={allPipelines.length > 1 ? defaultPipelineOf(allPipelines).name : ''}"));
    assert.ok(code('src/components/modals/CsvImportModal.jsx').includes("{dealPipeline && importType === 'opportunities' && <p"));
});

// ── Settings → Pipelines ─────────────────────────────────────────────────────
const PAGE = 'src/Tabs/settings/salesProcess/PipelinesDetail.jsx';
const STATE = (over = {}) => ({ settings: { pipelines: THREE, funnelStages: [{ name: 'Discovery', weight: 20 }] }, opportunities: [], ...over });
// The page's own lines that work out what it draws and writes, run.
const derived = ({ settings, opportunities }, picked = null) => {
    const body = slice(code(PAGE), '    const pipelines = pipelinesOf(settings?.pipelines);', '    const handleAddPipeline = async');
    const sent = [];
    const out = new Function('settings', 'opportunities', 'selectedId', 'persist', 'entriesOf', 'pipelinesOf', 'defaultPipelineOf', 'pipelineCounts', 'withDefaultMarked', 'isOpenDeal',
        `${body}\nreturn { pipelines, defaultOne, selected, held, closedOf, stored, saveList, weightOf, money, assignmentRules };`)(settings, opportunities, picked, (p, l) => { sent.push([p, l]); return true; }, entriesOf, pipelinesOf, defaultPipelineOf, pipelineCounts, withDefaultMarked, isOpenDeal);
    return { ...out, sent };
};

test('Settings → Pipelines draws the org\'s own, and counts: no made-up pipeline, figure, team or rule — RUN', () => {
    const s = read(PAGE);
    for (const lie of ['DEFAULT_PIPELINES', 'DEFAULT_ASSIGNMENT_RULES', 'STAGE_PROBS', "'new-biz'", 'SMB West', '$4.8M', '42-i*5', '5+i*2', '.active', 'p.value', 'can be safely deleted', "Avg days'"]) assert.ok(!s.includes(lie), `REGRESSION: ${lie}`);
    const d = derived(STATE({ opportunities: [{ pipelineId: 'exp', stage: 'Discovery', arr: 1500 }, { pipelineId: 'exp', stage: 'Closed Won' }, { pipelineId: 'gone', stage: 'Discovery', arr: 1 }] }));
    assert.deepEqual([d.selected.id, d.defaultOne.id, d.held('exp').open, d.money(d.held('exp').value), d.closedOf('exp'), d.held('renewal').strays, d.held('nope').open], ['renewal', 'renewal', 1, '$1,500', 1, 1, 0]);
    assert.deepEqual([d.weightOf('Discovery'), d.weightOf('Nope')], [20, undefined]);
    // An org that stored none, or an empty list: the one every screen draws — and it is what a save builds on.
    for (const pipelines of [undefined, null, [], [null], [{ id: 1, name: 'A' }]]) {
        const none = derived(STATE({ settings: { pipelines } }));
        assert.deepEqual([ids(none.pipelines), none.stored.map((p) => p.id), none.selected.id], [['default'], ['default'], 'default'], 'REGRESSION: three made-up pipelines, saved by the next press');
    }
    assert.deepEqual(derived(STATE({ settings: { pipelines: [null, { id: 'a' }] } })).stored, [null, { id: 'a' }], 'the stored list as it is, what is not drawn with it');
    // What a save sends: the list with its default marked, and its own when another is named.
    d.saveList(THREE, 'X'); d.saveList(THREE, 'Y', 'exp');
    assert.deepEqual([d.money(15.5), d.money(0), derived(STATE({ settings: { funnelStages: [null, { name: 'Closed Lost', weight: 0 }] } })).weightOf('Closed Lost')], ['$16', '$0', 0]);
    assert.equal(derived(STATE({ opportunities: [{ pipelineId: 'exp', stage: 'Closed Won' }, { pipelineId: 'exp', stage: 'Closed Lost' }] })).closedOf('exp'), 2);
    assert.deepEqual(d.sent.map(([p, l]) => [l, p.pipelines.filter((x) => x.isDefault).map((x) => x.id)]), [['X', ['renewal']], ['Y', ['exp']]]);
    // The rules card: what the org saved alone — never the territory rules that share the key.
    assert.deepEqual([derived(STATE()).assignmentRules, derived(STATE({ settings: { assignmentRules: [{ field: 'name', contains: 'x', territory: 'West' }, null, { team: 'T' }, { defaultPipeline: 'P' }, { team: 'T', defaultPipeline: 'P' }] } })).assignmentRules], [[], [{ team: 'T', defaultPipeline: 'P' }]]);
});

const handler = (name, next) => slice(code(PAGE), `    const ${name} = `, next).trimEnd();
test('Delete asks the counts: never the only one, the default, or one with open deals; it says where its closed ones will count — RUN', () => {
    const src = handler('handleDeletePipeline', '    const handleConfirmDeletePipeline = async');
    const go = (pipelines, opportunities, id) => {
        const d = derived(STATE({ settings: { pipelines }, opportunities })); const did = {};
        new Function('pipelines', 'defaultOne', 'held', 'setBlockedDeletePipeline', 'setOpenPipelineKebab', 'setConfirmDeletePipeline', 'id', `${src}\nhandleDeletePipeline(id);`)(d.pipelines, d.defaultOne, d.held, (v) => { did.blocked = v; }, () => {}, (v) => { did.confirm = v; }, id);
        return did;
    };
    assert.match(go([THREE[0]], [], 'new-biz').blocked.reason, /^This is the only pipeline\./);
    assert.match(go(THREE, [], 'renewal').blocked.reason, /^This is the default pipeline\./);
    assert.match(go([THREE[0], THREE[2]], [], 'new-biz').blocked.reason, /^This is the default pipeline\./, 'unmarked, the first');
    assert.equal(go(THREE, [{ pipelineId: 'exp', stage: 'Proposal' }], 'exp').blocked.reason, 'This pipeline has 1 open deal. Move them to another pipeline, or close them, before deleting.', 'REGRESSION: deleted by a number typed in, its deals with it');
    assert.equal(go(THREE, [{ pipelineId: 'exp', stage: 'Proposal' }, { pipelineId: 'exp', stage: 'Discovery' }], 'exp').blocked.reason.slice(0, 36), 'This pipeline has 2 open deals. Move');
    assert.deepEqual(go([THREE[1], { ...THREE[2], active: 62 }], [{ pipelineId: 'exp', stage: 'Closed Lost' }], 'exp'), { confirm: 'exp' }, 'a number stored is nothing');
    assert.deepEqual(go(THREE, [], 'nope'), {});
    assert.ok(read(PAGE).includes('This pipeline has no open deals.{closedOf(p?.id) > 0 ? ` Its ${closedOf(p.id)} closed deal${closedOf(p.id) === 1 ? \'\' : \'s\'} will count in "${defaultOne.name}".` : \'\'}'));
});

test('a drag reorders the stored list and moves no default; each stage change, a new default and a delete send what they say — RUN', async () => {
    const drop = handler('handlePipelineDrop', '    const handleDeletePipeline = ');
    const run = async (pipelines, from, to) => { const d = derived(STATE({ settings: { pipelines } })); await new Function('pipelines', 'stored', 'saveList', 'a', 'b', `${drop}\nreturn handlePipelineDrop(a, b);`)(d.pipelines, d.stored, d.saveList, from, to); return d.sent.map(([p]) => p.pipelines.map((x) => (x && x.id ? `${x.id}${x.isDefault ? '*' : ''}` : x))); };
    assert.deepEqual(await run(THREE, 2, 0), [['exp', 'new-biz', 'renewal*']]);
    assert.deepEqual(await run([{ id: 'a' }, { id: 'b' }], 1, 0), [['b', 'a*']], 'REGRESSION: unmarked, a drag moved the default');
    assert.deepEqual(await run([{ id: 'a' }, null, { id: 'b' }], 0, 1), [['b', 'a*', null]], 'what is not drawn stays, last');
    assert.deepEqual([await run(THREE, 1, 1), await run(THREE, null, 2)], [[], []], 'nothing moved: a place to itself; a drag that began on the stages, or outside the page');
    // Each stage change: the pipeline picked's, the others as stored (with none picked, the one drawn: the text pin below).
    const LIST = [{ id: 'a', stages: ['x'], isDefault: true }, { id: 'b', stages: ['One', 'Two', 'Closed Won'] }];
    const stage = async (name, next, scope, ...args) => {
        const d = derived(STATE({ settings: { pipelines: LIST } }), 'b'); const no = () => {};
        const S = { pipelines: d.pipelines, stored: d.stored, selected: d.selected, selectedId: 'b', saveList: d.saveList, STAGE_TYPES: { 'Closed Won': 'Won', 'Closed Lost': 'Lost' }, setStageErr: no, setNewStageName: no, setNewStageType: no, setShowAddStage: no, setRenamingStage: no, setRenameVal: no, setOpenKebab: no, setConfirmDelete: no, ...scope };
        await new Function(...Object.keys(S), 'args', `${handler(name, next)}\nreturn ${name}(...args);`)(...Object.values(S), args);
        return d.sent.map(([p]) => p.pipelines.map((x) => `${x.stages.join()}${x.isDefault ? '*' : ''}`));   // * the default: never moved by a stage
    };
    assert.deepEqual(await stage('handleAddStage', '    const handlePipelineDrop', { newStageName: 'Three', newStageType: 'Open' }), [['x*', 'One,Two,Three,Closed Won']], 'REGRESSION: an Add stage that saves nothing and closes as if it had');
    assert.deepEqual(await stage('handleStageDrop', '    const handleRenameStage', {}, 1, 0), [['x*', 'Two,One,Closed Won']]);
    assert.deepEqual(await stage('handleStageDrop', '    const handleRenameStage', {}, null, 1), []);
    assert.deepEqual(await stage('handleRenameStage', '    const handleDeleteStage', { renameVal: 'Uno', renamingStage: 'One' }), [['x*', 'Uno,Two,Closed Won']]);
    assert.deepEqual(await stage('handleDeleteStage', '    const selStyle', {}, 'One'), [['x*', 'Two,Closed Won']]);
    // A delete sends the list without it, the rest as stored.
    { const d = derived(STATE({ settings: { pipelines: [...THREE, null] } })); await new Function('stored', 'confirmDeletePipeline', 'selectedId', 'setConfirmDeletePipeline', 'setSelectedId', 'saveList', `${handler('handleConfirmDeletePipeline', '    const handleExportJSON')}\nreturn handleConfirmDeletePipeline();`)(d.stored, 'exp', null, () => {}, () => {}, d.saveList);
        assert.deepEqual(d.sent.map(([p, l]) => [l, p.pipelines.map((x) => x && x.id + (x.isDefault ? '*' : ''))]), [['Pipeline deletion', ['new-biz', 'renewal*', null]]]); }
    // A rule edited: the whole key sent, the territory rules that share it untouched.
    { const rules = [{ field: 'name', contains: 'x', territory: 'West' }, { team: 'T', defaultPipeline: 'P' }, null]; const sent = [];
        await new Function('settings', 'assignmentRules', 'setEditingTeam', 'persist', `${handler('handleAssignmentChange', '    const handleAddStage')}\nreturn handleAssignmentChange('T', 'Q');`)({ assignmentRules: rules }, rules.slice(1, 2), () => {}, (p) => sent.push(p.assignmentRules));
        assert.deepEqual(sent, [[rules[0], { team: 'T', defaultPipeline: 'Q' }, null]], 'REGRESSION: the territory rules lost with an Edit'); }
    const s = code(PAGE);
    // Set as default, and what is drawn and exported, as counted.
    for (const l of ["await saveList(stored, 'Default pipeline', p.id);", "const ok = await saveList(updated, 'Pipeline', newDefault ? newPipeline.id : defaultOne.id);", "{held(p.id).open} open · {money(held(p.id).value)}</span>", "(held(selected.id).byStage[s] || 0)", 'openDeals: held(p.id).open, openRevenue: held(p.id).value, wonDeals: held(p.id).won, lostDeals: held(p.id).lost,', '{held(p.id).strays > 0 && (', 'Including {held(p.id).strays} open deal', '{p.id === defaultOne.id && <span', '{p.id !== defaultOne.id && (', '${selected.id===p.id ? T.goldInk', "background: selected.id===p.id ? 'rgba(200,185,154,0.1)'", '{weightOf(s) !== undefined ? `${weightOf(s)}%` : ',  'isDefault: p.id === defaultOne.id, stages: p.stages,']) assert.equal(count(s, l), 1, l);
    assert.equal(count(s, 'p && p.id === selected.id ? { ...p, stages'), 4, 'REGRESSION: an Add stage that saves nothing and closes as if it had');
    assert.equal(count(s, 'p.id === selectedId'), 1, 'the one drawn, found by the one picked');
    assert.ok(!s.includes('selectedId===') && !/\{!?p\.isDefault/.test(s), 'nothing drawn asks the pick, or the mark');
    assert.ok(s.includes("id:        'pl_' + crypto.randomUUID(),"), 'never an id made from the name');
    assert.equal(count(s, 'saveList('), 8, 'each change of the list, with its default');
    assert.equal(count(s, "persist({ pipelines:"), 1, 'through saveList alone');
});

test('THE GUARD — no screen reads a pipeline around the rule: the list, the default, or a deal\'s pipeline', () => {
    const walk = (d) => readdirSync(new URL('../' + d, import.meta.url), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}${e.name}/`) : /\.jsx?$/.test(e.name) ? [d + e.name] : []));
    const files = walk('src/').filter((f) => f !== 'src/utils/pipelines.js');
    assert.ok(files.length > 200 && files.includes('src/components/modals/OpportunityModal.jsx'));
    // Who reads the stored list: App, and the page that edits it; the cards count it.
    const LIST = { 'src/App.jsx': 1, [PAGE]: 3, 'src/utils/settingsCards.js': 3 };
    const reads = {};
    for (const f of files) {
        const s = code(f);
        // The deal window's own props are the app's list, never empty: its last resort is the one name left.
        assert.ok(!/[pP]ipelines(\?\.)?\[0\]|'new-biz'/.test(s), `REGRESSION: ${f} — the first of the list for the default`);
        assert.ok(!/pipelineId \|\| 'default'/.test(s), `REGRESSION: ${f} — a deal's pipeline read around the rule`);
        const n = [...s.matchAll(/settings\??\.pipelines\b/g)].length; if (n) reads[f] = n;
        assert.ok(!/pipelines?\w*\.(find|some|filter)\([^)]*isDefault/.test(s), `${f}: the mark is the rule's to read`);
    }
    assert.deepEqual(reads, LIST, 'REGRESSION: the stored list read around pipelinesOf');
    const l = read('netlify/functions/_links.mjs');
    assert.ok(!/catch/.test(slice(l, 'export async function pipelinesInOrg(orgId) {', 'export async function liveIdsInOrg(')), 'a read that fails throws: never the one pipeline of an org that stored none (guide §18b138)');
    const o = read('netlify/functions/opportunities.mjs');
    assert.equal(count(o, 'defaultPipelineIn(orgId)'), 2, 'a create that names none, single and bulk');
    assert.equal(count(o, "'pipelineId' in data && !data.pipelineId"), 1);
    assert.equal(count(o, 'data.map(blankPipelineOff)'), 1);
});

test('the server asks one rule: each write of a deal, and the settings save — pinned; run in tests/integration/deal-pipeline.itest.mjs', () => {
    const o = code('netlify/functions/opportunities.mjs');
    for (const l of [
        "const blankPipelineOff = (d) => { if (!d || typeof d !== 'object' || !('pipelineId' in d) || d.pipelineId) return d; const { pipelineId: _blank, ...rest } = d; return rest; };",
        '                if (people.rows.some(r => !r.pipelineId)) { const own = await defaultPipelineIn(orgId); people.rows = people.rows.map(r => (r.pipelineId ? r : { ...r, pipelineId: own })); }',
        "            if (!data.pipelineId) data.pipelineId = await defaultPipelineIn(orgId);   // the org's default (state §0.297)",
    ]) assert.equal(count(o, l), 1, l);
    // A create's is filled after it is asked, and before the row is built; a save's blank dropped before either.
    const order = (s, ...xs) => { let at = -1; for (const x of xs) { const i = s.indexOf(x, at + 1); assert.ok(i > at, x); at = i; } };
    order(o, 'const people = await checkBulkLinks(DEAL_LINKS, linked.rows, orgId);', 'if (people.rows.some(r => !r.pipelineId))', 'await stampOwnerIds(people.rows.map(', 'const people = await checkLinks(DEAL_LINKS, data, null, orgId);', 'if (!data.pipelineId) data.pipelineId', 'const named = { ...data, ...people.set };',
        'data.splice(0, data.length, ...data.map(blankPipelineOff));', 'const people = await checkBulkLinks(DEAL_LINKS, data, orgId, { held: priors });', "if ('pipelineId' in data && !data.pipelineId) delete data.pipelineId;", 'const people = await checkLinks(DEAL_LINKS, data, existing, orgId);');
    const l = code('netlify/functions/_links.mjs');
    assert.equal(count(l, 'export const defaultPipelineIn = async (orgId) => defaultPipelineOf(await pipelinesInOrg(orgId)).id;'), 1);
    assert.equal(count(l, 'return pipelinesOf(listed.flatMap((r) => (Array.isArray(r.pipelines) ? r.pipelines : [])));'), 1);
    const s = code('netlify/functions/settings.mjs');
    for (const x of [
        "const badPipes = 'pipelines' in data ? pipelinesRefused(data.pipelines, existingExtra.pipelines) : null;",
        'if (badPipes) return { statusCode: badPipes.status, headers, body: JSON.stringify({ error: badPipes.error, field: badPipes.field }) };',
        "const gonePipes = 'pipelines' in data ? removedPipelines(data.pipelines, base.pipelines) : [];",
        '.where(and(eq(opportunities.orgId, orgId), inArray(opportunities.pipelineId, gonePipes.map(p => p.id))));',
        'for (const d of named) if (isOpenDeal(d)) open[d.pipelineId] = (open[d.pipelineId] || 0) + 1;',
        'const held = inUseWords(gonePipes, open);',
        "if (held) return { statusCode: 409, headers, body: JSON.stringify({ error: held, code: 'inUse', field: 'pipelines' }) };",
    ]) assert.equal(count(s, x), 1, x);
    order(s, 'const stale = sent.checked', 'for (const key of SETTINGS_LISTS) {', 'const badPipes =', 'if (gonePipes.length) {', 'const linked = await checkSettingsLinks(', 'let encryptedApiKey;');
});
