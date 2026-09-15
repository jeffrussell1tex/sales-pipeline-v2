// tests/report-prompt.test.mjs
//
// The report builder reads its prompt (state §0.139; Jeff: "No matter what I
// type in it seems to want to solve for days stuck for more than 14 days").
// Before: the "AI-generated" view drew one hard-coded picture for every prompt
// and admitted so in small print. Now the prompt is interpreted into the
// engine's own vocabulary and the engine has row filters to express it. The
// two pure modules are RUN here; the tab, Home and the delivery job are source
// scans (§18b23).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filtersFor, resolveWhere, whereLabel, runReport, fieldsFor } from '../src/utils/reportQuery.js';
import { interpretPrompt, normalizePrompt, PROMPT_STARTERS } from '../src/utils/reportPrompt.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

// ── fixtures: a small org as the tab holds it (today is 30 Sep 2026) ────────
const TODAY = new Date('2026-09-30T15:00:00Z');
const opps = [
    { id: 'o1', salesRep: 'Karen', stage: 'Proposal',    arr: '40000', forecastedCloseDate: '2026-10-15', createdDate: '2026-08-01', stageChangedDate: '2026-09-01', vertical: 'Manufacturing' },
    { id: 'o2', salesRep: 'Karen', stage: 'Closed Won',  arr: '60000', forecastedCloseDate: '2026-07-20', createdDate: '2026-05-01', wonDate: '2026-07-10', vertical: 'Manufacturing' },
    { id: 'o3', salesRep: 'Ryan',  stage: 'Closed Lost', arr: '25000', forecastedCloseDate: '2026-06-30', createdDate: '2026-04-01', lostDate: '2026-06-28', vertical: 'Health' },
    { id: 'o4', salesRep: 'Ryan',  stage: 'Discovery',   arr: '',      forecastedCloseDate: '',           createdDate: '2026-09-10', vertical: '' },
];
const activities = [
    { id: 'x1', type: 'Call',  date: '2026-09-02', opportunityId: 'o1', author: 'Karen', duration: '30' },
    { id: 'x2', type: 'Email', date: '2026-09-05', opportunityId: 'o1', author: 'Karen', duration: '5' },
    { id: 'x3', type: 'Call',  date: '2026-06-20', opportunityId: 'o3', author: 'Ryan',  duration: '15' },
];
const leads = [
    { id: 'l1', assignedTo: 'Karen', source: 'Web Form', status: 'Converted', score: '80', createdAt: '2026-08-20T10:00:00Z', leadScoreBucket: 'hot' },
    { id: 'l2', assignedTo: 'Ryan',  source: 'Web Form', status: 'New',       score: '40', createdAt: '2026-09-01T10:00:00Z', leadScoreBucket: 'warm' },
];
const data = { opportunities: opps, accounts: [], leads, activities, settings: { fiscalYearStart: '1' } };
const run = (def) => runReport(def, data, { today: TODAY, fiscalStart: 1 });
const ids = (def) => run({ ...def, dims: [], metrics: [{ id: 'deals' }] }).count;

// ── the engine's row filters ─────────────────────────────────────────────────
test('filtersFor: every source has an allowlist; deals carry status, silence, stage age and size on top of every text dimension', () => {
    const opp = filtersFor('Opportunities').map(f => f.id);
    assert.deepEqual(opp.slice(0, 4), ['status', 'no_activity_days', 'days_in_stage', 'arr']);
    for (const d of fieldsFor('Opportunities').dims.filter(d => d.kind === 'text')) assert.ok(opp.includes(d.id), `text dim ${d.id} is a filter`);
    assert.ok(!opp.includes('close_date'), 'a month dimension is the period’s business, not a filter');
    assert.deepEqual(filtersFor('Activity').map(f => f.id), ['rep', 'type', 'outcome']);
    assert.deepEqual(filtersFor('Leads').map(f => f.id), ['score', 'assigned_to', 'source', 'status', 'score_bucket']);
    assert.deepEqual(filtersFor('Accounts').map(f => f.id), ['owner', 'industry', 'territory', 'tier', 'segment', 'state']);
    assert.equal(filtersFor('Quotes'), filtersFor('Opportunities'), 'an unknown source falls back to deals, like fieldsFor');
    const status = filtersFor('Opportunities')[0];
    assert.deepEqual(status.options.map(o => o.value), ['open', 'won', 'lost']);
    assert.deepEqual([...status.ops], ['eq']);
    for (const f of filtersFor('Opportunities')) assert.ok(typeof f.test === 'function' && ['choice', 'number', 'text'].includes(f.kind), f.id);
});

