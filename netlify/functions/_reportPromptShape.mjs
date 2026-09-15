// _reportPromptShape.mjs — the pure half of report-prompt.mjs (state §0.141):
// the one tool Claude may call, the system prompt that hands it the builder's
// vocabulary and the org's words, and the validation that passes its answer
// through the SAME allowlists a saved report passes through. No db, no fetch,
// no env — so tests/report-prompt.test.mjs RUNS it (§18b23) without a database
// connection; the endpoint imports it. Underscore-prefixed: not an endpoint.
import { REPORT_SOURCES, REPORT_PERIODS, REPORT_CHARTS, isReportSource, fieldsFor, resolveDefinition, resolveWhere } from '../../src/utils/reportQuery.js';

export const REPORT_PROMPT_MODEL = 'claude-opus-5';
export const MAX_PROMPT_CHARS = 300;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The one tool Claude may call: the definition, in the builder's vocabulary. Strict — the shape is the contract. */
export const SET_REPORT_TOOL = Object.freeze({
    name: 'set_report',
    description: 'Record the report the sentence asks for, using ONLY ids from the vocabulary. Call it exactly once.',
    strict: true,
    input_schema: {
        type: 'object',
        additionalProperties: false,
        required: ['source', 'dims', 'metrics', 'period', 'from', 'to', 'where', 'chartType', 'name', 'notes'],
        properties: {
            source:    { type: 'string', enum: [...REPORT_SOURCES] },
            dims:      { type: 'array', items: { type: 'string' }, description: 'Dimension ids of the chosen source, in the order the sentence names them (0–3).' },
            metrics:   { type: 'array', items: { type: 'string' }, description: 'Metric ids of the chosen source (1–3).' },
            period:    { type: 'string', enum: [...REPORT_PERIODS.map(p => p.value), 'custom'] },
            from:      { type: 'string', description: 'yyyy-mm-dd when period is custom, else empty.' },
            to:        { type: 'string', description: 'yyyy-mm-dd when period is custom, else empty.' },
            where: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['id', 'op', 'value'],
                    properties: {
                        id:    { type: 'string', description: 'A filter id of the chosen source.' },
                        op:    { type: 'string', enum: ['eq', 'ne', 'in', 'gte', 'lte'] },
                        value: { type: 'string', description: 'The value as text; a number as digits; for "in", values separated by commas.' },
                    },
                },
            },
            chartType: { type: 'string', enum: REPORT_CHARTS.map(c => c.id) },
            name:      { type: 'string', description: 'A short title for the report, at most 80 characters — the sentence itself is fine.' },
            notes:     { type: 'array', items: { type: 'string' }, description: 'One sentence for each thing the sentence asked for that the vocabulary cannot express.' },
        },
    },
});

