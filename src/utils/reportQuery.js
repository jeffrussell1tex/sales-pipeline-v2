// reportQuery.js — the report builder's query engine (state §0.133). Pure: no
// React, no db, no fetch. The builder describes a report — a SOURCE, the
// DIMENSIONS to group by, the METRICS to compute, a PERIOD, a chart — and this
// module runs it over the datasets the Reports tab already holds (the
// role-gated, slice-scoped sets every other report reads), so a report the
// builder shows is the same numbers a saved copy reopens to tomorrow.
//
// THE MODEL. Until §0.133 the builder's preview ignored everything the user
// picked: it drew "open pipeline by owner" whatever the source, dimensions,
// metrics or chart, the Period and Compare-to controls were labels, and a saved
// report could not be opened ("Built in the report builder — opening it is not
// implemented"). Now:
//
//   - fieldsFor(source) is the ONE list of dimensions and metrics the builder
//     offers — each backed by a column the source really has. Fields the old
//     picker offered with no column behind them (Competitor, Deal tier on a
//     deal, Lead source on a deal) are gone, not faked.
//   - runReport(def, data, opts) groups the rows by the dimension values and
//     computes every metric per group and in total; a period filter reads the
//     source's own day (the tab's convention: a deal by forecastedCloseDate ||
//     createdDate, an activity by date, a lead or account by createdAt) through
//     reportPeriod's periodRange, so "This quarter" here is the same quarter the
//     rest of the tab means.
//   - chartData(result, chartType) turns a result into what the chart component
//     draws, and says when it had to fall back (a line needs a date dimension,
//     a stacked bar two dimensions, a funnel the stage dimension) — the fallback
//     is named on screen, never silent.
//   - resolveField() accepts a saved report's dims/metrics by id OR by label,
//     so a report saved before §0.133 (its ids were made from labels) opens.
import { dayOf, inRange, periodRange } from './reportPeriod.js';
import { closeDayOf, cycleDaysOf, medianOf } from './pipelineReport.js';
import { activityRepOf } from './reportScope.js';
import { lossBucketOf } from './lossAnalysis.js';
import { openStagesOf, CLOSED_STAGES } from './stageOrder.js';
import { parseLocalDate, isoLocal } from './dateLocal.js';

export const REPORT_SOURCES = Object.freeze(['Opportunities', 'Accounts', 'Leads', 'Activity']);
export const REPORT_PERIODS = Object.freeze([
    Object.freeze({ value: 'all', label: 'All time' }),
    Object.freeze({ value: 'FY',  label: 'This fiscal year' }),
    Object.freeze({ value: 'Q1',  label: 'Q1' }),
    Object.freeze({ value: 'Q2',  label: 'Q2' }),
    Object.freeze({ value: 'Q3',  label: 'Q3' }),
    Object.freeze({ value: 'Q4',  label: 'Q4' }),
]);
export const REPORT_CHARTS = Object.freeze([
    Object.freeze({ id: 'bar',     label: 'Bar',         desc: 'Compare across categories' }),
    Object.freeze({ id: 'stacked', label: 'Stacked bar', desc: 'Sub-groups within a total (two dimensions)' }),
    Object.freeze({ id: 'line',    label: 'Line',        desc: 'Trend over time (a date dimension)' }),
    Object.freeze({ id: 'funnel',  label: 'Funnel',      desc: 'Deals through the stages (the Stage dimension)' }),
    Object.freeze({ id: 'table',   label: 'Table',       desc: 'Every group, every measure' }),
    Object.freeze({ id: 'kpi',     label: 'KPI card',    desc: 'The totals, one big number each' }),
]);