test('resolveWhere is an allowlist: unknown ids, unreadable numbers, unknown choices and empty lists are dropped and named; an unknown op becomes the filter’s first', () => {
    const { where, dropped } = resolveWhere('Opportunities', [
        { id: 'status', op: 'eq', value: 'open' },
        { id: 'no_activity_days', op: 'gte', value: '14' },
        { id: 'arr', op: 'between', value: 5 },
        { id: 'owner', op: 'in', value: ['Karen', '', 'Ryan'] },
        { id: 'competitor', op: 'eq', value: 'x' },
        { id: 'arr', op: 'gte', value: 'lots' },
        { id: 'status', op: 'eq', value: 'stalled' },
        { id: 'type', op: 'in', value: [] },
        'status', null,
    ]);
    assert.deepEqual(where, [
        { id: 'status', op: 'eq', value: 'open' },
        { id: 'no_activity_days', op: 'gte', value: 14 },
        { id: 'arr', op: 'gte', value: 5 },
        { id: 'owner', op: 'in', value: ['Karen', 'Ryan'] },
    ]);
    assert.equal(dropped.length, 6);
    assert.deepEqual(resolveWhere('Leads', undefined), { where: [], dropped: [] });
});

test('runReport applies every filter after the period: status, silence, stage age, size, a text dimension (case-insensitively), a list', () => {
    assert.equal(ids({ source: 'Opportunities' }), 4);
    assert.equal(ids({ source: 'Opportunities', where: [{ id: 'status', op: 'eq', value: 'open' }] }), 2, 'o1 and o4');
    assert.equal(ids({ source: 'Opportunities', where: [{ id: 'status', op: 'eq', value: 'won' }] }), 1);
    assert.equal(ids({ source: 'Opportunities', where: [{ id: 'status', op: 'eq', value: 'lost' }] }), 1);
    // o1's last activity is 5 Sep (25 days); o4 has none and was created 10 Sep (20 days)
    assert.equal(ids({ source: 'Opportunities', where: [{ id: 'status', op: 'eq', value: 'open' }, { id: 'no_activity_days', op: 'gte', value: 14 }] }), 2, 'both open deals are silent 14+ days');
    assert.equal(ids({ source: 'Opportunities', where: [{ id: 'status', op: 'eq', value: 'open' }, { id: 'no_activity_days', op: 'gte', value: 21 }] }), 1, 'only o1 is silent 21+ days — a deal with no activity counts from its creation');
    assert.equal(ids({ source: 'Opportunities', where: [{ id: 'days_in_stage', op: 'gte', value: 100 }] }), 2, 'the closed deals sit on their creation day');
    assert.equal(ids({ source: 'Opportunities', where: [{ id: 'arr', op: 'gte', value: 50000 }] }), 1);
    assert.equal(ids({ source: 'Opportunities', where: [{ id: 'arr', op: 'lte', value: 30000 }] }), 2, 'o3 and the blank o4 (read as 0)');
    assert.equal(ids({ source: 'Opportunities', where: [{ id: 'owner', op: 'eq', value: 'karen' }] }), 2, 'the owner compared without case');
    assert.equal(ids({ source: 'Opportunities', where: [{ id: 'owner', op: 'ne', value: 'Karen' }] }), 2);
    assert.equal(ids({ source: 'Opportunities', where: [{ id: 'industry', op: 'eq', value: 'None' }] }), 1, 'a blank industry groups as None and filters as None');
    assert.equal(ids({ source: 'Opportunities', period: 'Q3', where: [{ id: 'status', op: 'eq', value: 'won' }] }), 1, 'the period first (o2 closes in Q3 of a January fiscal year)');
    assert.equal(ids({ source: 'Opportunities', period: 'Q4', where: [{ id: 'status', op: 'eq', value: 'won' }] }), 0);
    assert.equal(run({ source: 'Activity', dims: [], metrics: [{ id: 'activities' }], where: [{ id: 'type', op: 'in', value: ['Call', 'Meeting'] }] }).count, 2);
    assert.equal(run({ source: 'Activity', dims: [], metrics: [{ id: 'activities' }], where: [{ id: 'type', op: 'eq', value: 'email' }] }).count, 1);
    assert.equal(run({ source: 'Leads', dims: [], metrics: [{ id: 'leads' }], where: [{ id: 'status', op: 'eq', value: 'Converted' }] }).count, 1);
    assert.equal(run({ source: 'Leads', dims: [], metrics: [{ id: 'leads' }], where: [{ id: 'score', op: 'gte', value: 50 }] }).count, 1);
    const r = run({ source: 'Opportunities', dims: [{ id: 'owner' }], metrics: [{ id: 'deals' }, { id: 'revenue' }], where: [{ id: 'status', op: 'eq', value: 'open' }, { id: 'competitor', op: 'eq', value: 'x' }] });
    assert.deepEqual(r.where, [{ id: 'status', op: 'eq', value: 'open' }], 'the result says which filters ran');
    assert.equal(r.rows.length, 2); assert.equal(r.totals.deals, 2); assert.equal(r.totals.revenue, 40000);
    assert.match(r.warnings[0], /1 filter this report was saved with could not be applied for Opportunities: competitor\./);
});

