// leadScoringDefaults.js — the ONE copy of the default lead-scoring config
// (state §0.123). The engine (netlify/functions/score-lead.mjs) re-exports it
// and every function reads it through the engine; the Settings panel imports
// it here for first load and Reset. Before this file the panel kept a MIRROR
// that had drifted: five engagement rules where the engine had ten — a brand-new
// org's first Save, or any Reset to defaults, silently dropped the five
// behavioural (op:'event') rules v1.5 added. Pure data; no React, no db.
//
// Fit and engagement are two independent axes, never blended; each rule's
// points are summed and normalised against `max`. The engine's `evalRule`
// understands the ops used here; the panel offers the same op list.
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
            // 'Web Form' is what the web-to-lead form stamps (§0.121) and what the
            // lead import offers; a lead that came to you is inbound by definition.
            { id: 'f_src_inb',    field: 'source', op: 'in', value: ['Website','Webinar','LinkedIn','Web Form'], points: 10, label: 'Inbound source' },
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
            // v1.5 — real activity logged against the lead (activities.lead_id)
            { id: 'e_demo',     op: 'event', event: 'Demo',     points: 35, decayHalfLifeDays: 30, label: 'Demo logged' },
            { id: 'e_meeting',  op: 'event', event: 'Meeting',  points: 28, decayHalfLifeDays: 30, label: 'Meeting logged' },
            { id: 'e_schedule', op: 'event', event: 'Schedule', points: 18, decayHalfLifeDays: 30, label: 'Meeting scheduled' },
            { id: 'e_call',     op: 'event', event: 'Call',     points: 15, decayHalfLifeDays: 21, label: 'Call logged' },
            { id: 'e_email',    op: 'event', event: 'Email',    points: 6,  decayHalfLifeDays: 14, label: 'Email logged' },
        ],
    },
    buckets: { cold: [0, 40], warm: [41, 70], hot: [71, 100] },
    // Phase 2 — per-org logistic regression, trained by the nightly batch once
    // the org has this many decided (Converted / Dead) leads. `model` is what
    // the batch stores; null until then.
    predictive: { enabled: false, minClosedRecords: 150, model: null },
};

/** A lead that has been decided either way — what the predictive model trains on. */
export const DECIDED_STATUSES = Object.freeze(['Converted', 'Dead']);
export const isDecidedLead = (lead) => DECIDED_STATUSES.includes(lead?.status);
