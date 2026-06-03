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
    return {
        leadScoreFit:        fit.score,
        leadScoreEngagement: eng.score,
        leadScoreBucket:     bucket,
        scoreBreakdown:      { fit: fit.matched, engagement: eng.matched, scoredAt: new Date(now).toISOString() },
        score:               Math.max(fit.score, eng.score), // legacy headline number
    };
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
        ],
    },
    buckets: { cold: [0, 40], warm: [41, 70], hot: [71, 100] },
    predictive: { enabled: false, minClosedRecords: 200, lastTrainedAt: null, coefficients: null },
};
