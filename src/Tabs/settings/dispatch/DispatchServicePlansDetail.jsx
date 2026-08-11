// settings/dispatch/DispatchServicePlansDetail.jsx
//
// Service plans are DB records in dispatch_service_plans, not a settings blob:
// they are referenced by FK from dispatch_customers.service_plan_id, and an FK
// pointing into a JSON blob has no integrity at all.
//
// A plan answers WHAT is covered, HOW OFTEN, and ON WHAT TERMS. It deliberately
// carries no crew size, duration, skills or licence — that is a job template's
// job, referenced here by visitTemplateId, so staffing rules live in one place.
//
// Per-record saves, no "Save changes" button: a whole-object PUT would clobber a
// concurrent edit, and these rows are referenced live by customers.
import React, { useState, useEffect, useCallback } from 'react';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { CSectionCard } from '../shared/form.jsx';
import { SPTable } from '../salesProcess/shared.jsx';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';

const CADENCES = [
    { id: 'monthly',    label: 'Monthly',       days: 30,  visits: 12 },
    { id: 'quarterly',  label: 'Quarterly',     days: 91,  visits: 4 },
    { id: 'semiannual', label: 'Twice a year',  days: 182, visits: 2 },
    { id: 'annual',     label: 'Annual',        days: 365, visits: 1 },
    { id: 'custom',     label: 'Custom',        days: null, visits: null },
];

const BILLING = ['monthly', 'quarterly', 'annual', 'per_visit'];

const labelise = (v) => String(v || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const cadenceLabel = (id) => (CADENCES.find(c => c.id === id) || {}).label || labelise(id);

// Same trap as the job-template numeric fields: coercing inside onChange rewrites
// the input before the next keystroke lands, so it can never be cleared.
const commitNumber = (raw, { min, max, fallback = null, integer = false }) => {
    if (raw === '' || raw == null) return fallback;
    const n = integer ? parseInt(raw, 10) : parseFloat(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
};

const inputSt = {
    width: '100%', padding: '7px 10px', border: `1px solid ${T.borderStrong}`,
    borderRadius: T.r, fontSize: 13, fontFamily: T.sans, outline: 'none',
    boxSizing: 'border-box', background: T.surface,
};

const btnPrimary = {
    padding: '7px 14px', background: T.ink, color: '#fbf8f3', border: 'none',
    borderRadius: T.r, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans,
};

const btnGhost = {
    padding: '7px 14px', background: T.surface, border: `1px solid ${T.borderStrong}`,
    borderRadius: T.r, fontSize: 12.5, fontWeight: 600, color: T.inkMid, cursor: 'pointer', fontFamily: T.sans,
};

// Module scope: a component declared inside the panel would be a new type on every
// render, remounting these inputs and losing focus per keystroke.
const Field = ({ label, hint, children, span }) => (
    <div style={span ? { gridColumn: '1 / -1' } : undefined}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase',
            letterSpacing: 0.6, marginBottom: 5, fontFamily: T.sans }}>{label}</div>
        {children}
        {hint && <div style={{ fontSize: 10.5, color: T.inkMuted, marginTop: 4, fontFamily: T.sans }}>{hint}</div>}
    </div>
);

