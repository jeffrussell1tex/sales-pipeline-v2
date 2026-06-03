// netlify/functions/score-lead.mjs
// Pure lead-scoring engine. No DB calls — testable + reusable by the
// write-triggered path (leads.mjs) and the nightly batch (score-leads-batch.mjs).
//
// Two independent axes, never blended:
//   fit        — intrinsic lead quality (title seniority, deal size, source)
//   engagement — progression + recency (status stage + time-decayed recency)
// Each normalized 0–100, then bucketed cold/warm/hot.
//
// v1 note: the activities table has no leadId, so engagement is derived from
// the lead's own status + recency (firstTouchDate/createdAt). The engine is
// forward-compatible: when real lead activity events exist (v1.5), add rules
// with op 'event' and pass them through computeEngagement's `events` arg.

const decay = (points, ageDays, halfLife) =>
    (halfLife > 0 ? points * Math.pow(0.5, ageDays / halfLife) : points);

function evalRule(actual, op, expected) {
    const s = (v) => String(v ?? '').toLowerCase();
    switch (op) {
        case 'equals':     return String(actual ?? '') === String(expected);
        case 'notEquals':  return String(actual ?? '') !== String(expected);
        case 'in':         return Array.isArray(expected) && expected.map(String).includes(String(actual ?? ''));
        case 'gte':        return actual != null && actual !== '' && Number(actual) >= Number(expected);
        case 'lte':        return actual != null && actual !== '' && Number(actual) <= Number(expected);
        case 'contains':   return s(actual).includes(s(expected));
        case 'matchesAny': return Array.isArray(expected) && expected.some(e => s(actual).includes(s(e)));
        case 'exists':     return actual !== null && actual !== undefined && actual !== '';
        default:           return false;
    }
}

export function computeFit(lead, fitConfig) {
    const matched = []; let raw = 0;
    for (const r of (fitConfig?.rules || [])) {
        if (evalRule(lead[r.field], r.op, r.value)) {
            raw += Number(r.points) || 0;
            matched.push({ id: r.id, label: r.label, points: Number(r.points) || 0 });
        }
    }
    const max = Number(fitConfig?.max) || 100;
    const score = Math.max(0, Math.min(100, Math.round((raw / max) * 100)));
    return { score, matched };
}

// engConfig.rules: field/op/points rules evaluated against the lead, plus
// optional { op:'recency', points, decayHalfLifeDays } rules that decay on
// firstTouchDate||createdAt. (events arg reserved for v1.5 behavioral events.)
export function computeEngagement(lead, engConfig, now = Date.now(), events = null) {
    const matched = []; let raw = 0;
    for (const r of (engConfig?.rules || [])) {
        if (r.op === 'recency') {
            const dateStr = lead.firstTouchDate || lead.createdAt;
            const t = dateStr ? new Date(dateStr).getTime() : NaN;
            if (!isNaN(t)) {
                const ageDays = Math.max(0, (now - t) / 86_400_000);
                const pts = decay(Number(r.points) || 0, ageDays, Number(r.decayHalfLifeDays) || 30);
                raw += pts;
                matched.push({ id: r.id, label: r.label, points: Math.round(pts) });
            }
            continue;
        }
        if (r.op === 'event') {
            // v1.5: real behavioral events once activities carry a leadId
            for (const ev of (events || [])) {
                if (ev.type !== r.event) continue;
                const ageDays = Math.max(0, (now - new Date(ev.at).getTime()) / 86_400_000);
                const pts = decay(Number(r.points) || 0, ageDays, Number(r.decayHalfLifeDays) || 30);
                raw += pts;
                matched.push({ id: r.id, label: r.label, points: Math.round(pts), at: ev.at });
            }
            continue;
        }
        if (evalRule(lead[r.field], r.op, r.value)) {
            raw += Number(r.points) || 0;
            matched.push({ id: r.id, label: r.label, points: Number(r.points) || 0 });
        }
    }
    const max = Number(engConfig?.max) || 100;
    const score = Math.max(0, Math.min(100, Math.round((raw / max) * 100)));
    return { score, matched };
}

export function bucketOf(fit, engagement, buckets) {
    const b = buckets || DEFAULT_LEAD_SCORING.buckets;
    const v = Math.max(Number(fit) || 0, Number(engagement) || 0);
    if (v >= (b.hot?.[0]  ?? 71)) return 'hot';
    if (v >= (b.warm?.[0] ?? 41)) return 'warm';
    return 'cold';
}