const NONE = 'None';
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const str = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));
const monthOf = (day) => { const d = dayOf(day); return d ? d.slice(0, 7) : ''; };
const daysBetween = (a, b) => { const x = parseLocalDate(a), y = parseLocalDate(b); return x && y ? Math.round((y - x) / 86400000) : null; };
const avg = (nums) => { const s = nums.filter(n => typeof n === 'number' && Number.isFinite(n)); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null; };
const sum = (nums) => nums.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
const isOpenDeal = (o) => !CLOSED_STAGES.includes(o?.stage);

// ── Field definitions ───────────────────────────────────────────────────────
// dim:    { id, label, kind: 'text' | 'month' | 'stage', valueOf(row, ctx) }
// metric: { id, label, agg: 'sum' | 'count' | 'avg' | 'median' | 'distinct', valueOf(row, ctx) → number | null, format: 'money' | 'int' | 'days' | 'score' }
const D = (id, label, kind, valueOf, advanced = false) => Object.freeze({ id, label, kind, valueOf, advanced });
const M = (id, label, agg, valueOf, format, advanced = false) => Object.freeze({ id, label, agg, valueOf, format, advanced });

const OPP_DIMS = [
    D('owner',              'Owner',              'text',  (o) => str(o.salesRep || o.assignedTo) || 'Unassigned'),
    D('stage',              'Stage',              'stage', (o) => str(o.stage) || NONE),
    // A closed deal's close DAY (§0.68: wonDate / lostDate, else the stage change); an open
    // deal's forecast. closeDayOf alone would hand an open deal its last stage change.
    D('close_date',         'Close date',         'month', (o) => monthOf(CLOSED_STAGES.includes(o.stage) ? closeDayOf(o) : o.forecastedCloseDate) || NONE),
    D('industry',           'Industry',           'text',  (o) => str(o.vertical) || NONE),
    D('territory',          'Territory',          'text',  (o) => str(o.territory) || NONE),
    D('forecast_category',  'Forecast category',  'text',  (o) => str(o.forecastCategory) || NONE, true),
    D('loss_reason',        'Loss reason',        'text',  (o) => (o.stage === 'Closed Lost' ? lossBucketOf(o, 'Unspecified') : 'Not lost'), true),
    D('created_date',       'Created date',       'month', (o) => monthOf(o.createdDate || o.createdAt) || NONE, true),
    D('last_activity_date', 'Last activity date', 'month', (o, ctx) => { const last = ctx.lastActivityByOpp.get(o.id); return last ? monthOf(last) : 'No activity'; }, true),
    D('product_line',       'Product line',       'text',  (o) => str(o.products) || NONE, true),
];
const OPP_METRICS = [
    M('revenue',       'Revenue',        'sum',    (o) => num(o.arr), 'money'),
    M('deals',         '# of deals',     'count',  () => 1, 'int'),
    M('avg_deal',      'Avg deal size',  'avg',    (o) => num(o.arr), 'money'),
    M('days_to_close', 'Days to close',  'median', (o) => cycleDaysOf(o), 'days', true),
    M('days_in_stage', 'Days in stage',  'avg',    (o, ctx) => (isOpenDeal(o) ? daysBetween(dayOf(o.stageChangedDate || o.createdDate || o.createdAt), ctx.today) : null), 'days', true),
    M('ai_score',      'AI score',       'avg',    (o) => (o.aiScore && Number.isFinite(Number(o.aiScore.score)) ? Number(o.aiScore.score) : null), 'score', true),
    M('activities',    '# activities',   'sum',    (o, ctx) => ctx.activityCountByOpp.get(o.id) || 0, 'int', true),
];

