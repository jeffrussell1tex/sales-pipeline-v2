// reportPrompt.js — a sentence into a report definition (state §0.139; Jeff:
// "No matter what I type in it seems to want to solve for days stuck for more
// than 14 days"). Pure: no React, no db, no network.
//
// WHAT THIS IS. The "Ask AI" box on the report picker took a prompt and showed
// the same hard-coded "stuck deals by rep" picture whatever was typed — its
// own banner admitted "The report builder does not interpret prompts yet".
// Now the prompt IS interpreted, deterministically, into the builder's own
// vocabulary — a source, dimensions, metrics, a period, row filters, a chart —
// the same definition a hand-built report is, so the result opens in the
// builder with every part editable and the real engine (reportQuery.js) runs
// it. Nothing here invents a field: every id it emits comes from fieldsFor()
// and filtersFor(), and every phrase it cannot honour is NAMED in `notes`
// rather than silently dropped.
//
// HOW. Phrases are consumed in order of specificity — the source's nouns
// first (read, not consumed), then the phrases the builder cannot do (noted
// and consumed so they cannot masquerade as a dimension), the period, the
// chart, the row filters, the measures, and last the dimensions over what is
// left. "days in stage" is a filter when a number follows and a measure when
// none does; "over time" is a line AND the source's month dimension.
//
// Optional context (`opts.stages`, `opts.people`) lets an org's own stage
// names and roster names become equality filters ("in Proposal", "Karen's
// deals"); without them those words are left alone — never guessed.
import { fieldsFor, filtersFor, whereLabel, REPORT_CHARTS, REPORT_PERIODS } from './reportQuery.js';
import { quarterOf } from './quarters.js';
import { fiscalRange, priorRange } from './reportPeriod.js';
import { isoLocal, parseLocalDate } from './dateLocal.js';