test('whereLabel: a filter in words', () => {
    assert.equal(whereLabel('Opportunities', { id: 'status', op: 'eq', value: 'open' }), 'Open deals');
    assert.equal(whereLabel('Opportunities', { id: 'no_activity_days', op: 'gte', value: 14 }), 'Days since last activity ≥ 14');
    assert.equal(whereLabel('Opportunities', { id: 'arr', op: 'gte', value: 50000 }), 'Deal size ≥ $50K');
    assert.equal(whereLabel('Opportunities', { id: 'owner', op: 'eq', value: 'Karen' }), 'Owner is Karen');
    assert.equal(whereLabel('Opportunities', { id: 'owner', op: 'ne', value: 'Karen' }), 'Owner is not Karen');
    assert.equal(whereLabel('Activity', { id: 'type', op: 'in', value: ['Call', 'Meeting'] }), 'Type is one of Call, Meeting');
    assert.equal(whereLabel('Activity', { id: 'nope' }), 'nope');
});

// ── the interpreter ──────────────────────────────────────────────────────────
const AT = new Date('2026-09-15T15:00:00Z');
const read1 = (p, opts = {}) => interpretPrompt(p, { today: AT, fiscalStart: 1, ...opts });
const brief = (r) => ({ source: r.definition.source, dims: r.definition.dims.map(d => d.id), metrics: r.definition.metrics.map(m => m.id), period: r.definition.period, where: r.definition.where, chart: r.definition.chartType });