const ACCOUNT_DIMS = [
    D('owner',        'Owner',        'text',  (a) => str(a.accountOwner || a.assignedRep) || 'Unassigned'),
    D('industry',     'Industry',     'text',  (a) => str(a.industry || a.verticalMarket) || NONE),
    D('territory',    'Territory',    'text',  (a) => str(a.assignedTerritory) || NONE),
    D('tier',         'Tier',         'text',  (a) => str(a.accountTier) || NONE),
    D('segment',      'Segment',      'text',  (a) => str(a.accountSegment) || NONE, true),
    D('state',        'State',        'text',  (a) => str(a.state) || NONE, true),
    D('created_date', 'Created date', 'month', (a) => monthOf(a.createdAt) || NONE, true),
];
const ACCOUNT_METRICS = [
    M('accounts',      '# of accounts',  'count', () => 1, 'int'),
    M('revenue',       'Revenue (won)',  'sum',   (a, ctx) => sum((ctx.oppsByAccount.get(a.id) || []).filter(o => o.stage === 'Closed Won').map(o => num(o.arr))), 'money'),
    M('open_pipeline', 'Open pipeline',  'sum',   (a, ctx) => sum((ctx.oppsByAccount.get(a.id) || []).filter(isOpenDeal).map(o => num(o.arr))), 'money'),
    M('deals',         '# of deals',     'sum',   (a, ctx) => (ctx.oppsByAccount.get(a.id) || []).length, 'int', true),
];

const LEAD_DIMS = [
    D('assigned_to',  'Assigned to',  'text',  (l) => str(l.assignedTo) || 'Unassigned'),
    D('source',       'Lead source',  'text',  (l) => str(l.source) || NONE),
    D('status',       'Status',       'text',  (l) => str(l.status) || NONE),
    D('score_bucket', 'Score bucket', 'text',  (l) => str(l.leadScoreBucket) || 'Unscored', true),
    D('created_date', 'Created date', 'month', (l) => monthOf(l.createdAt) || NONE, true),
];
const LEAD_METRICS = [
    M('leads',     '# of leads',      'count', () => 1, 'int'),
    M('est_arr',   'Est. ARR',        'sum',   (l) => num(l.estimatedARR), 'money'),
    M('avg_score', 'Avg lead score',  'avg',   (l) => (l.score == null || l.score === '' ? null : num(l.score)), 'score'),
    M('converted', '# converted',     'sum',   (l) => (l.status === 'Converted' ? 1 : 0), 'int', true),
];

const ACTIVITY_DIMS = [
    D('rep',     'Rep',     'text',  (a) => str(activityRepOf(a)) || 'Unassigned'),
    D('type',    'Type',    'text',  (a) => str(a.type) || NONE),
    D('date',    'Date',    'month', (a) => monthOf(a.date || a.createdAt) || NONE),
    D('outcome', 'Outcome', 'text',  (a) => str(a.outcome) || NONE, true),
];
const ACTIVITY_METRICS = [
    M('activities',    '# of activities', 'count',    () => 1, 'int'),
    M('duration',      'Minutes logged',  'sum',      (a) => num(a.duration), 'int'),
    M('deals_touched', 'Deals touched',   'distinct', (a) => str(a.opportunityId) || null, 'int', true),
];

const FIELDS = Object.freeze({
    Opportunities: Object.freeze({ dims: OPP_DIMS, metrics: OPP_METRICS, defaults: { dims: ['owner', 'stage'], metrics: ['revenue'] } }),
    Accounts:      Object.freeze({ dims: ACCOUNT_DIMS, metrics: ACCOUNT_METRICS, defaults: { dims: ['industry'], metrics: ['accounts', 'revenue'] } }),
    Leads:         Object.freeze({ dims: LEAD_DIMS, metrics: LEAD_METRICS, defaults: { dims: ['source'], metrics: ['leads'] } }),
    Activity:      Object.freeze({ dims: ACTIVITY_DIMS, metrics: ACTIVITY_METRICS, defaults: { dims: ['rep', 'type'], metrics: ['activities'] } }),
});

/** The dimensions and metrics a source offers, and its default pick. Unknown source → Opportunities. */
export function fieldsFor(source) {
    return FIELDS[source] || FIELDS.Opportunities;
}
export const isReportSource = (source) => Object.prototype.hasOwnProperty.call(FIELDS, source);