/** Prompts the picker offers as examples — every one of them fully understood here (the test proves it). */
export const PROMPT_STARTERS = Object.freeze([
    'Deals stuck more than 14 days, by rep',
    'Closed won revenue by industry this year',
    'How many leads by source this quarter',
    'Calls and meetings per rep, last 30 days',
]);

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Lower-case, ASCII quotes, possessives dropped, whitespace collapsed; `$`, digits, `>` `<` `+` kept. */
export function normalizePrompt(text) {
    return str(text).toLowerCase()
        .replace(/[‘’“”]/g, "'")
        .replace(/'s\b/g, '')
        .replace(/[–—]/g, '-')
        .replace(/[^a-z0-9$%<>+/&.,\-\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ── the source ──────────────────────────────────────────────────────────────
// A noun names the source outright; a hint only leans. The earliest noun wins;
// with no noun, the earliest hint; with neither, deals.
const SOURCE_NOUNS = [
    ['Activity',      /\b(activit(?:y|ies)|calls?|meetings?|emails?|demos?|touches|touchpoints|outreach|(?:minutes|hours|time) logged|logged)\b/],
    ['Leads',         /\b(leads?|prospects?|inbound|mqls?)\b/],
    ['Accounts',      /\b(accounts?|customers?|compan(?:y|ies)|clients?)\b/],
    ['Opportunities', /\b(deals?|opps?|opportunit(?:y|ies)|pipeline)\b/],
];
const SOURCE_HINTS = [
    ['Opportunities', /\b(revenue|bookings?|arr|forecast|stages?|won|lost|closed)\b/],
];
const firstMatch = (text, table) => {
    let best = null;
    for (const [source, re] of table) {
        const m = re.exec(text);
        if (m && (!best || m.index < best.index)) best = { source, index: m.index, word: m[1] };
    }
    return best;
};
function detectSource(text) {
    const noun = firstMatch(text, SOURCE_NOUNS);
    if (noun) return { source: noun.source, word: noun.word };
    const hint = firstMatch(text, SOURCE_HINTS);
    return { source: hint ? hint.source : 'Opportunities', word: hint ? hint.word : null };
}

// ── what the builder cannot do — said, not swallowed ───────────────────────
const UNSUPPORTED = [
    [/\b(win|close|conversion|win\/loss) rates?\b/, 'Win rate is not a measure the builder computes yet — # of deals by Stage shows won against lost.'],
    [/\bforecast accuracy\b/,                       'Forecast accuracy lives on the Pipeline & Forecast tab; the builder has no forecast history to measure it from.'],
    [/\bdeal tiers?\b/,                             'Deal tier is not a field on deals (accounts carry a tier — group Accounts by Tier).'],
    [/\bcompetitors?\b/,                            'Competitor is not a field the builder holds.'],
    [/\b(quota|attainment)\b/,                      'Quota attainment is the Performance tab’s; the builder has no quota field.'],
    [/\bweighted\b/,                                'Weighted pipeline is not a builder measure — Revenue is the unweighted sum.'],
    [/\blast (\d+) quarters\b/,                     'A span of quarters is not a period the builder offers — pick Q1–Q4, the fiscal year, or a custom range on the Filters tab.'],
];

// ── the period ──────────────────────────────────────────────────────────────
const shiftDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const shiftMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const startOfMonth = (d) => { const x = new Date(d); x.setDate(1); return x; };
const endOfMonth = (d) => { const x = new Date(d); x.setMonth(x.getMonth() + 1, 0); return x; };
const startOfWeek = (d) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };   // Monday
const custom = (from, to) => ({ period: 'custom', from: isoLocal(from), to: isoLocal(to) });

function detectPeriod(text, today, fiscalStart) {
    const q = quarterOf(isoLocal(today), fiscalStart);
    const rules = [
        [/\b(all[- ]time|ever|overall|to date|since the beginning)\b/,               () => ({ period: 'all', label: 'All time' })],
        [/\b(?:last|previous|prior) (?:fiscal )?year\b/,                             () => { const r = fiscalRange(q.fiscalYear - 1, 'FY', fiscalStart); return { ...r, period: 'custom', label: `Last fiscal year (FY${q.fiscalYear - 1})` }; }],
        [/\b(this|current) (?:fiscal )?year\b|\bytd\b|\byear to date\b|\bfiscal year\b|\bthis fy\b/, () => ({ period: 'FY', label: 'This fiscal year' })],
        [/\b(?:last|previous|prior) quarter\b/,                                      () => { const r = priorRange(`Q${q.q}`, 'previous_quarter', fiscalStart, { today }); return { ...r, period: 'custom', label: 'Last quarter' }; }],
        [/\b(this|current) quarter\b|\bqtd\b|\bquarter to date\b/,                   () => ({ period: `Q${q.q}`, label: `This quarter (Q${q.q})` })],
        [/\bq([1-4])\b/,                                                             (m) => ({ period: `Q${m[1]}`, label: `Q${m[1]}` })],
        [/\b(?:last|past|previous|trailing) (\d+) days?\b/,                          (m) => ({ ...custom(shiftDays(today, -(Number(m[1]) - 1)), today), label: `Last ${m[1]} days` })],
        [/\b(?:last|past|previous|trailing) (\d+) weeks?\b/,                         (m) => ({ ...custom(shiftDays(today, -(Number(m[1]) * 7 - 1)), today), label: `Last ${m[1]} weeks` })],
        [/\b(?:last|past|previous|trailing) (\d+) months?\b/,                        (m) => ({ ...custom(shiftMonths(today, -Number(m[1])), today), label: `Last ${m[1]} months` })],
        [/\bthis month\b|\bmonth to date\b|\bmtd\b/,                                 () => ({ ...custom(startOfMonth(today), today), label: 'This month' })],
        [/\b(?:last|previous|prior) month\b/,                                        () => { const p = shiftMonths(startOfMonth(today), -1); return { ...custom(p, endOfMonth(p)), label: 'Last month' }; }],
        [/\bthis week\b|\bweek to date\b|\bwtd\b/,                                   () => ({ ...custom(startOfWeek(today), today), label: 'This week' })],
        [/\b(?:last|previous|prior) week\b/,                                         () => { const s = shiftDays(startOfWeek(today), -7); return { ...custom(s, shiftDays(s, 6)), label: 'Last week' }; }],
        [/\byesterday\b/,                                                            () => ({ ...custom(shiftDays(today, -1), shiftDays(today, -1)), label: 'Yesterday' })],
        [/\btoday\b/,                                                                () => ({ ...custom(today, today), label: 'Today' })],
    ];
    for (const [re, make] of rules) {
        const m = re.exec(text);
        if (m) return { ...make(m), consumed: re };
    }
    return null;
}

// ── the chart ───────────────────────────────────────────────────────────────
const CHART_WORDS = [
    ['table',   /\b(table|list|grid|spreadsheet)\b/],
    ['funnel',  /\bfunnel\b/],
    ['stacked', /\bstacked\b/],
    ['line',    /\b(line( chart)?|trend(s|line)?|over time|month over month|by month|monthly|per month|each month|by week|weekly|by quarter|quarterly)\b/],
    ['kpi',     /\b(kpi|big number|single number|scorecard|totals? only|just the total|as a number)\b/],
    ['bar',     /\b(?:horizontal |vertical )?bar(?: chart)?s?\b/],
];

// ── money and numbers ───────────────────────────────────────────────────────
const MONEY = /\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m|thousand|million)?\b/;
const money = (m) => Math.round(Number(m[1].replace(/,/g, '')) * (m[2] === 'k' || m[2] === 'thousand' ? 1e3 : m[2] === 'm' || m[2] === 'million' ? 1e6 : 1));

// ── the row filters, by source ──────────────────────────────────────────────
// Each rule: [regex, (match, state) => filter | filter[] | null]. A rule that
// matches is consumed from the text so its words cannot become a dimension.
const STUCK = /\b(stuck|stale|stalled|idle|silent|dormant|inactive|untouched|neglected|gone quiet|no (?:recent )?activity|not (?:been )?touched|without activity)\b(?:[^.,;]{0,24}?\b(?:for|in|over|more than|longer than|past|>|at least)?\s*(\d+)\+?\s*days?)?/;
const NO_ACTIVITY_DAYS = /\b(\d+)\+?\s*(?:or more )?days?\s+(?:with(?:out)?\s+(?:no\s+)?activity|of inactivity|since (?:the )?last (?:activity|touch|contact)|no activity|inactive|idle|silent)\b/;
const IN_STAGE_DAYS = /\b(?:in (?:the same |the current |one |a |its )?stage (?:for )?(?:more than |over |longer than |at least |> ?)?(\d+)\+? days?|(\d+)\+? days? in (?:the same |the current |one |a )?stage)\b/;
const OVER_MONEY  = /\b(?:over|above|more than|bigger than|larger than|greater than|at least|worth (?:more than|over|at least)|exceeding|>=?)\s*\$\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m|thousand|million)?\b|\$\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m)?\s*(?:or more|and up|\+)/;
const UNDER_MONEY = /\b(?:under|below|less than|smaller than|at most|no more than|<=?)\s*\$\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m|thousand|million)?\b|\$\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m)?\s*(?:or less|and under)/;