const PlanForm = ({ draft, set, templates, jobTypes, holders, busy, error, onSave, onDelete, onCancel }) => {
    const cad = CADENCES.find(c => c.id === (draft.cadence || 'annual')) || CADENCES[3];
    const tmplMissing = !!draft.visitTemplateId && !templates.some(t => t.id === draft.visitTemplateId);
    const intervalNum = parseInt(draft.intervalDays, 10);
    const customVisits = (draft.cadence === 'custom' && Number.isFinite(intervalNum) && intervalNum > 0)
        ? Math.max(1, Math.round(365 / intervalNum)) : null;
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Plan name *">
                <input value={draft.name || ''} onChange={e => set('name', e.target.value)}
                    placeholder="e.g. Gold PM — Quarterly" style={inputSt}/>
            </Field>
            <Field label="Status">
                <select value={draft.active === false ? 'inactive' : 'active'}
                    onChange={e => set('active', e.target.value === 'active')} style={inputSt}>
                    <option value="active">Active — can be assigned</option>
                    <option value="inactive">Inactive — existing customers keep it</option>
                </select>
            </Field>

            <Field label="Visit cadence" hint={cad.days ? `${cad.days} days between visits` : 'Set the interval below'}>
                <select value={draft.cadence || 'annual'} onChange={e => set('cadence', e.target.value)} style={inputSt}>
                    {CADENCES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
            </Field>
            {/* Exactly one of these is editable. Interval and visit count must never
                contradict each other — a plan reading "quarterly, 6 visits a year"
                would schedule 4 and promise 6 — so the server derives one from the
                other and ignores any supplied visit count. Showing the derived value
                read-only keeps the form honest about which field actually decides. */}
            <Field label={draft.cadence === 'custom' ? 'Interval (days) *' : 'Visits per year'}
                hint={draft.cadence === 'custom'
                    ? `Drives when the next visit falls due${customVisits ? ` — about ${customVisits} visits a year` : ''}`
                    : 'Derived from the cadence'}>
                {draft.cadence === 'custom' ? (
                    <input type="number" min={1} max={3650} value={draft.intervalDays ?? ''}
                        onChange={e => set('intervalDays', e.target.value)}
                        onBlur={e => set('intervalDays', commitNumber(e.target.value, { min: 1, max: 3650, integer: true }))}
                        style={inputSt}/>
                ) : (
                    <div style={{ ...inputSt, background: T.bg, color: T.inkMid, display: 'flex', alignItems: 'center' }}>
                        {cad.visits ?? '—'}
                    </div>
                )}
            </Field>

            <Field label="Visit job template" span
                hint="How a scheduled visit gets staffed — crew size, duration, skills, licence, equipment. Defined under Job templates.">
                <select value={draft.visitTemplateId || ''} onChange={e => set('visitTemplateId', e.target.value || null)} style={inputSt}>
                    <option value="">— No template (visits created bare) —</option>
                    {/* A template that has since been deleted must not fall through to
                        "no template": that silently drops the staffing rule on save. */}
                    {tmplMissing && <option value={draft.visitTemplateId}>Deleted template ({draft.visitTemplateId})</option>}
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name || t.ctype || 'Untitled template'}</option>)}
                </select>
            </Field>

            <Field label="Covered job types" span
                hint="Work of these types is covered by the plan. Anything else bills at the discount below.">
                {jobTypes.length === 0 ? (
                    <div style={{ fontSize: 12, color: T.inkMuted, fontStyle: 'italic', fontFamily: T.sans }}>
                        No job types configured. Add them under Job categories &amp; types.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {jobTypes.map(jt => {
                            const on = (draft.coveredJobTypes || []).includes(jt.id);
                            return (
                                <span key={jt.id}
                                    onClick={() => set('coveredJobTypes', on
                                        ? (draft.coveredJobTypes || []).filter(x => x !== jt.id)
                                        : [...(draft.coveredJobTypes || []), jt.id])}
                                    style={{ fontSize: 11, padding: '3px 9px', borderRadius: 8, cursor: 'pointer',
                                        background: on ? `${T.info}20` : T.surface2,
                                        border: `1px solid ${on ? T.info : T.border}`,
                                        color: on ? T.info : T.inkMuted, fontWeight: on ? 700 : 400, fontFamily: T.sans }}>
                                    {jt.name}
                                </span>
                            );
                        })}
                    </div>
                )}
            </Field>

            <Field label="Included hours / year">
                <input type="number" min={0} max={9999} step="0.5" value={draft.includedHours ?? ''}
                    onChange={e => set('includedHours', e.target.value)}
                    onBlur={e => set('includedHours', commitNumber(e.target.value, { min: 0, max: 9999 }))}
                    style={inputSt}/>
            </Field>
            <Field label="Response SLA (hours)" hint="Target time to respond to a call under this plan.">
                <input type="number" min={1} max={720} value={draft.responseHours ?? ''}
                    onChange={e => set('responseHours', e.target.value)}
                    onBlur={e => set('responseHours', commitNumber(e.target.value, { min: 1, max: 720, integer: true }))}
                    style={inputSt}/>
            </Field>

            <Field label="Price">
                <input type="number" min={0} step="0.01" value={draft.price ?? ''}
                    onChange={e => set('price', e.target.value)}
                    onBlur={e => set('price', commitNumber(e.target.value, { min: 0, max: 10000000 }))}
                    style={inputSt}/>
            </Field>
            <Field label="Billed">
                <select value={draft.billingPeriod || 'annual'} onChange={e => set('billingPeriod', e.target.value)} style={inputSt}>
                    {BILLING.map(b => <option key={b} value={b}>{labelise(b)}</option>)}
                </select>
            </Field>

            <Field label="Discount on uncovered work (%)">
                <input type="number" min={0} max={100} step="0.5" value={draft.discountPercent ?? ''}
                    onChange={e => set('discountPercent', e.target.value)}
                    onBlur={e => set('discountPercent', commitNumber(e.target.value, { min: 0, max: 100 }))}
                    style={inputSt}/>
            </Field>
            <Field label="Customers on this plan">
                <div style={{ ...inputSt, background: T.bg, color: T.inkMid, display: 'flex', alignItems: 'center' }}>
                    {draft._isNew ? '—' : `${holders} customer${holders === 1 ? '' : 's'}`}
                </div>
            </Field>

            <Field label="Description" span>
                <textarea value={draft.description || ''} onChange={e => set('description', e.target.value)} rows={2}
                    style={{ ...inputSt, resize: 'vertical' }}/>
            </Field>

            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={onSave} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>
                    {busy ? 'Saving…' : (draft._isNew ? 'Create plan' : 'Save plan')}
                </button>
                <button onClick={onCancel} style={btnGhost}>Cancel</button>
                {!draft._isNew && (
                    <button onClick={onDelete} style={{ ...btnGhost, color: T.danger, marginLeft: 'auto' }}>Delete</button>
                )}
                {error && <span style={{ fontSize: 12, fontWeight: 600, color: T.danger, fontFamily: T.sans }}>{error}</span>}
            </div>
        </div>
    );
};