// ── Row filters (state §0.139) ──────────────────────────────────────────────
// A definition may carry `where: [{ id, op, value }]` — conditions on the rows
// BEFORE they are grouped. Until §0.139 the only filter was the period, so a
// report like "open deals with no activity in 14+ days" could not be built at
// all (the "AI-generated" view faked it with a hard-coded computation that no
// prompt could change). Like the fields, every filter here has a column behind
// it and the list is the allowlist: an unknown id or op is dropped and named.
//
// filter: { id, label, kind: 'choice' | 'number' | 'text', ops, options?, unit?,
//           test(row, ctx, op, value) → boolean }
//   choice: value is one of `options[].value` (op 'eq')
//   number: value is a number (ops 'gte' | 'lte'); `unit` says how to read it
//   text:   value is a string, or an array for 'in'; compared to the DIMENSION
//           of the same id, case-insensitively (ops 'eq' | 'ne' | 'in')
const F = (id, label, kind, ops, test, extra = {}) => Object.freeze({ id, label, kind, ops: Object.freeze(ops), test, ...extra });
const numVal = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const cmp = (op, actual, wanted) => (actual == null ? false : op === 'lte' ? actual <= wanted : actual >= wanted);
const eqText = (a, b) => str(a).toLowerCase() === str(b).toLowerCase();
const textTest = (dim) => (row, ctx, op, value) => {
    const actual = dim.valueOf(row, ctx);
    if (op === 'in') return (Array.isArray(value) ? value : [value]).some(v => eqText(actual, v));
    const same = eqText(actual, value);
    return op === 'ne' ? !same : same;
};
/**
 * Every text dimension of a source as an equality filter — the row's grouping
 * value, compared. The Stage dimension too: it is text with an ORDER (kind
 * 'stage'), and "deals in Proposal" is the filter the interpreter and Claude
 * both emit — the first cut skipped it and both readers' stage filter was
 * dropped by the allowlist (observed on dev, 15 Sep).
 */
const textFilters = (dims) => dims.filter(d => d.kind === 'text' || d.kind === 'stage').map(d => F(d.id, d.label, 'text', ['eq', 'ne', 'in'], textTest(d)));

const daysSinceLastActivity = (o, ctx) => {
    const last = ctx.lastActivityByOpp.get(o.id);
    // A deal with no activity at all has been silent since it was created.
    return daysBetween(dayOf(last || o.createdDate || o.createdAt), ctx.today);
};
const OPP_FILTERS = [
    F('status', 'Status', 'choice', ['eq'], (o, ctx, op, value) => (value === 'open' ? isOpenDeal(o) : value === 'won' ? o.stage === 'Closed Won' : value === 'lost' ? o.stage === 'Closed Lost' : true),
        { options: Object.freeze([Object.freeze({ value: 'open', label: 'Open deals' }), Object.freeze({ value: 'won', label: 'Closed won' }), Object.freeze({ value: 'lost', label: 'Closed lost' })]) }),
    F('no_activity_days', 'Days since last activity', 'number', ['gte', 'lte'], (o, ctx, op, value) => cmp(op, daysSinceLastActivity(o, ctx), value), { unit: 'days' }),
    F('days_in_stage',    'Days in current stage',    'number', ['gte', 'lte'], (o, ctx, op, value) => cmp(op, daysBetween(dayOf(o.stageChangedDate || o.createdDate || o.createdAt), ctx.today), value), { unit: 'days' }),
    F('arr',              'Deal size',                'number', ['gte', 'lte'], (o, ctx, op, value) => cmp(op, num(o.arr), value), { unit: 'money' }),
    ...textFilters(OPP_DIMS),
];
const LEAD_FILTERS = [
    F('score', 'Lead score', 'number', ['gte', 'lte'], (l, ctx, op, value) => cmp(op, l.score == null || l.score === '' ? null : num(l.score), value), { unit: 'score' }),
    ...textFilters(LEAD_DIMS),
];
const WHERE = Object.freeze({
    Opportunities: Object.freeze(OPP_FILTERS),
    Accounts:      Object.freeze(textFilters(ACCOUNT_DIMS)),
    Leads:         Object.freeze(LEAD_FILTERS),
    Activity:      Object.freeze(textFilters(ACTIVITY_DIMS)),
});
/** The filters a source offers. Unknown source → Opportunities. */
export function filtersFor(source) {
    return WHERE[source] || WHERE.Opportunities;
}