const OPP_FILTER_RULES = [
    [STUCK,            (m, s) => { s.stuck = true; return { id: 'no_activity_days', op: 'gte', value: m[2] ? Number(m[2]) : 14 }; }],
    [NO_ACTIVITY_DAYS, (m, s) => { s.stuck = true; return { id: 'no_activity_days', op: 'gte', value: Number(m[1]) }; }],
    [IN_STAGE_DAYS,    (m) => ({ id: 'days_in_stage', op: 'gte', value: Number(m[1] || m[2]) })],
    [OVER_MONEY,       (m) => ({ id: 'arr', op: 'gte', value: money([null, m[1] || m[3], m[2] || m[4]]) })],
    [UNDER_MONEY,      (m) => ({ id: 'arr', op: 'lte', value: money([null, m[1] || m[3], m[2] || m[4]]) })],
];
const WON  = /\b(closed[- ]?won|won|wins)\b/;
const LOST = /\b(closed[- ]?lost|lost|losses)\b/;
const OPEN = /\b(open|active|in[- ]flight|in progress|unclosed|not (?:yet )?closed|still open|live|current)\b/;

const LEAD_FILTER_RULES = [
    [/\bconverted\b/,                                  () => ({ id: 'status', op: 'eq', value: 'Converted' })],
    [/\b(?:dead|disqualified|lost) leads?\b|\bdead\b/,  () => ({ id: 'status', op: 'eq', value: 'Dead' })],
    [/\bunassigned\b/,                                 () => ({ id: 'assigned_to', op: 'eq', value: 'Unassigned' })],
    [/\b(hot|warm|cold)\b/,                            (m) => ({ id: 'score_bucket', op: 'eq', value: m[1] })],
    [/\b(?:score|scored|scoring)\s+(?:over|above|at least|>=?|of)\s*(\d+)\b/, (m) => ({ id: 'score', op: 'gte', value: Number(m[1]) })],
    [/\b(?:score|scored|scoring)\s+(?:under|below|at most|<=?)\s*(\d+)\b/,   (m) => ({ id: 'score', op: 'lte', value: Number(m[1]) })],
];
const ACTIVITY_TYPES = [['calls?', 'Call'], ['meetings?', 'Meeting'], ['emails?', 'Email'], ['demos?', 'Demo'], ['proposals? sent', 'Proposal Sent'], ['follow[- ]?ups?', 'Follow-up']];