export const DispatchServicePlansDetail = ({ settings, onBack, setSettingsDirty }) => {
    const [plans,     setPlans]     = useState([]);
    const [customers, setCustomers] = useState([]);
    const [loading,   setLoading]   = useState(true);
    const [loadError, setLoadError] = useState('');
    const [draft,     setDraft]     = useState(null);
    const [busy,      setBusy]      = useState(false);
    const [error,     setError]     = useState('');

    const [seeding, setSeeding] = useState(false);
    const [seedMsg, setSeedMsg] = useState('');

    const templates = settings?.dispatchJobTemplates || [];
    const jobTypes  = (settings?.dispatchJobTypes || []).filter(t => t && t.id);

    const load = useCallback(async () => {
        setLoading(true); setLoadError('');
        try {
            const [pRes, cRes] = await Promise.all([
                dbFetch('/.netlify/functions/dispatch-service-plans'),
                dbFetch('/.netlify/functions/dispatch-customers'),
            ]);
            // dbFetch returns a Response and does not throw on 4xx/5xx. Reading
            // `.plans` off an error body falls through `|| []` and renders as
            // "no plans yet" — a failure indistinguishable from empty.
            const bad = [['plans', pRes], ['customers', cRes]].filter(([, r]) => !r.ok);
            if (bad.length) throw new Error('Failed to load ' + bad.map(([n, r]) => `${n} (${r.status})`).join(', '));
            const [pJson, cJson] = await Promise.all([pRes.json(), cRes.json()]);
            setPlans(pJson.plans || []);
            setCustomers(cJson.customers || []);
        } catch (err) {
            setLoadError(err.message || 'Failed to load service plans.');
        }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    // Per-record saves, so there is no unsaved-changes state. Clear the shared flag
    // rather than inheriting a stale `true` from a previously open panel.
    useEffect(() => {
        if (setSettingsDirty) setSettingsDirty(false);
        return () => { if (setSettingsDirty) setSettingsDirty(false); };
    }, [setSettingsDirty]);

    const holdersOf = (planId) => customers.filter(c => c.servicePlanId === planId).length;

    // Customers still carrying only the legacy `serviceAgreement` string.
    const legacyTiers = [...new Set(customers
        .filter(c => !c.servicePlanId && c.serviceAgreement && c.serviceAgreement !== 'none')
        .map(c => String(c.serviceAgreement).trim()))].sort();

    const save = async () => {
        if (!draft) return;
        if (!(draft.name || '').trim()) { setError('Plan name is required.'); return; }
        if (draft.cadence === 'custom' && !draft.intervalDays) { setError('A custom cadence needs an interval in days.'); return; }
        setBusy(true); setError('');
        try {
            const body = { ...draft, name: draft.name.trim() };
            delete body._isNew;
            const url = draft._isNew
                ? '/.netlify/functions/dispatch-service-plans'
                : '/.netlify/functions/dispatch-service-plans?id=' + encodeURIComponent(draft.id);
            const res = await dbFetch(url, {
                method: draft._isNew ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(res.status === 403 ? 'Your role cannot change service plans.' : (data.error || 'HTTP ' + res.status));
            await load();
            setDraft(null);
        } catch (err) { setError(err.message); }
        setBusy(false);
    };

    const remove = async () => {
        if (!draft || draft._isNew) return;
        setBusy(true); setError('');
        try {
            const res = await dbFetch('/.netlify/functions/dispatch-service-plans?id=' + encodeURIComponent(draft.id), { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            // 409 carries the real reason (customers still on the plan) — surfacing
            // "HTTP 409" instead would hide the one thing the admin needs to know.
            if (!res.ok) throw new Error(data.error || (res.status === 403 ? 'Your role cannot delete service plans.' : 'HTTP ' + res.status));
            await load();
            setDraft(null);
        } catch (err) { setError(err.message); }
        setBusy(false);
    };

    // Creates one plan per legacy tier found on customers. Ids derive from the tier
    // name and the POST upserts on id, so re-running cannot duplicate. It does NOT
    // assign customers — that stays a deliberate per-customer choice.
    const seedFromLegacy = async () => {
        setSeeding(true); setSeedMsg('');
        let ok = 0; const failed = [];
        for (const tier of legacyTiers) {
            const row = {
                id:      'plan_legacy_' + tier.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
                name:    labelise(tier),
                cadence: 'annual',
                description: `Created from the legacy "${tier}" service agreement. Review the cadence and terms.`,
                active:  true,
            };
            try {
                const res = await dbFetch('/.netlify/functions/dispatch-service-plans', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row) });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                ok++;
            } catch (err) { failed.push(`${tier}: ${err.message}`); }
        }
        await load();
        setSeedMsg(failed.length
            ? `Created ${ok}. ${failed.length} failed — ${failed.join('; ')}`
            : `Created ${ok} plan${ok === 1 ? '' : 's'}. Assign customers to them from Dispatch → Customers.`);
        setSeeding(false);
    };

    return (
        <CategoryDetailChrome error={loadError} crumb="Service plans" category="Dispatch" title="Service plans"
            subtitle="Maintenance and service agreements — what is covered, how often visits fall due, and on what terms. Customers are assigned a plan from Dispatch → Customers."
            onBack={onBack}
            rightActions={<button onClick={load} disabled={loading} style={btnGhost}>{loading ? 'Loading…' : 'Refresh'}</button>}>

            {legacyTiers.length > 0 && (
                <CSectionCard title="Legacy service agreements"
                    desc="Before plans existed, coverage was a text label on the customer. These labels are still in use and are not attached to any plan.">
                    <div style={{ fontSize: 12.5, fontFamily: T.sans, color: T.inkMid, lineHeight: 1.6 }}>
                        Found on customers: <strong style={{ color: T.ink }}>{legacyTiers.map(labelise).join(', ')}</strong>.
                        Creating a plan per label gives you somewhere to assign them; the labels themselves are left alone,
                        and re-running this cannot create duplicates. Customers are <strong style={{ color: T.ink }}>not</strong> reassigned
                        automatically — that stays a per-customer decision.
                    </div>
                    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button onClick={seedFromLegacy} disabled={seeding} style={{ ...btnPrimary, opacity: seeding ? 0.6 : 1 }}>
                            {seeding ? 'Creating…' : `Create ${legacyTiers.length} plan${legacyTiers.length === 1 ? '' : 's'}`}
                        </button>
                        {seedMsg && <span style={{ fontSize: 12, fontFamily: T.sans, color: T.inkMid }}>{seedMsg}</span>}
                    </div>
                </CSectionCard>
            )}

            <CSectionCard title="Plans" desc="A plan defines coverage and cadence. Staffing comes from the linked job template.">
                <SPTable columns={[
                    { key: 'name',    label: 'Plan',      w: '1.6fr' },
                    { key: 'cadence', label: 'Cadence',   w: '120px' },
                    { key: 'visits',  label: 'Visits/yr', w: '90px' },
                    { key: 'tmpl',    label: 'Visit template', w: '1.2fr' },
                    { key: 'price',   label: 'Price',     w: '110px' },
                    { key: 'holders', label: 'Customers', w: '100px' },
                    { key: 'status',  label: 'Status',    w: '90px' },
                ]} rows={plans.map(p => ({
                    name:    <span style={{ fontWeight: 600, color: T.info, cursor: 'pointer', textDecoration: 'underline',
                                 textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}
                                 onClick={() => { setDraft({ ...p }); setError(''); }}>{p.name}</span>,
                    cadence: <span style={{ fontSize: 12, color: T.inkMid }}>{cadenceLabel(p.cadence)}</span>,
                    visits:  <span style={{ fontSize: 12, color: T.inkMuted, fontFamily: 'ui-monospace,Menlo,monospace' }}>{p.visitsPerYear ?? '—'}</span>,
                    tmpl:    <span style={{ fontSize: 12, color: T.inkMid }}>
                                 {p.visitTemplateId
                                     ? (templates.find(t => t.id === p.visitTemplateId)?.name || 'Deleted template')
                                     : '—'}
                             </span>,
                    price:   <span style={{ fontSize: 12, color: T.inkMid, fontFamily: 'ui-monospace,Menlo,monospace' }}>
                                 {p.price != null ? `${p.price} / ${labelise(p.billingPeriod || 'annual')}` : '—'}
                             </span>,
                    holders: <span style={{ fontSize: 12, color: T.inkMuted, fontFamily: 'ui-monospace,Menlo,monospace' }}>{holdersOf(p.id)}</span>,
                    status:  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, fontWeight: 600,
                                 background: p.active === false ? `${T.inkMuted}14` : `${T.ok}14`,
                                 color: p.active === false ? T.inkMuted : T.ok }}>{p.active === false ? 'Inactive' : 'Active'}</span>,
                }))}/>
                {plans.length === 0 && !loading && (
                    <div style={{ padding: '14px 2px', fontSize: 12.5, color: T.inkMuted, fontStyle: 'italic', fontFamily: T.sans }}>
                        No service plans yet.
                    </div>
                )}

                {draft ? (
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 12, fontFamily: T.sans }}>
                            {draft._isNew ? 'New service plan' : draft.name}
                        </div>
                        <PlanForm draft={draft} templates={templates} jobTypes={jobTypes}
                            holders={draft._isNew ? 0 : holdersOf(draft.id)} busy={busy} error={error}
                            set={(k, v) => setDraft(d => ({ ...d, [k]: v }))}
                            onSave={save} onDelete={remove}
                            onCancel={() => { setDraft(null); setError(''); }}/>
                    </div>
                ) : (
                    <button onClick={() => { setDraft({ id: 'plan_' + crypto.randomUUID(), _isNew: true, name: '', cadence: 'annual', active: true, coveredJobTypes: [] }); setError(''); }}
                        style={{ ...btnGhost, marginTop: 12, color: T.ink }}>+ New plan</button>
                )}
            </CSectionCard>
        </CategoryDetailChrome>
    );
};

export default DispatchServicePlansDetail;