/**
 * The stored `where` list against the allowlist: each entry resolved to its
 * filter, its op checked, its value coerced to the filter's kind. Entries that
 * do not resolve are dropped and returned so a caller can say so.
 * → { where: [{ id, op, value }], dropped: [raw…] }
 */
export function resolveWhere(source, where) {
    const list = filtersFor(isReportSource(source) ? source : 'Opportunities');
    const out = [], dropped = [];
    for (const raw of (Array.isArray(where) ? where : [])) {
        const f = raw && typeof raw === 'object' ? list.find(x => x.id === str(raw.id)) : null;
        const op = f && f.ops.includes(raw.op) ? raw.op : (f ? f.ops[0] : null);
        if (!f) { dropped.push(raw); continue; }
        let value;
        if (f.kind === 'number') { value = numVal(raw.value); if (value == null) { dropped.push(raw); continue; } }
        else if (f.kind === 'choice') { value = str(raw.value); if (!f.options.some(o => o.value === value)) { dropped.push(raw); continue; } }
        else if (op === 'in') { value = (Array.isArray(raw.value) ? raw.value : [raw.value]).map(str).filter(Boolean); if (!value.length) { dropped.push(raw); continue; } }
        else { value = str(raw.value); if (!value) { dropped.push(raw); continue; } }
        out.push({ id: f.id, op, value });
    }
    return { where: out, dropped };
}

const OP_WORDS = { gte: '≥', lte: '≤', eq: 'is', ne: 'is not', in: 'is one of' };
/** One filter in words: "Open deals", "Days since last activity ≥ 14", "Owner is Karen". */
export function whereLabel(source, w) {
    const f = filtersFor(source).find(x => x.id === w?.id);
    if (!f) return String(w?.id || '?');
    if (f.kind === 'choice') return f.options.find(o => o.value === w.value)?.label || `${f.label} ${w.value}`;
    if (f.kind === 'number') return `${f.label} ${OP_WORDS[w.op] || w.op} ${f.unit === 'money' ? formatMetric(w.value, 'money') : w.value}`;
    return `${f.label} ${OP_WORDS[w.op] || w.op} ${Array.isArray(w.value) ? w.value.join(', ') : w.value}`;
}

const norm = (s) => str(s).toLowerCase().replace(/[^a-z0-9]/g, '_');
/**
 * A field by id, by label (case-insensitive), or by the id a label makes — so a
 * report saved before §0.133 ({ id: 'arr', label: 'Revenue' }, { id: '_of_deals',
 * label: '# of deals' }) resolves. null when nothing matches.
 */
export function resolveField(source, kind, ref) {
    const list = kind === 'metric' ? fieldsFor(source).metrics : fieldsFor(source).dims;
    const r = ref && typeof ref === 'object' ? ref : { id: ref };
    const id = str(r.id), label = str(r.label);
    return list.find(f => f.id === id)
        || (label && list.find(f => f.label.toLowerCase() === label.toLowerCase()))
        || (id && list.find(f => norm(f.label) === norm(id)))
        || (id === 'arr' && list.find(f => f.id === 'revenue'))
        || (id === 'count' && list.find(f => f.agg === 'count'))
        || null;
}