test('every starter the picker offers is read in full — no "cannot do" note, a real definition', () => {
    assert.equal(PROMPT_STARTERS.length, 4);
    const r = PROMPT_STARTERS.map(p => read1(p));
    for (const x of r) assert.deepEqual(x.notes, [], x.name);
    assert.deepEqual(brief(r[0]), { source: 'Opportunities', dims: ['owner'], metrics: ['deals', 'revenue'], period: 'all', where: [{ id: 'no_activity_days', op: 'gte', value: 14 }, { id: 'status', op: 'eq', value: 'open' }], chart: 'bar' });
    assert.deepEqual(brief(r[1]), { source: 'Opportunities', dims: ['industry'], metrics: ['revenue'], period: 'FY', where: [{ id: 'status', op: 'eq', value: 'won' }], chart: 'bar' });
    assert.deepEqual(brief(r[2]), { source: 'Leads', dims: ['source'], metrics: ['leads'], period: 'Q3', where: [], chart: 'bar' });
    assert.deepEqual(brief(r[3]), { source: 'Activity', dims: ['rep'], metrics: ['activities'], period: 'custom', where: [{ id: 'type', op: 'in', value: ['Call', 'Meeting'] }], chart: 'bar' });
    assert.equal(r[3].definition.from, '2026-08-17'); assert.equal(r[3].definition.to, '2026-09-15');
    assert.equal(r[0].name, 'Deals stuck more than 14 days, by rep', 'the prompt is the report’s name');
    assert.deepEqual(r[0].understood.map(u => u.kind), ['source', 'filter', 'filter', 'group', 'measure', 'measure', 'chart', 'period']);
    assert.deepEqual(r[0].understood.filter(u => u.kind === 'filter').map(u => u.text), ['Days since last activity ≥ 14', 'Open deals']);
});

test('different prompts read differently — the source, the grouping, the measure, the filters, the chart each from the words', () => {
    assert.deepEqual(brief(read1('Revenue by stage this quarter')), { source: 'Opportunities', dims: ['stage'], metrics: ['revenue'], period: 'Q3', where: [], chart: 'bar' });
    assert.deepEqual(brief(read1('Pipeline by rep')), { source: 'Opportunities', dims: ['owner'], metrics: ['revenue'], period: 'all', where: [], chart: 'bar' });
    assert.deepEqual(brief(read1('Open deals over $50k by owner')).where, [{ id: 'arr', op: 'gte', value: 50000 }, { id: 'status', op: 'eq', value: 'open' }]);
    assert.deepEqual(brief(read1('Deals in stage for more than 30 days')), { source: 'Opportunities', dims: [], metrics: ['deals', 'revenue'], period: 'all', where: [{ id: 'days_in_stage', op: 'gte', value: 30 }], chart: 'kpi' });
    assert.deepEqual(brief(read1('Deals silent 21+ days by territory')).where, [{ id: 'no_activity_days', op: 'gte', value: 21 }, { id: 'status', op: 'eq', value: 'open' }]);
    assert.deepEqual(brief(read1('Average deal size by industry')).metrics, ['avg_deal']);
    assert.deepEqual(brief(read1('Sales cycle by territory')).metrics, ['days_to_close']);
    assert.deepEqual(brief(read1('Revenue by sales rep')), { source: 'Opportunities', dims: ['owner'], metrics: ['revenue'], period: 'all', where: [], chart: 'bar' }, '"sales rep" is a person, not a measure');
    assert.deepEqual(brief(read1('How many open deals')), { source: 'Opportunities', dims: [], metrics: ['deals'], period: 'all', where: [{ id: 'status', op: 'eq', value: 'open' }], chart: 'kpi' });
    assert.deepEqual(brief(read1('Lost deals by loss reason this year')), { source: 'Opportunities', dims: ['loss_reason'], metrics: ['deals', 'revenue'], period: 'FY', where: [{ id: 'status', op: 'eq', value: 'lost' }], chart: 'bar' });
    const both = read1('Won and lost by rep');
    assert.deepEqual(brief(both), { source: 'Opportunities', dims: ['stage', 'owner'], metrics: ['revenue'], period: 'all', where: [], chart: 'stacked' });
    assert.match(both.notes[0], /Won and lost together/);
    assert.deepEqual(brief(read1('Accounts by tier')), { source: 'Accounts', dims: ['tier'], metrics: ['accounts', 'revenue'], period: 'all', where: [], chart: 'bar' });
    assert.deepEqual(brief(read1('Hot leads by rep')), { source: 'Leads', dims: ['assigned_to'], metrics: ['leads'], period: 'all', where: [{ id: 'score_bucket', op: 'eq', value: 'hot' }], chart: 'bar' });
    assert.deepEqual(brief(read1('Leads converted by source')).where, [{ id: 'status', op: 'eq', value: 'Converted' }]);
    assert.deepEqual(brief(read1('Emails per rep by month')), { source: 'Activity', dims: ['date', 'rep'], metrics: ['activities'], period: 'all', where: [{ id: 'type', op: 'eq', value: 'Email' }], chart: 'line' });
    assert.deepEqual(brief(read1('Activities by type over time')), { source: 'Activity', dims: ['date', 'type'], metrics: ['activities'], period: 'all', where: [], chart: 'line' });
    assert.deepEqual(brief(read1('Minutes logged by rep')).metrics, ['duration']);
    assert.deepEqual(brief(read1('deals closing this month by stage funnel')).chart, 'funnel');
    assert.deepEqual(brief(read1('top deals table')).chart, 'table', 'a said chart stands even with nothing to group by');
    assert.equal(read1('Revenue by rep and industry').definition.chartType, 'stacked', 'two dimensions stack by default');
    assert.deepEqual(brief(read1('Revenue by rep and industry')).dims, ['owner', 'industry'], 'in the order the sentence names them');
});