// Convenience: lead -> persistable score columns. Returns null when scoring is
// disabled, so callers can leave the stored value untouched.
export function scoreLead(lead, leadScoring, now = Date.now(), events = null) {
    const cfg = leadScoring || DEFAULT_LEAD_SCORING;
    if (cfg.enabled === false) return null;
    const fit = computeFit(lead, cfg.fit);
    const eng = computeEngagement(lead, cfg.engagement, now, events);
    const bucket = bucketOf(fit.score, eng.score, cfg.buckets);
    const out = {
        leadScoreFit:        fit.score,
        leadScoreEngagement: eng.score,
        leadScoreBucket:     bucket,
        scoreBreakdown:      { fit: fit.matched, engagement: eng.matched, scoredAt: new Date(now).toISOString() },
        score:               Math.max(fit.score, eng.score), // legacy headline number
    };
    const pred = cfg.predictive;
    if (pred && pred.enabled && pred.model && pred.model.coefficients) {
        const prob = predictLead(lead, events, pred.model, now);
        if (prob != null) out.scoreBreakdown.probability = prob;
    }
    return out;
}

export const DEFAULT_LEAD_SCORING = {
    enabled: true,
    scoredEntity: 'lead',
    fit: {
        max: 100,
        rules: [
            { id: 'f_title_exec', field: 'title', op: 'matchesAny', value: ['ceo','founder','owner','president','chief','cxo','cfo','cto','coo','partner'], points: 30, label: 'Exec / C-level title' },
            { id: 'f_title_vp',   field: 'title', op: 'matchesAny', value: ['vp','vice president','head of'], points: 22, label: 'VP / Head title' },
            { id: 'f_title_dir',  field: 'title', op: 'matchesAny', value: ['director'], points: 14, label: 'Director title' },
            { id: 'f_title_mgr',  field: 'title', op: 'matchesAny', value: ['manager','lead'], points: 8, label: 'Manager title' },
            { id: 'f_arr_250',    field: 'estimatedARR', op: 'gte', value: 250000, points: 30, label: '$250k+ est. ARR' },
            { id: 'f_arr_100',    field: 'estimatedARR', op: 'gte', value: 100000, points: 20, label: '$100k+ est. ARR' },
            { id: 'f_arr_50',     field: 'estimatedARR', op: 'gte', value: 50000,  points: 10, label: '$50k+ est. ARR' },
            { id: 'f_src_ref',    field: 'source', op: 'in', value: ['Referral','Partner Referral'], points: 18, label: 'Referral source' },
            { id: 'f_src_inb',    field: 'source', op: 'in', value: ['Website','Webinar','LinkedIn'], points: 10, label: 'Inbound source' },
        ],
    },
    engagement: {
        max: 100,
        rules: [
            { id: 'e_qualified', field: 'status', op: 'equals', value: 'Qualified', points: 45, label: 'Reached Qualified' },
            { id: 'e_working',   field: 'status', op: 'equals', value: 'Working',   points: 30, label: 'Working' },
            { id: 'e_contacted', field: 'status', op: 'equals', value: 'Contacted', points: 18, label: 'Contacted' },
            { id: 'e_new',       field: 'status', op: 'equals', value: 'New',       points: 5,  label: 'New' },
            { id: 'e_recency',   op: 'recency', points: 40, decayHalfLifeDays: 21, label: 'Recency of first touch' },
            { id: 'e_demo',     op: 'event', event: 'Demo',     points: 35, decayHalfLifeDays: 30, label: 'Demo logged' },
            { id: 'e_meeting',  op: 'event', event: 'Meeting',  points: 28, decayHalfLifeDays: 30, label: 'Meeting logged' },
            { id: 'e_schedule', op: 'event', event: 'Schedule', points: 18, decayHalfLifeDays: 30, label: 'Meeting scheduled' },
            { id: 'e_call',     op: 'event', event: 'Call',     points: 15, decayHalfLifeDays: 21, label: 'Call logged' },
            { id: 'e_email',    op: 'event', event: 'Email',    points: 6,  decayHalfLifeDays: 14, label: 'Email logged' },
        ],
    },
    buckets: { cold: [0, 40], warm: [41, 70], hot: [71, 100] },
    predictive: { enabled: false, minClosedRecords: 150, model: null },
};

