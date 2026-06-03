// settings/salesProcess/LeadScoringDetail.jsx
import React, { useState, useEffect } from 'react';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { CSectionCard } from '../shared/form.jsx';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';

// Mirror of the backend DEFAULT_LEAD_SCORING (score-lead.mjs) for first-load + reset.
const DEFAULT_LEAD_SCORING = {
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

const FIELD_OPTS = [
    { v: 'title',        l: 'Title' },
    { v: 'estimatedARR', l: 'Est. ARR' },
    { v: 'source',       l: 'Source' },
    { v: 'status',       l: 'Status' },
    { v: 'company',      l: 'Company' },
];
const OP_OPTS = [
    { v: 'matchesAny', l: 'matches any of' },
    { v: 'in',         l: 'is one of' },
    { v: 'equals',     l: 'equals' },
    { v: 'notEquals',  l: 'not equals' },
    { v: 'gte',        l: '≥' },
    { v: 'lte',        l: '≤' },
    { v: 'contains',   l: 'contains' },
    { v: 'exists',     l: 'is present' },
    { v: 'event',      l: 'activity logged' },
    { v: 'recency',    l: 'recency (decays)' },
];

const inputStyle = { padding: '5px 8px', fontSize: 12.5, fontFamily: T.sans, color: T.ink, background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, width: '100%', boxSizing: 'border-box' };
const dispVal = (r) => (Array.isArray(r.value) ? r.value.join(', ') : (r.value ?? ''));
const parseVal = (op, str) => {
    if (op === 'in' || op === 'matchesAny') return String(str).split(',').map(s => s.trim()).filter(Boolean);
    if (op === 'gte' || op === 'lte') return Number(str) || 0;
    return str;
};
const uid = (p) => p + '_' + Math.random().toString(36).slice(2, 8);

// ── Rule table (module-scope; rows edited via onChange handlers) ──────────────
const RuleTable = ({ kind, rules, onChange }) => {
    const set = (i, patch) => onChange(rules.map((r, ri) => (ri === i ? { ...r, ...patch } : r)));
    const remove = (i) => onChange(rules.filter((_, ri) => ri !== i));
    const add = () => onChange([...rules, { id: uid(kind === 'fit' ? 'f' : 'e'), field: 'source', op: 'equals', value: '', points: 10, label: 'New rule' }]);
    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 110px 130px 1.3fr 70px 28px', gap: 8, padding: '0 4px 6px', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: T.inkMuted, fontFamily: T.sans }}>
                <div>Label</div><div>Field</div><div>Operator</div><div>Value</div><div style={{ textAlign: 'right' }}>Points</div><div/>
            </div>
            {rules.map((r, i) => {
                const isRecency = r.op === 'recency';
                const isEvent = r.op === 'event';
                return (
                    <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 110px 130px 1.3fr 70px 28px', gap: 8, alignItems: 'center', padding: '5px 4px', borderTop: `1px solid ${T.border}` }}>
                        <input value={r.label || ''} onChange={e => set(i, { label: e.target.value })} style={inputStyle} />
                        <select value={r.field || ''} disabled={isRecency || isEvent} onChange={e => set(i, { field: e.target.value })} style={{ ...inputStyle, opacity: isRecency ? 0.5 : 1 }}>
                            {FIELD_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                        </select>
                        <select value={r.op || 'equals'} onChange={e => { const op = e.target.value; set(i, { op, value: (op === 'recency' || op === 'event') ? undefined : parseVal(op, dispVal(r)), ...(op === 'event' ? { event: r.event || '' } : {}) }); }} style={inputStyle}>
                            {OP_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                        </select>
                        {isEvent ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <input value={r.event || ''} onChange={e => set(i, { event: e.target.value })} placeholder="Activity type" style={inputStyle} />
                                <input type="number" value={r.decayHalfLifeDays ?? 30} onChange={e => set(i, { decayHalfLifeDays: Number(e.target.value) || 0 })} title="half-life days" style={{ ...inputStyle, width: 54 }} />
                            </div>
                        ) : isRecency ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 11.5, color: T.inkMuted, fontFamily: T.sans, whiteSpace: 'nowrap' }}>half-life</span>
                                <input type="number" value={r.decayHalfLifeDays ?? 21} onChange={e => set(i, { decayHalfLifeDays: Number(e.target.value) || 0 })} style={{ ...inputStyle, width: 64 }} />
                                <span style={{ fontSize: 11.5, color: T.inkMuted, fontFamily: T.sans }}>days</span>
                            </div>
                        ) : r.op === 'exists' ? (
                            <span style={{ fontSize: 12, color: T.inkMuted, fontFamily: T.sans }}>— (any value)</span>
                        ) : (
                            <input value={dispVal(r)} onChange={e => set(i, { value: parseVal(r.op, e.target.value) })} placeholder={r.op === 'in' || r.op === 'matchesAny' ? 'comma, separated' : ''} style={inputStyle} />
                        )}
                        <input type="number" value={r.points ?? 0} onChange={e => set(i, { points: Number(e.target.value) || 0 })} style={{ ...inputStyle, textAlign: 'right' }} />
                        <button onClick={() => remove(i)} title="Remove rule" style={{ background: 'none', border: 'none', color: T.inkMuted, cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>
                    </div>
                );
            })}
            <button onClick={add} style={{ marginTop: 10, padding: '6px 12px', background: T.surface, color: T.ink, border: `1px solid ${T.borderStrong}`, borderRadius: T.r, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>+ Add rule</button>
        </div>
    );
};

export const LeadScoringDetail = ({ settings, setSettings, onBack }) => {
    const seed = () => JSON.parse(JSON.stringify(settings?.leadScoring || DEFAULT_LEAD_SCORING));
    const [cfg, setCfg]       = useState(seed);
    const [saved, setSaved]   = useState(seed);
    const [dirty, setDirty]   = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => { const s = seed(); setCfg(s); setSaved(s); setDirty(false); /* eslint-disable-next-line */ }, [settings?.leadScoring]);

    const update = (patch) => { setCfg(prev => ({ ...prev, ...patch })); setDirty(true); };
    const updateFitRules = (rules) => { setCfg(prev => ({ ...prev, fit: { ...prev.fit, rules } })); setDirty(true); };
    const updateEngRules = (rules) => { setCfg(prev => ({ ...prev, engagement: { ...prev.engagement, rules } })); setDirty(true); };
    const setBand = (which, idx, val) => {
        setCfg(prev => {
            const b = JSON.parse(JSON.stringify(prev.buckets));
            b[which][idx] = Number(val) || 0;
            // keep ranges contiguous
            b.cold = [0, Math.max(0, (b.warm[0] - 1))];
            b.hot  = [b.hot[0], 100];
            return { ...prev, buckets: b };
        });
        setDirty(true);
    };

    const handleCancel = () => { const s = JSON.parse(JSON.stringify(saved)); setCfg(s); setDirty(false); };
    const handleReset  = () => { setCfg(JSON.parse(JSON.stringify(DEFAULT_LEAD_SCORING))); setDirty(true); };
    const handleSave   = async () => {
        setSaving(true);
        setSettings(prev => ({ ...prev, leadScoring: cfg }));
        try {
            await dbFetch('/.netlify/functions/settings', { method: 'PUT', body: JSON.stringify({ leadScoring: cfg }) });
            setSaved(JSON.parse(JSON.stringify(cfg)));
        } catch (e) {
            console.error('save lead scoring', e);
        }
        setSaving(false);
        setDirty(false);
    };

    const warmMin = cfg.buckets?.warm?.[0] ?? 41;
    const hotMin  = cfg.buckets?.hot?.[0]  ?? 71;

    return (
        <CategoryDetailChrome
            crumb="Lead scoring" category="Sales process" title="Lead scoring"
            subtitle="Rule-based Fit + Engagement scoring for leads. Scores recompute on lead edits and nightly."
            onBack={onBack} dirty={dirty} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
        >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}>
                {/* Enabled */}
                <CSectionCard title="Scoring" description="Turn lead scoring on or off org-wide. When off, lead scores are left untouched.">
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <input type="checkbox" checked={cfg.enabled !== false} onChange={e => update({ enabled: e.target.checked })} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: T.sans }}>Lead scoring {cfg.enabled !== false ? 'enabled' : 'disabled'}</span>
                    </label>
                </CSectionCard>

                {/* Fit */}
                <CSectionCard title="Fit signals" description="Intrinsic lead quality from lead fields (title seniority, deal size, source). Points sum, then normalize to 0–100.">
                    <RuleTable kind="fit" rules={cfg.fit?.rules || []} onChange={updateFitRules} />
                </CSectionCard>

                {/* Engagement */}
                <CSectionCard title="Engagement signals" description="Progression + recency. Status rules add points for how far a lead has advanced; a recency rule decays over time (half-life). Behavioral events arrive in a later release.">
                    <RuleTable kind="engagement" rules={cfg.engagement?.rules || []} onChange={updateEngRules} />
                </CSectionCard>

                {/* Buckets */}
                <CSectionCard title="Buckets" description="Thresholds applied to the higher of Fit / Engagement.">
                    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5, fontFamily: T.sans }}>Warm starts at</div>
                            <input type="number" value={warmMin} onChange={e => setBand('warm', 0, e.target.value)} style={{ ...inputStyle, width: 90 }} />
                        </div>
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5, fontFamily: T.sans }}>Hot starts at</div>
                            <input type="number" value={hotMin} onChange={e => setBand('hot', 0, e.target.value)} style={{ ...inputStyle, width: 90 }} />
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, fontFamily: T.sans }}>
                            <span style={{ padding: '3px 9px', borderRadius: 999, background: 'rgba(201,192,176,0.25)', color: T.inkMid, fontWeight: 600 }}>Cold 0–{Math.max(0, warmMin - 1)}</span>
                            <span style={{ padding: '3px 9px', borderRadius: 999, background: 'rgba(200,154,107,0.20)', color: T.goldInk, fontWeight: 600 }}>Warm {warmMin}–{Math.max(warmMin, hotMin - 1)}</span>
                            <span style={{ padding: '3px 9px', borderRadius: 999, background: 'rgba(184,90,53,0.18)', color: T.danger, fontWeight: 600 }}>Hot {hotMin}–100</span>
                        </div>
                    </div>
                    <div style={{ marginTop: 16 }}>
                        <button onClick={handleReset} style={{ padding: '6px 12px', background: 'none', color: T.inkMid, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>Reset to defaults</button>
                    </div>
                </CSectionCard>
            </div>
        </CategoryDetailChrome>
    );
};