test('periods: the fiscal calendar’s quarter, custom windows from today, all time by default', () => {
    assert.equal(read1('revenue this quarter').definition.period, 'Q3', 'January fiscal year: September is Q3');
    assert.equal(interpretPrompt('revenue this quarter', { today: AT, fiscalStart: 10 }).definition.period, 'Q4', 'October fiscal year: September is Q4');
    assert.equal(read1('revenue q2').definition.period, 'Q2');
    assert.equal(read1('revenue this year').definition.period, 'FY');
    assert.equal(read1('revenue ytd').definition.period, 'FY');
    const lastQ = read1('revenue last quarter').definition;
    assert.deepEqual([lastQ.period, lastQ.from, lastQ.to], ['custom', '2026-04-01', '2026-06-30']);
    const lastY = read1('revenue last fiscal year').definition;
    assert.deepEqual([lastY.period, lastY.from, lastY.to], ['custom', '2025-01-01', '2025-12-31'], '"last fiscal year" is not "this fiscal year"');
    const d30 = read1('revenue last 30 days').definition;
    assert.deepEqual([d30.from, d30.to], ['2026-08-17', '2026-09-15']);
    const m6 = read1('revenue last 6 months').definition;
    assert.deepEqual([m6.from, m6.to], ['2026-03-15', '2026-09-15']);
    const tm = read1('revenue this month').definition;
    assert.deepEqual([tm.from, tm.to], ['2026-09-01', '2026-09-15']);
    const lm = read1('revenue last month').definition;
    assert.deepEqual([lm.from, lm.to], ['2026-08-01', '2026-08-31']);
    assert.equal(read1('revenue all time').definition.period, 'all');
    assert.equal(read1('revenue by rep').definition.period, 'all');
    assert.deepEqual(read1('revenue by rep').understood.at(-1), { kind: 'period', text: 'All time' }, 'the default period is said, not implied');
});