// --- Phase 2: predictive (per-org logistic regression) ----------------------
// Predicts conversion probability from signals that PRECEDE the outcome.
// `status` is excluded (it defines the train label -> would be target leakage).
// Trained per org; never pooled across tenants.

const PRED_SENIORITY = [
    { kw: ['ceo','founder','owner','president','chief','cxo','cfo','cto','coo','partner'], v: 1 },
    { kw: ['vp','vice president','head of'], v: 0.75 },
    { kw: ['director'], v: 0.55 },
    { kw: ['manager','lead'], v: 0.35 },
];
function seniorityScore(title) {
    const t = String(title || '').toLowerCase();
    for (const s of PRED_SENIORITY) if (s.kw.some(k => t.includes(k))) return s.v;
    return 0.15;
}

export const PREDICTIVE_FEATURES = ['seniority', 'dealSize', 'recency', 'events', 'sourceWinRate'];

export function leadFeatures(lead, events, sourceWinRate, now = Date.now()) {
    const arr = Number(lead.estimatedARR) || 0;
    const dstr = lead.firstTouchDate || lead.createdAt;
    const t = dstr ? new Date(dstr).getTime() : NaN;
    const recency = isNaN(t) ? 0 : Math.exp(-Math.max(0, (now - t) / 86400000) / 30);
    const ec = Math.min(1, (events ? events.length : 0) / 5);
    const swr = (sourceWinRate && (sourceWinRate[lead.source] != null ? sourceWinRate[lead.source] : sourceWinRate._avg)) ?? 0.3;
    return [seniorityScore(lead.title), Math.min(1, arr / 250000), recency, ec, swr];
}

export function computeSourceWinRate(decided) {
    const by = {}; let won = 0, tot = 0;
    for (const r of decided) {
        const s = r.source || '_unknown';
        (by[s] = by[s] || { won: 0, tot: 0 }).tot++; tot++;
        if (r.label === 1) { by[s].won++; won++; }
    }
    const avg = tot ? won / tot : 0.3;
    const out = { _avg: avg };
    for (const s in by) out[s] = by[s].tot >= 3 ? by[s].won / by[s].tot : avg;
    return out;
}

export function trainLeadModel(rows, { iters = 400, lr = 0.3, l2 = 0.01 } = {}) {
    if (!rows || rows.length < 20) return null;
    const k = rows[0].features.length;
    const means = Array(k).fill(0), stds = Array(k).fill(0);
    for (const r of rows) for (let j = 0; j < k; j++) means[j] += r.features[j];
    for (let j = 0; j < k; j++) means[j] /= rows.length;
    for (const r of rows) for (let j = 0; j < k; j++) stds[j] += (r.features[j] - means[j]) ** 2;
    for (let j = 0; j < k; j++) stds[j] = Math.sqrt(stds[j] / rows.length) || 1;
    const X = rows.map(r => r.features.map((v, j) => (v - means[j]) / stds[j]));
    const y = rows.map(r => r.label);
    const sig = z => 1 / (1 + Math.exp(-z));
    let w = Array(k).fill(0), b = 0;
    for (let it = 0; it < iters; it++) {
        const gw = Array(k).fill(0); let gb = 0;
        for (let i = 0; i < X.length; i++) {
            const e = sig(X[i].reduce((s, v, j) => s + v * w[j], 0) + b) - y[i];
            for (let j = 0; j < k; j++) gw[j] += e * X[i][j];
            gb += e;
        }
        for (let j = 0; j < k; j++) w[j] -= lr * (gw[j] / X.length + l2 * w[j]);
        b -= lr * (gb / X.length);
    }
    let correct = 0;
    for (let i = 0; i < X.length; i++) {
        const p = sig(X[i].reduce((s, v, j) => s + v * w[j], 0) + b);
        if ((p >= 0.5 ? 1 : 0) === y[i]) correct++;
    }
    return { coefficients: w, bias: b, means, stds, featureNames: PREDICTIVE_FEATURES, n: rows.length, accuracy: Math.round((correct / rows.length) * 100), trainedAt: new Date().toISOString() };
}

export function predictLead(lead, events, model, now = Date.now()) {
    if (!model || !model.coefficients) return null;
    const f = leadFeatures(lead, events, model.sourceWinRate, now);
    let z = model.bias || 0;
    for (let j = 0; j < f.length; j++) z += ((f[j] - model.means[j]) / (model.stds[j] || 1)) * model.coefficients[j];
    return Math.round((1 / (1 + Math.exp(-z))) * 100);
}