/** { dims: [field…], metrics: [field…], dropped: [ref…] } — the refs that resolved, and those that did not. */
export function resolveDefinition(def) {
    const source = isReportSource(def?.source) ? def.source : 'Opportunities';
    const dropped = [];
    const pick = (kind, refs) => (Array.isArray(refs) ? refs : []).map(r => { const f = resolveField(source, kind, r); if (!f) dropped.push(r); return f; }).filter(Boolean);
    let dims = pick('dim', def?.dims), metrics = pick('metric', def?.metrics);
    dims = dims.filter((f, i) => dims.findIndex(g => g.id === f.id) === i);
    metrics = metrics.filter((f, i) => metrics.findIndex(g => g.id === f.id) === i);
    if (!metrics.length) metrics = [fieldsFor(source).metrics[0]];
    return { source, dims, metrics, dropped };
}

// ── The run ─────────────────────────────────────────────────────────────────
const sourceDayOf = {
    Opportunities: (o) => dayOf(o.forecastedCloseDate || o.createdDate || o.createdAt),
    Accounts:      (a) => dayOf(a.createdAt),
    Leads:         (l) => dayOf(l.createdAt),
    Activity:      (a) => dayOf(a.date || a.createdAt),
};

const buildContext = (data, today) => {
    const opps = Array.isArray(data?.opportunities) ? data.opportunities : [];
    const acts = Array.isArray(data?.activities) ? data.activities : [];
    const lastActivityByOpp = new Map();
    const activityCountByOpp = new Map();
    for (const a of acts) {
        if (!a?.opportunityId) continue;
        activityCountByOpp.set(a.opportunityId, (activityCountByOpp.get(a.opportunityId) || 0) + 1);
        const d = dayOf(a.date || a.createdAt);
        if (d && (!lastActivityByOpp.has(a.opportunityId) || lastActivityByOpp.get(a.opportunityId) < d)) lastActivityByOpp.set(a.opportunityId, d);
    }
    const oppsByAccount = new Map();
    const byName = new Map((Array.isArray(data?.accounts) ? data.accounts : []).map(a => [str(a.name).toLowerCase(), a.id]));
    for (const o of opps) {
        const id = o.accountId || byName.get(str(o.account).toLowerCase());
        if (!id) continue;
        if (!oppsByAccount.has(id)) oppsByAccount.set(id, []);
        oppsByAccount.get(id).push(o);
    }
    return { today, lastActivityByOpp, activityCountByOpp, oppsByAccount };
};

const aggregate = (metric, rows, ctx) => {
    const vals = rows.map(r => metric.valueOf(r, ctx));
    switch (metric.agg) {
        case 'count':    return rows.length;
        case 'sum':      return sum(vals.map(v => (v == null ? 0 : Number(v))));
        case 'avg':      return avg(vals.map(v => (v == null ? NaN : Number(v))));
        case 'median':   return medianOf(vals.filter(v => v != null).map(Number));
        case 'distinct': return new Set(vals.filter(v => v != null && v !== '')).size;
        default:         return null;
    }
};

const stageRank = (stages) => { const m = new Map(); stages.forEach((s, i) => m.set(s, i)); return m; };

/**
 * Run a report definition over the datasets.
 *   def:  { source, dims: [ref…], metrics: [ref…], period: 'all'|'FY'|'Q1'..'Q4'|'custom', from, to, where: [{ id, op, value }…], limit }
 *   data: { opportunities, accounts, leads, activities, pipelines, settings }
 *   opts: { today: Date, fiscalStart: number }
 * → { source, dims, metrics, rows: [{ keys: [v…], values: { [metric.id]: number|null }, n }], totals, count, scanned, period, dropped, warnings }
 * Rows are sorted by the first dimension when it is a month or a stage (in order), else by the first metric, descending.
 */