test('the org’s own words: a stage name and a roster name become equality filters only when handed in', () => {
    const opts = { stages: ['Prospecting', 'Discovery', 'Proposal', 'Negotiation/Review'], people: ['Karen Russell', 'Ryan Algie', 'Jeff Russell'] };
    assert.deepEqual(brief(read1('Karen deals in Proposal', opts)).where, [{ id: 'stage', op: 'eq', value: 'Proposal' }, { id: 'owner', op: 'eq', value: 'Karen Russell' }]);
    assert.deepEqual(brief(read1("Karen's deals in Proposal", opts)).where, [{ id: 'stage', op: 'eq', value: 'Proposal' }, { id: 'owner', op: 'eq', value: 'Karen Russell' }], 'the possessive is dropped');
    assert.deepEqual(brief(read1('Deals in Negotiation/Review by rep', opts)).where, [{ id: 'stage', op: 'eq', value: 'Negotiation/Review' }]);
    assert.deepEqual(brief(read1('Russell deals', opts)).where, [], 'a surname two people share names nobody');
    assert.deepEqual(brief(read1('Karen deals in Proposal')).where, [], 'without the org’s words nothing is guessed');
    assert.deepEqual(brief(read1('Ryan Algie calls this week', opts)).where, [{ id: 'type', op: 'eq', value: 'Call' }, { id: 'rep', op: 'eq', value: 'Ryan Algie' }], 'on activities the person is the rep');
});

test('what cannot be done is said, never swallowed into a wrong field', () => {
    const wr = read1('Win rate by lead source, last 6 months');
    assert.match(wr.notes[0], /Win rate is not a measure/);
    assert.deepEqual(brief(wr).dims, ['source']);
    const tier = read1('Avg days from proposal to close, by deal tier');
    assert.match(tier.notes[0], /Deal tier is not a field on deals/);
    assert.deepEqual(brief(tier).dims, [], 'tier did not become a dimension');
    assert.deepEqual(brief(tier).metrics, ['days_to_close']);
    const fa = read1('Forecast accuracy by rep, last 4 quarters');
    assert.equal(fa.notes.length, 2, 'both the measure and the span are named');
    assert.match(read1('quota attainment by rep').notes[0], /Quota attainment/);
    assert.match(read1('revenue by quarter').notes[0], /no quarter dimension/);
    const junk = read1('lorem ipsum dolor');
    assert.match(junk.notes[0], /Only the data source was recognised/);
    assert.deepEqual(brief(junk), { source: 'Opportunities', dims: [], metrics: ['revenue'], period: 'all', where: [], chart: 'kpi' });
    assert.equal(read1('foo bar baz').definition.chartType, 'bar', '"bar" is a chart word — said, it stands');
});

test('the name and the normalisation', () => {
    assert.equal(read1('  revenue by rep  ').name, 'Revenue by rep');
    assert.equal(read1('x'.repeat(100)).name.length, 80);
    assert.equal(interpretPrompt('').name, 'Untitled report');
    assert.equal(normalizePrompt('  Karen’s DEALS — “stuck” > 14 days?! '), "karen deals - stuck > 14 days");
});