/** The system prompt: the task, the vocabulary, the calendar, the org's words. */
export function systemPromptFor({ vocabulary, today, fiscalStart, stages, people }) {
    return [
        'You turn one sentence from a sales manager into a report definition for a CRM report builder.',
        'Use ONLY the ids in the vocabulary below. Never invent a field, a filter or a period. If the sentence asks for something the vocabulary cannot express (win rate, forecast accuracy, a deal tier, a competitor, quota attainment, a span of quarters), leave it out and say so in one plain sentence in `notes`.',
        'Call the set_report tool exactly once with the definition. Do not answer in prose.',
        '',
        'Reading rules:',
        '- Pick the source the sentence is about: deals/opportunities/pipeline → Opportunities; accounts/customers/companies → Accounts; leads/prospects → Leads; calls/meetings/emails/activities → Activity.',
        '- "how many" / "number of" is the count metric of the source. Money words (revenue, ARR, dollars, $) are the revenue metric. With no measure named, use the source\'s default metrics (deals: deals and revenue when a filter is present, else revenue).',
        '- "stuck", "stale", "silent", "idle", "no activity" is the filter no_activity_days gte N (14 when no number is given) AND status eq open — a stuck deal is an open one.',
        '- "won" → status eq won; "lost" → status eq lost; "open"/"active" → status eq open. Won AND lost together → no status filter; group by stage instead.',
        '- Over/under $N → arr gte/lte N (k = thousand, m = million). "in stage more than N days" → days_in_stage gte N.',
        '- Group by what follows "by" / "per" / "for each", in sentence order. "over time" / "by month" → the source\'s month dimension and a line chart.',
        '- A stage name from the list below after "in", "at" or before "stage" → the filter stage eq that name, spelled exactly. A roster name (or a first name only when exactly one person has it) → the owner/assigned_to/rep filter eq the full name.',
        `- Periods: this quarter is the CURRENT fiscal quarter (fiscal years start in month ${fiscalStart}; today is ${today}); Q1–Q4 are this fiscal year's quarters; "this year" is FY; "all time" is all; any other window (last 30 days, last quarter, last month, this month, last year) is custom with from and to as yyyy-mm-dd computed from today. With no period, use all.`,
        '- Chart: a said chart stands. Unsaid: no dimension → kpi; a month dimension → line; two dimensions → stacked; else bar.',
        '',
        'Vocabulary (JSON):',
        JSON.stringify(vocabulary),
        '',
        `Stage names in this workspace: ${stages.length ? stages.join(' | ') : '(none configured)'}`,
        `Roster names in this workspace: ${people.length ? people.join(' | ') : '(none)'}`,
    ].join('\n');
}

/** Claude's tool input through the allowlists → { definition, name, notes }. */
export function validateReading(input, prompt) {
    const notes = Array.isArray(input?.notes) ? input.notes.filter(n => typeof n === 'string' && n.trim()).map(n => n.trim().slice(0, 200)).slice(0, 5) : [];
    const source = isReportSource(input?.source) ? input.source : 'Opportunities';
    const { dims, metrics, dropped } = resolveDefinition({ source, dims: Array.isArray(input?.dims) ? input.dims.slice(0, 3) : [], metrics: Array.isArray(input?.metrics) ? input.metrics.slice(0, 3) : [] });
    if (dropped.length) notes.push(`Not a field on ${source}, left out: ${dropped.map(d => (d && typeof d === 'object' ? d.id || d.label : d)).join(', ')}.`);
    const rawWhere = (Array.isArray(input?.where) ? input.where : []).slice(0, 6).map(w => ({
        id: w?.id, op: w?.op,
        value: w?.op === 'in' ? String(w?.value ?? '').split(',').map(s => s.trim()).filter(Boolean) : w?.value,
    }));
    const { where, dropped: droppedWhere } = resolveWhere(source, rawWhere);
    if (droppedWhere.length) notes.push(`Not a filter on ${source}, left out: ${droppedWhere.map(w => (w && typeof w === 'object' ? w.id : w)).join(', ')}.`);
    let period = 'all', from = '', to = '';
    if (input?.period === 'custom' && (DAY_RE.test(input.from || '') || DAY_RE.test(input.to || ''))) {
        period = 'custom'; from = DAY_RE.test(input.from || '') ? input.from : ''; to = DAY_RE.test(input.to || '') ? input.to : '';
    } else if (REPORT_PERIODS.some(p => p.value === input?.period)) period = input.period;
    const chartType = REPORT_CHARTS.some(c => c.id === input?.chartType) ? input.chartType : (!dims.length ? 'kpi' : 'bar');
    const name = typeof input?.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 80) : String(prompt ?? '').trim().slice(0, 80);
    return {
        definition: {
            source,
            dims: dims.map(d => ({ id: d.id, label: d.label, kind: 'dim' })),
            metrics: (metrics.length ? metrics : [fieldsFor(source).metrics[0]]).map(m => ({ id: m.id, label: m.label, kind: 'metric' })),
            period, from, to, where, chartType,
        },
        name, notes,
    };
}