export function runReport(def, data, opts = {}) {
    const today = opts.today instanceof Date ? opts.today : new Date();
    const todayDay = isoLocal(today);   // the local calendar day, never a UTC truncation (18b26)
    const fiscalStart = Number.isFinite(Number(opts.fiscalStart)) ? Number(opts.fiscalStart) : 10;
    const { source, dims, metrics, dropped } = resolveDefinition(def);
    const rowsAll = (source === 'Opportunities' ? data?.opportunities : source === 'Accounts' ? data?.accounts : source === 'Leads' ? data?.leads : data?.activities);
    const scanned = Array.isArray(rowsAll) ? rowsAll.filter(Boolean) : [];
    const range = periodRange(def?.period || 'all', fiscalStart, { today, from: def?.from || '', to: def?.to || '' });
    const ctx = { ...buildContext(data, todayDay), settings: data?.settings || {} };
    // The period first, then the row filters (§0.139) — every filter must hold.
    const { where, dropped: droppedWhere } = resolveWhere(source, def?.where);
    const filters = filtersFor(source);
    const inRangeRows = range ? scanned.filter(r => inRange(sourceDayOf[source](r), range)) : scanned;
    const inPeriod = where.length
        ? inRangeRows.filter(r => where.every(w => filters.find(f => f.id === w.id).test(r, ctx, w.op, w.value)))
        : inRangeRows;
    const warnings = [];
    if (dropped.length) warnings.push(`${dropped.length} field${dropped.length === 1 ? '' : 's'} this report was saved with no longer exist${dropped.length === 1 ? 's' : ''} for ${source}: ${dropped.map(d => (d && typeof d === 'object' ? d.label || d.id : d)).join(', ')}.`);
    if (droppedWhere.length) warnings.push(`${droppedWhere.length} filter${droppedWhere.length === 1 ? '' : 's'} this report was saved with could not be applied for ${source}: ${droppedWhere.map(w => (w && typeof w === 'object' ? w.id : w)).join(', ')}.`);

    // group
    const groups = new Map();
    for (const r of inPeriod) {
        const keys = dims.map(d => d.valueOf(r, ctx));
        const k = keys.join('');
        if (!groups.has(k)) groups.set(k, { keys, rows: [] });
        groups.get(k).rows.push(r);
    }
    let rows = [...groups.values()].map(g => ({
        keys: g.keys,
        n: g.rows.length,
        values: Object.fromEntries(metrics.map(m => [m.id, aggregate(m, g.rows, ctx)])),
    }));
    const first = dims[0];
    const firstMetric = metrics[0];
    if (first && first.kind === 'month') rows.sort((a, b) => String(a.keys[0]).localeCompare(String(b.keys[0])));
    else if (first && first.kind === 'stage') {
        const rank = stageRank([...openStagesOf(ctx.settings), ...CLOSED_STAGES]);
        rows.sort((a, b) => (rank.has(a.keys[0]) ? rank.get(a.keys[0]) : 99) - (rank.has(b.keys[0]) ? rank.get(b.keys[0]) : 99) || String(a.keys[0]).localeCompare(String(b.keys[0])));
    } else rows.sort((a, b) => (num(b.values[firstMetric.id]) - num(a.values[firstMetric.id])) || String(a.keys.join()).localeCompare(String(b.keys.join())));
    const limit = Number.isFinite(Number(def?.limit)) && Number(def.limit) > 0 ? Number(def.limit) : 0;
    const truncated = limit > 0 && rows.length > limit;
    if (truncated) { warnings.push(`Showing the top ${limit} of ${rows.length} groups.`); rows = rows.slice(0, limit); }

    const totals = Object.fromEntries(metrics.map(m => [m.id, aggregate(m, inPeriod, ctx)]));
    return {
        source, dims, metrics, rows, totals,
        count: inPeriod.length, scanned: scanned.length,
        period: range, where, dropped, warnings,
    };
}