// ── the tab, Home and the job ────────────────────────────────────────────────
test('ReportsTab: the prompt is read into the builder (every part a chip), the fake AI view is gone, the filters and a custom range are part of the definition and saved with it', () => {
    const s = code(read('src/Tabs/ReportsTab.jsx'));
    assert.ok(s.includes("import { interpretPrompt, PROMPT_STARTERS } from '../utils/reportPrompt.js';"));
    assert.ok(s.includes("import { REPORT_SOURCES, REPORT_PERIODS, REPORT_CHARTS, fieldsFor, filtersFor, whereLabel, runReport } from '../utils/reportQuery.js';"));
    const tabAt = s.indexOf('function SavedReportsTab(');
    assert.ok(tabAt > 0);
    assert.ok(s.indexOf('const PromptBanner = ({ interpretation, onEdit, onDismiss }) => {') < tabAt, 'the banner is module scope, data as props');
    assert.ok(s.indexOf('const WhereEditor = ({ source, where, onChange }) => {') < tabAt, 'the filter editor is module scope — its inputs keep focus');
    assert.ok(s.includes('const applyPrompt = (text) => {'));
    assert.ok(s.includes("const r = interpretPrompt(prompt, { fiscalStart, stages: openStagesOf(settings), people: (settings?.users || []).map(u => u?.name).filter(Boolean) });"), 'the org’s stages and roster are handed in');
    assert.ok(s.includes('setBuilderWhere(d.where);') && s.includes('setBuilderChart(d.chartType);') && s.includes('setBuilderName(r.name);'), 'the builder is seeded with the reading');
    assert.ok(s.includes('setAiInterpretation({ prompt, understood: r.understood, notes: r.notes });'));
    assert.ok(s.includes("setBuilderResult(runReport({ ...d, limit: d.chartType === 'table' ? 200 : 12 }, builderData(), { fiscalStart }));"), 'the real engine runs it at once');
    assert.ok(s.includes("setCreateMode('blank');\n        setShowCreateReport(true);\n    };"), 'the prompt opens the ONE builder');
    assert.ok(s.includes('const handleGenerate = () => applyPrompt(aiPrompt);'), 'Generate reads the prompt');
    assert.ok(s.includes("onKeyDown={e=>{ if(e.key==='Enter') applyPrompt(aiPrompt); }}") && s.includes('<button onClick={()=>applyPrompt(aiPrompt)}'), 'the rail’s Ask AI reads it too');
    assert.ok(s.includes('const AI_STARTERS = PROMPT_STARTERS;'), 'the starters are the interpreter’s own');
    assert.ok(!s.includes("createMode === 'ai'") && !s.includes("setCreateMode('ai')") && !s.includes('does not interpret prompts yet') && !s.includes('stuckRows'), 'the hard-coded view is gone');
    assert.ok(s.includes("const builderDefinition = () => ({ source: builderSource, dims: builderDims, metrics: builderMetrics, period: builderPeriod, from: builderFrom, to: builderTo, where: builderWhere, limit: builderChart === 'table' ? 200 : 12 });"));
    assert.ok(s.includes("filters:{ period: builderPeriod, from: builderPeriod==='custom' ? builderFrom : '', to: builderPeriod==='custom' ? builderTo : '', where: builderWhere }"), 'saved with the report');
    assert.ok(s.includes("const where = Array.isArray(r.filters?.where) ? r.filters.where : [];") && s.includes('setBuilderWhere(where);'), 'a saved report reopens with its filters');
    assert.ok(s.includes("setBuilderResult(runReport({ source: src, dims, metrics, period, from, to, where, limit: chart === 'table' ? 200 : 12 }, builderData(), { fiscalStart: parseInt(settings?.fiscalYearStart) || 10 }));"));
    assert.ok(s.includes('<WhereEditor source={builderSource} where={builderWhere} onChange={w=>{ setBuilderWhere(w); setBuilderDirty(true); }}/>'), 'the Filters tab edits them');
    assert.ok(s.includes('<option value="custom">Custom range…</option>'), 'the custom range is offered');
    assert.ok(s.includes("<PromptBanner interpretation={aiInterpretation} onEdit={()=>setCreateMode('picker')} onDismiss={()=>setAiInterpretation(null)}/>"));
    assert.ok(s.includes("breadcrumb={editingReportId ? 'Saved report' : aiInterpretation ? 'AI-generated' : 'Blank canvas'}"));
    assert.ok(s.includes('setBuilderWhere([]);   // filters are the source’s own') || s.includes("setBuilderWhere([]);   // filters are the source's own"), 'a new source drops the old source’s filters');
});

test('Home and the delivery job run the whole saved definition — the filters and the custom bounds, not just the period', () => {
    const home = code(read('src/Tabs/HomeTab.jsx'));
    assert.ok(home.includes("period: r.filters?.period || 'all', from: r.filters?.from || '', to: r.filters?.to || '', where: r.filters?.where || [], limit: 8 }"));
    const job = code(read('netlify/functions/report-deliveries.mjs'));
    assert.ok(job.includes("period, from: row.filters?.from || '', to: row.filters?.to || '', where: row.filters?.where || [], limit: 200 },"));
});