// ── the measures, by source ─────────────────────────────────────────────────
const COUNT_WORDS = /\b(how many|number of|count(?: of)?|# ?of|volume|total number)\b/;
const METRIC_WORDS = {
    Opportunities: [
        ['avg_deal',      /\b(?:average|avg|mean|typical) (?:deal|deal size|size|arr|revenue|value|amount)\b|\bdeal size\b/],
        ['days_to_close', /\b(days (?:from \S+ )?to close|sales cycle|cycle (?:time|length)|time to close|velocity|how long (?:to|until) close)\b/],
        ['days_in_stage', /\b(days in stage|stage age|age in stage|time in stage|how long in stage)\b/],
        ['ai_score',      /\b(ai score|health score|deal health|average score|avg score)\b/],
        ['activities',    /\b(activities per|activity count|# ?activities|number of activities|touches per)\b/],
        ['revenue',       /\b(revenue|arr|dollars?|amount|value|bookings?|worth|acv|tcv|sales(?! ?reps?| ?people|persons?)|at risk)\b|\$/],
        ['deals',         COUNT_WORDS],
    ],
    Accounts: [
        ['open_pipeline', /\b(open pipeline|pipeline)\b/],
        ['revenue',       /\b(revenue|won|sales|dollars?|bookings?|value|arr)\b|\$/],
        ['deals',         /\b(deals?|opportunit(?:y|ies))\b/],
        ['accounts',      COUNT_WORDS],
    ],
    Leads: [
        ['converted',     /\b(conver(?:ted|sions?)|converts)\b/],
        ['avg_score',     /\b(average score|avg score|mean score|lead score|score)\b/],
        ['est_arr',       /\b(arr|revenue|value|estimated|potential|worth)\b|\$/],
        ['leads',         COUNT_WORDS],
    ],
    Activity: [
        ['duration',      /\b(minutes|hours|time (?:spent|logged)|duration|how long)\b/],
        ['deals_touched', /\b(deals touched|unique deals|distinct deals|deals covered)\b/],
        ['activities',    COUNT_WORDS],
    ],
};

// ── the dimensions, by source ───────────────────────────────────────────────
const REP = /\b(reps?|owners?|sales ?reps?|sales ?people|salespersons?|salesperson|sellers?|account (?:execs?|executives?|managers?)|aes?|person|people|team members?|assigned to|assignee)\b/;
const TIME = /\b(over time|by month|monthly|per month|each month|by week|weekly|by quarter|quarterly|timeline|month over month|by date|by day|daily)\b/;
const DIM_WORDS = {
    Opportunities: [
        ['owner',              REP],
        ['stage',              /\bstages?\b/],
        ['industry',           /\b(industr(?:y|ies)|verticals?)\b/],
        ['territory',          /\b(territor(?:y|ies)|regions?)\b/],
        ['forecast_category',  /\b(forecast categor(?:y|ies)|commit|best case)\b/],
        ['loss_reason',        /\b(loss reasons?|lost reasons?|why (?:we |they )?lost|reasons? (?:for )?(?:loss|losing|lost))\b/],
        ['product_line',       /\b(products?(?: lines?)?)\b/],
        ['last_activity_date', /\blast activity (?:date|month)\b/],
        ['created_date',       /\b(created (?:date|month)|creation (?:date|month)|by created|when created)\b/],
        ['close_date',         /\b(close (?:date|month)|closing month|by close|when clos(?:ed|ing))\b/],
    ],
    Accounts: [
        ['owner',        REP],
        ['industry',     /\b(industr(?:y|ies)|verticals?)\b/],
        ['territory',    /\b(territor(?:y|ies)|regions?)\b/],
        ['tier',         /\btiers?\b/],
        ['segment',      /\bsegments?\b/],
        ['state',        /\bstates?\b/],
        ['created_date', /\b(created (?:date|month)|creation)\b/],
    ],
    Leads: [
        ['assigned_to',  REP],
        ['source',       /\b(sources?|channels?|origin)\b/],
        ['status',       /\bstatus(?:es)?\b/],
        ['score_bucket', /\b(score buckets?|score bands?)\b/],
        ['created_date', /\b(created (?:date|month)|creation)\b/],
    ],
    Activity: [
        ['rep',     REP],
        ['type',    /\b(types?|kinds?|by activity)\b/],
        ['outcome', /\boutcomes?\b/],
        ['date',    /\bdates?\b/],
    ],
};
/** The month dimension "over time" means for a source. */
const TIME_DIM = { Opportunities: 'close_date', Accounts: 'created_date', Leads: 'created_date', Activity: 'date' };

// ── the interpretation ──────────────────────────────────────────────────────
/**
 * → { name, definition: { source, dims, metrics, period, from, to, where, chartType },
 *     understood: [{ kind, text }…], notes: [string…] }
 * opts: { today: Date, fiscalStart: number, stages: [name…], people: [name…] }
 */
export function interpretPrompt(text, opts = {}) {
    const today = opts.today instanceof Date ? opts.today : new Date();
    const fiscalStart = Number.isFinite(Number(opts.fiscalStart)) ? Number(opts.fiscalStart) : 10;
    const raw = str(text).trim();
    let t = ' ' + normalizePrompt(raw) + ' ';
    const consume = (re) => { t = t.replace(re, ' '); };
    const notes = [], understood = [], where = [];
    const state = {};

    // 1. the source — read from the whole sentence
    const { source, word: sourceWord } = detectSource(t);
    const fields = fieldsFor(source);
    understood.push({ kind: 'source', text: source });

    // 2. what cannot be done — named, then removed so "tier" or "quota" is not read as a field
    for (const [re, note] of UNSUPPORTED) if (re.test(t)) { notes.push(note); consume(re); }

    // 3. the period
    const period = detectPeriod(t, today, fiscalStart);
    if (period) { consume(period.consumed); understood.push({ kind: 'period', text: period.label }); }

    // 4. the chart — "over time" is also the source's month dimension
    if (/\b(by quarter|quarterly)\b/.test(t)) notes.push('Grouped by month — the builder has no quarter dimension yet.');
    let chartType = null;
    for (const [id, re] of CHART_WORDS) {
        if (re.test(t)) {
            chartType = id;
            if (id === 'line') state.time = true;
            consume(re);
            break;
        }
    }
    if (TIME.test(t)) { state.time = true; consume(TIME); }

    // 5. the row filters
    const addWhere = (w) => { if (w && !where.some(x => x.id === w.id && x.op === w.op)) where.push(w); };
    if (source === 'Opportunities') {
        for (const [re, make] of OPP_FILTER_RULES) { const m = re.exec(t); if (m) { addWhere(make(m, state)); consume(re); } }
        const won = WON.test(t), lost = LOST.test(t);
        if (won && lost) { notes.push('Won and lost together: no status filter — group by Stage to compare them.'); consume(WON); consume(LOST); state.closedBoth = true; }
        else if (won) { addWhere({ id: 'status', op: 'eq', value: 'won' }); consume(WON); }
        else if (lost) { addWhere({ id: 'status', op: 'eq', value: 'lost' }); consume(LOST); }
        else if (OPEN.test(t)) { addWhere({ id: 'status', op: 'eq', value: 'open' }); consume(OPEN); }
        else if (state.stuck) addWhere({ id: 'status', op: 'eq', value: 'open' });   // a stuck deal is an open one
        // the org's own stage names: "in Proposal", "Proposal stage"
        for (const name of (Array.isArray(opts.stages) ? opts.stages : []).map(str).filter(Boolean)) {
            const re = new RegExp(`\\b(?:in|at|reached|sitting in|still in)\\s+${esc(name.toLowerCase())}\\b|\\b${esc(name.toLowerCase())}\\s+stage\\b`);
            if (re.test(t)) { addWhere({ id: 'stage', op: 'eq', value: name }); consume(re); }
        }
    } else if (source === 'Leads') {
        for (const [re, make] of LEAD_FILTER_RULES) { const m = re.exec(t); if (m) { addWhere(make(m, state)); consume(re); } }
    } else if (source === 'Activity') {
        const types = [];
        for (const [word, value] of ACTIVITY_TYPES) {
            const re = new RegExp(`\\b${word}\\b`);
            if (re.test(t)) { types.push(value); consume(re); }
        }
        if (types.length === 1) addWhere({ id: 'type', op: 'eq', value: types[0] });
        else if (types.length > 1) addWhere({ id: 'type', op: 'in', value: types });
    }
    // the roster: "Karen's deals", "for Ryan Algie" — a full name, or a first name that names one person
    const people = (Array.isArray(opts.people) ? opts.people : []).map(str).filter(Boolean);
    if (people.length) {
        const ownerId = source === 'Leads' ? 'assigned_to' : source === 'Activity' ? 'rep' : 'owner';
        let hit = null;
        for (const name of people) { const re = new RegExp(`\\b${esc(name.toLowerCase())}\\b`); if (re.test(t)) { hit = { name, re }; break; } }
        if (!hit) {
            for (const name of people) {
                const first = name.toLowerCase().split(/\s+/)[0];
                if (!first || people.filter(p => p.toLowerCase().split(/\s+/)[0] === first).length !== 1) continue;
                const re = new RegExp(`\\b${esc(first)}\\b`);
                if (re.test(t)) { hit = { name, re }; break; }
            }
        }
        if (hit) { addWhere({ id: ownerId, op: 'eq', value: hit.name }); consume(hit.re); }
    }
    for (const w of where) understood.push({ kind: 'filter', text: whereLabel(source, w) });

    // 6. the measures
    const metrics = [];
    for (const [id, re] of METRIC_WORDS[source]) { if (re.test(t)) { metrics.push(id); consume(re); } }
    if (!metrics.length) {
        if (source === 'Opportunities') metrics.push(...(/^(deals?|opps?|opportunit(?:y|ies))$/.test(sourceWord || '') || where.length ? ['deals', 'revenue'] : ['revenue']));
        else metrics.push(...fields.defaults.metrics);
    }

    // 7. the dimensions — in the order the sentence names them
    const found = [];
    for (const [id, re] of DIM_WORDS[source]) { const m = re.exec(t); if (m) { found.push({ id, index: m.index }); consume(re); } }
    if (state.time && !found.some(f => f.id === TIME_DIM[source])) found.push({ id: TIME_DIM[source], index: -1 });
    found.sort((a, b) => a.index - b.index);
    const dims = [...new Set(found.map(f => f.id))].slice(0, 3);
    if (state.closedBoth && !dims.includes('stage')) dims.unshift('stage');

    // 8. the chart, when the sentence did not say: totals alone are a KPI card, a
    //    month is a line, two dimensions stack, else a bar. A said chart stands.
    const said = chartType;
    if (!chartType) chartType = !dims.length ? 'kpi' : dims.some(id => fields.dims.find(d => d.id === id)?.kind === 'month') ? 'line' : dims.length >= 2 ? 'stacked' : 'bar';
    else if (chartType === 'line' && !dims.some(id => fields.dims.find(d => d.id === id)?.kind === 'month')) dims.unshift(TIME_DIM[source]);
    if (chartType === 'funnel' && source === 'Opportunities' && !dims.includes('stage')) dims.unshift('stage');
    if (!dims.length && !said) chartType = 'kpi';

    const dimRefs = dims.map(id => fields.dims.find(d => d.id === id)).filter(Boolean).map(d => ({ id: d.id, label: d.label, kind: 'dim' }));
    const metricRefs = [...new Set(metrics)].map(id => fields.metrics.find(m => m.id === id)).filter(Boolean).map(m => ({ id: m.id, label: m.label, kind: 'metric' }));
    for (const d of dimRefs) understood.push({ kind: 'group', text: d.label });
    for (const m of metricRefs) understood.push({ kind: 'measure', text: m.label });
    understood.push({ kind: 'chart', text: REPORT_CHARTS.find(c => c.id === chartType)?.label || chartType });
    if (!period) understood.push({ kind: 'period', text: REPORT_PERIODS[0].label });
    if (!dimRefs.length && !where.length && !period && metrics.every(id => fields.defaults.metrics.includes(id) || id === 'deals')) {
        notes.push('Only the data source was recognised — the defaults are shown. Edit the fields on the right, or try one of the starters.');
    }

    const name = raw ? raw.charAt(0).toUpperCase() + raw.slice(1).replace(/\s+/g, ' ').slice(0, 79) : 'Untitled report';
    return {
        name,
        definition: {
            source, dims: dimRefs, metrics: metricRefs, chartType,
            period: period ? period.period : 'all', from: period?.from || '', to: period?.to || '',
            where: where.map(w => ({ ...w })),
        },
        understood, notes,
    };
}

/** The filters a source offers, for a picker — re-exported so a caller need not know two modules. */
export { filtersFor };