// ── Formatting ──────────────────────────────────────────────────────────────
export function formatMetric(value, format) {
    if (value == null || Number.isNaN(value)) return '—';
    const n = Number(value);
    if (format === 'money') return n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? '$' + Math.round(n / 1e3) + 'K' : '$' + Math.round(n);
    if (format === 'days')  return Math.round(n) + 'd';
    if (format === 'score') return String(Math.round(n));
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A dimension value for display: 'yyyy-mm' → 'Mon yyyy'; anything else as is. */
export function formatKey(dim, value) {
    if (dim?.kind === 'month' && /^\d{4}-\d{2}$/.test(String(value))) return `${MONTHS[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}`;
    return String(value);
}

// ── What the chart draws ────────────────────────────────────────────────────
/**
 * → { kind, ...shape, fallbackFrom: chartType|null, note }
 *   bar:     { labels, values, metric }                       first dim × first metric
 *   stacked: { labels, series: [{ name, values }], metric }   first dim rows × second dim segments
 *   line:    { labels, values, metric }                       a month dim, in order
 *   funnel:  { labels, values, metric }                       the Stage dim, in stage order
 *   table:   { rows: [{ cells, values }], metrics, dims }
 *   kpi:     { cards: [{ label, value, format }] }
 * A chart the definition cannot support falls back and says so.
 */
export function chartData(result, chartType) {
    const r = result || { dims: [], metrics: [], rows: [], totals: {} };
    const dims = r.dims || [], metrics = r.metrics || [], rows = r.rows || [];
    const m0 = metrics[0];
    const first = dims[0];
    const want = REPORT_CHARTS.some(c => c.id === chartType) ? chartType : (chartType ? 'table' : 'bar');
    const fallback = (kind, note) => ({ ...build(kind), fallbackFrom: chartType, note });
    const build = (kind) => {
        if (kind === 'kpi') return { kind, cards: metrics.map(m => ({ label: m.label, value: r.totals?.[m.id], format: m.format })), fallbackFrom: null, note: null };
        if (kind === 'table') return { kind, dims, metrics, rows: rows.map(row => ({ cells: row.keys.map((k, i) => formatKey(dims[i], k)), values: metrics.map(m => ({ id: m.id, value: row.values[m.id], format: m.format })), n: row.n })), fallbackFrom: null, note: null };
        if (kind === 'stacked') {
            const [d0, d1] = dims;
            const labels = [...new Set(rows.map(x => x.keys[0]))];
            const names  = [...new Set(rows.map(x => x.keys[1]))];
            const series = names.map(name => ({ name: formatKey(d1, name), values: labels.map(l => { const row = rows.find(x => x.keys[0] === l && x.keys[1] === name); return row ? num(row.values[m0.id]) : 0; }) }));
            return { kind, labels: labels.map(l => formatKey(d0, l)), series, metric: m0, fallbackFrom: null, note: null };
        }
        // bar | line | funnel: first dim × first metric
        return { kind, labels: rows.map(x => formatKey(first, x.keys[0])), values: rows.map(x => x.values[m0.id]), metric: m0, fallbackFrom: null, note: null };
    };
    if (!m0) return { kind: 'kpi', cards: [], fallbackFrom: null, note: 'Pick a measure.' };
    if (want === 'kpi') return build('kpi');
    if (want === 'table') return build('table');
    if (!first) return fallback('kpi', 'No dimension to group by — showing the totals.');
    if (want === 'stacked') return dims.length >= 2 ? build('stacked') : fallback('bar', 'A stacked bar needs two dimensions — showing a bar of the first.');
    if (want === 'line')    return first.kind === 'month' ? build('line') : fallback('bar', 'A line needs a date dimension first (Close date, Created date, Date) — showing a bar.');
    if (want === 'funnel')  return first.kind === 'stage' ? build('funnel') : fallback('bar', 'A funnel needs the Stage dimension first — showing a bar.');
    if (dims.length >= 2 && want === 'bar') return { ...build('bar'), note: `Grouped by ${first.label} only; add a stacked bar or a table to see ${dims[1].label}.` };
    return build('bar');
}
