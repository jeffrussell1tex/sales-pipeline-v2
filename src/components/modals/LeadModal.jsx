import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useApp } from '../AppContext';
import { dbFetch } from '../utils/storage';

// ── Design tokens ─────────────────────────────────────────────
const T = {
    bg:           '#f0ece4',
    surface:      '#fbf8f3',
    surface2:     '#f5efe3',
    border:       '#e6ddd0',
    borderStrong: '#d4c8b4',
    ink:          '#2a2622',
    inkMid:       '#5a544c',
    inkMuted:     '#8a8378',
    gold:         '#c8b99a',
    goldInk:      '#7a6a48',
    danger:       '#9c3a2e',
    warn:         '#b87333',
    ok:           '#4d6b3d',
    info:         '#3a5a7a',
    sans:         '"Plus Jakarta Sans", system-ui, sans-serif',
    serif:        'Georgia, serif',
    r:            3,
};

const SOURCE_COLORS = {
    'LinkedIn':        '#3a5a7a',
    'Referral':        '#7a5a3c',
    'Trade Show':      '#b87333',
    'Cold Outreach':   '#5a544c',
    'Webinar':         '#4d6b3d',
    'Partner Referral':'#b0a088',
    'Website':         '#9aa89a',
    'Inbound':         '#7a5a3c',
    'Event':           '#b87333',
    'Other':           '#8a8378',
};

// ── Score computation (client-side) ───────────────────────────
function computeScore(form) {
    let score = 0;
    const contributors = [];

    // Title match
    const titleLower = (form.title || '').toLowerCase();
    const seniorTitles = ['vp', 'vice president', 'director', 'chief', 'cto', 'cfo', 'coo', 'ceo', 'head of', 'president'];
    const midTitles    = ['manager', 'lead', 'senior', 'principal'];
    if (seniorTitles.some(t => titleLower.includes(t))) {
        score += 22; contributors.push({ label: 'senior title', delta: 22 });
    } else if (midTitles.some(t => titleLower.includes(t))) {
        score += 12; contributors.push({ label: 'mid title', delta: 12 });
    } else if (form.title) {
        score += 5; contributors.push({ label: 'title provided', delta: 5 });
    }

    // Revenue band
    const rev = parseFloat((form.rev || '').replace(/[^0-9.]/g, '')) || 0;
    if (rev >= 500000)      { score += 28; contributors.push({ label: 'revenue ≥500K', delta: 28 }); }
    else if (rev >= 100000) { score += 20; contributors.push({ label: 'revenue ≥100K', delta: 20 }); }
    else if (rev >= 50000)  { score += 14; contributors.push({ label: 'revenue ≥50K',  delta: 14 }); }
    else if (rev > 0)       { score += 6;  contributors.push({ label: 'revenue provided', delta: 6 }); }

    // Domain quality (email provided + business domain)
    if (form.email && form.email.includes('@')) {
        const domain = form.email.split('@')[1] || '';
        const freeDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com'];
        if (!freeDomains.includes(domain.toLowerCase())) {
            score += 18; contributors.push({ label: 'business domain', delta: 18 });
        } else {
            score += 4; contributors.push({ label: 'email provided', delta: 4 });
        }
    }

    // Source weight
    const sourceWeights = { 'Referral': 12, 'Partner Referral': 10, 'LinkedIn': 8, 'Inbound': 8, 'Webinar': 6, 'Trade Show': 5, 'Website': 4, 'Cold Outreach': 2 };
    if (form.source && sourceWeights[form.source]) {
        const delta = sourceWeights[form.source];
        score += delta; contributors.push({ label: form.source + ' source', delta });
    }

    // Company provided
    if (form.company) { score += 4; contributors.push({ label: 'company provided', delta: 4 }); }

    const clamped = Math.min(100, Math.max(0, score));
    const band = clamped >= 70 ? 'Hot' : clamped >= 40 ? 'Warm' : 'Cool';
    const bandColor = clamped >= 70 ? T.ok : clamped >= 40 ? T.warn : T.danger;
    return { score: clamped, band, bandColor, contributors: contributors.sort((a,b)=>b.delta-a.delta).slice(0,3) };
}

// ── Auto-routing ───────────────────────────────────────────────
function computeRouting(form, repNames, leads) {
    if (!repNames || repNames.length === 0) return null;
    // Count current lead load per rep
    const loads = {};
    repNames.forEach(r => { loads[r] = 0; });
    (leads || []).forEach(l => {
        if (l.assignee && loads[l.assignee] !== undefined) loads[l.assignee]++;
    });
    // Round-robin: pick rep with fewest leads
    const sorted = [...repNames].sort((a,b) => (loads[a]||0) - (loads[b]||0));
    const assignee = sorted[0];
    const rrPos = repNames.indexOf(assignee) + 1;
    return { assignee, load: loads[assignee]||0, rrPos, total: repNames.length, rule: 'Round-robin' };
}

// ── Duplicate detection ────────────────────────────────────────
function findDuplicate(form, leads, contacts) {
    const email = (form.email || '').trim().toLowerCase();
    const nameLower = ((form.firstName||'') + ' ' + (form.lastName||'')).trim().toLowerCase();

    // Check leads
    if (email) {
        const leadMatch = (leads || []).find(l =>
            (l.email||l.raw?.email||'').toLowerCase() === email
        );
        if (leadMatch) return { type: 'lead', record: leadMatch, label: ((leadMatch.first||'') + ' ' + (leadMatch.last||'')).trim() || 'Lead' };
    }

    // Check contacts
    if (email) {
        const contactMatch = (contacts || []).find(c =>
            (c.email||'').toLowerCase() === email
        );
        if (contactMatch) return { type: 'contact', record: contactMatch, label: ((contactMatch.firstName||'') + ' ' + (contactMatch.lastName||'')).trim() || 'Contact', company: contactMatch.company || '' };
    }

    // Name + company match on leads
    if (nameLower.length > 3) {
        const nameMatch = (leads || []).find(l => {
            const ln = ((l.first||'') + ' ' + (l.last||'')).trim().toLowerCase();
            return ln === nameLower;
        });
        if (nameMatch) return { type: 'lead', record: nameMatch, label: nameLower };
    }

    return null;
}

// ── Form atoms ─────────────────────────────────────────────────
const AlmLabel = ({ children, required, hint }) => (
    <label style={{ display: 'block', marginBottom: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.inkMid, letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: T.sans }}>
            {children}{required && <span style={{ color: T.danger, marginLeft: 3 }}>*</span>}
        </span>
        {hint && <span style={{ fontSize: 10.5, color: T.inkMuted, marginLeft: 8, textTransform: 'none', letterSpacing: 0, fontWeight: 400, fontFamily: T.sans }}>{hint}</span>}
    </label>
);

const AlmInput = ({ value, onChange, onBlur, placeholder, mono, error, autoFocus, type='text' }) => (
    <input
        type={type}
        value={value}
        onChange={e => onChange && onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={{
            width: '100%', padding: '8px 10px',
            background: T.surface,
            border: `1px solid ${error ? T.danger : T.borderStrong}`,
            borderRadius: T.r, fontSize: 13,
            color: T.ink, fontFamily: mono ? 'ui-monospace, Menlo, monospace' : T.sans,
            outline: 'none', boxSizing: 'border-box',
            transition: 'border-color 120ms',
        }}
        onFocus={e => e.currentTarget.style.borderColor = T.ink}
        onBlurCapture={e => e.currentTarget.style.borderColor = error ? T.danger : T.borderStrong}
    />
);

const AlmTextarea = ({ value, onChange, placeholder, rows = 3 }) => (
    <textarea
        value={value}
        onChange={e => onChange && onChange(e.target.value)}
        placeholder={placeholder || 'Notes about this lead…'}
        rows={rows}
        style={{
            width: '100%', padding: '8px 10px',
            background: T.surface, border: `1px solid ${T.borderStrong}`,
            borderRadius: T.r, fontSize: 13, color: T.ink,
            fontFamily: T.sans, resize: 'vertical', outline: 'none',
            boxSizing: 'border-box', lineHeight: 1.5,
            transition: 'border-color 120ms',
        }}
        onFocus={e => e.currentTarget.style.borderColor = T.ink}
        onBlur={e => e.currentTarget.style.borderColor = T.borderStrong}
    />
);

const SourceChipSelect = ({ value, onChange, options }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const color = SOURCE_COLORS[value] || T.inkMuted;

    useEffect(() => {
        if (!open) return;
        const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <div onClick={() => setOpen(o => !o)} style={{
                padding: '8px 10px', background: T.surface,
                border: `1px solid ${T.borderStrong}`,
                borderRadius: T.r, fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }}/>
                    <span style={{ color: value ? T.ink : T.inkMuted, fontFamily: T.sans }}>{value || 'Select source…'}</span>
                </span>
                <span style={{ fontSize: 9, color: T.inkMuted }}>▾</span>
            </div>
            {open && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 3, zIndex: 100,
                    background: T.surface, border: `1px solid ${T.borderStrong}`, borderRadius: T.r,
                    boxShadow: '0 8px 24px rgba(42,38,34,0.12)', overflow: 'hidden' }}>
                    {options.map(s => {
                        const sc = SOURCE_COLORS[s] || T.inkMuted;
                        return (
                            <div key={s} onClick={() => { onChange(s); setOpen(false); }}
                                style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontFamily: T.sans, color: T.ink }}
                                onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: sc, flexShrink: 0 }}/>
                                {s}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// ── Smart panel wrapper ────────────────────────────────────────
const SmartPanel = ({ label, children, accent, style: extraStyle }) => (
    <div style={{
        padding: '10px 12px',
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderLeft: `3px solid ${accent || T.gold}`,
        borderRadius: T.r,
        marginBottom: 10,
        ...extraStyle,
    }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, color: T.inkMid, letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 8, fontFamily: T.sans }}>{label}</div>
        {children}
    </div>
);

// ── Score donut ring ───────────────────────────────────────────
const ScoreRing = ({ score, band, bandColor, contributors }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: `conic-gradient(${bandColor} ${score * 3.6}deg, ${T.surface2} 0)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ width: 34, height: 34, borderRadius: '50%', background: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 700, fontSize: 13, color: bandColor }}>
                {score}
            </span>
        </div>
        <div style={{ fontSize: 11.5, color: T.inkMid, lineHeight: 1.55, fontFamily: T.sans }}>
            <span style={{ fontWeight: 700, color: T.ink }}>{band}</span>
            {contributors.length > 0 && (
                <> — {contributors.map((c,i) => (
                    <span key={i}>{c.label} <span style={{ color: T.ok }}>+{c.delta}</span>{i < contributors.length-1 ? ', ' : ''}</span>
                ))}</>
            )}
            {contributors.length === 0 && <span style={{ color: T.inkMuted }}> — fill in fields to compute</span>}
        </div>
    </div>
);

// ── Main modal ─────────────────────────────────────────────────
const BLANK = { firstName:'', lastName:'', company:'', email:'', phone:'', title:'', source:'', rev:'', notes:'' };

export default function LeadModal({ onClose, onSaved, onSavedOpenCockpit }) {
    const { leads, contacts, settings, showConfirm } = useApp();

    const repNames = useMemo(() =>
        (settings?.users || []).filter(u => u.name && u.role !== 'ReadOnly').map(u => u.name).sort()
    , [settings?.users]);

    const leadSources = useMemo(() => {
        const fromSettings = settings?.leadSources;
        if (Array.isArray(fromSettings) && fromSettings.length > 0) return fromSettings;
        return Object.keys(SOURCE_COLORS);
    }, [settings?.leadSources]);

    const [form,    setForm]    = useState(BLANK);
    const [errors,  setErrors]  = useState({});
    const [saving,  setSaving]  = useState(false);
    const [savedCount, setSavedCount] = useState(0);
    const [manualAssignee, setManualAssignee] = useState(null);
    const [showAssigneePicker, setShowAssigneePicker] = useState(false);
    const assigneePickerRef = useRef(null);

    const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

    // ── Live score ──────────────────────────────────────────────
    const scoreResult = useMemo(() => computeScore(form), [form.title, form.rev, form.email, form.source, form.company]);

    // ── Routing ─────────────────────────────────────────────────
    const routing = useMemo(() => computeRouting(form, repNames, leads?.map ? leads.map(l => l) : []), [repNames, leads, form.company]);
    const assignee = manualAssignee || routing?.assignee || null;

    // ── Duplicate detection ─────────────────────────────────────
    const duplicate = useMemo(() => {
        if (!form.email && !form.firstName) return null;
        const normalizedLeads = (leads || []).map(l => ({
            ...l,
            email: l.email || l.raw?.email || '',
            first: l.first || l.firstName || '',
            last:  l.last  || l.lastName  || '',
        }));
        return findDuplicate(form, normalizedLeads, contacts);
    }, [form.email, form.firstName, form.lastName, leads, contacts]);

    // ── Enrichment (empty state — no endpoint wired) ────────────
    const [enriched, setEnriched] = useState(null);
    const enrichTriggered = useRef(false);
    const handleEmailBlur = () => {
        if (form.email && form.email.includes('@') && !enrichTriggered.current) {
            enrichTriggered.current = true;
            // Enrichment endpoint not yet available — show empty state
            setEnriched(null);
        }
    };

    // ── Assignee picker close-on-outside ────────────────────────
    useEffect(() => {
        if (!showAssigneePicker) return;
        const handler = e => { if (assigneePickerRef.current && !assigneePickerRef.current.contains(e.target)) setShowAssigneePicker(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showAssigneePicker]);

    // ── Esc key ─────────────────────────────────────────────────
    useEffect(() => {
        const isDirty = Object.values(form).some(v => v !== '');
        const handler = e => {
            if (e.key !== 'Escape') return;
            if (isDirty) {
                showConfirm('Discard this lead?', onClose);
            } else {
                onClose();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [form, onClose, showConfirm]);

    // ── Validation ───────────────────────────────────────────────
    const validate = () => {
        const e = {};
        if (!form.firstName.trim()) e.firstName = 'Required';
        if (!form.lastName.trim())  e.lastName  = 'Required';
        if (!form.company.trim())   e.company   = 'Required';
        if (!form.email.trim())     e.email     = 'Required';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email';
        if (!form.source)           e.source    = 'Required';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    // ── Save ─────────────────────────────────────────────────────
    const buildPayload = () => {
        const revNum = parseFloat((form.rev || '').replace(/[^0-9.]/g, '')) || 0;
        return {
            id:          'id_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
            firstName:   form.firstName.trim(),
            lastName:    form.lastName.trim(),
            name:        form.firstName.trim() + ' ' + form.lastName.trim(),
            company:     form.company.trim(),
            email:       form.email.trim(),
            phone:       form.phone.trim(),
            title:       form.title.trim(),
            source:      form.source,
            estimatedARR: revNum,
            notes:       form.notes.trim(),
            status:      'New',
            score:       scoreResult.score,
            assignedTo:  assignee || '',
            createdAt:   new Date().toISOString(),
        };
    };

    const doSave = async () => {
        if (!validate()) return null;
        setSaving(true);
        try {
            const payload = buildPayload();
            const res = await dbFetch('/.netlify/functions/leads', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to save lead');
            return data.lead || payload;
        } catch (err) {
            setErrors({ _server: err.message });
            return null;
        } finally {
            setSaving(false);
        }
    };

    const handleSaveAnother = async () => {
        const saved = await doSave();
        if (!saved) return;
        setSavedCount(n => n + 1);
        setForm(BLANK);
        setErrors({});
        setManualAssignee(null);
        enrichTriggered.current = false;
        setEnriched(null);
        if (onSaved) onSaved(saved);
    };

    const handleSaveOpen = async () => {
        const saved = await doSave();
        if (!saved) return;
        if (onSaved) onSaved(saved);
        if (onSavedOpenCockpit) onSavedOpenCockpit(saved.id);
        onClose();
    };

    const handleBackdrop = (e) => {
        if (e.target === e.currentTarget) {
            const isDirty = Object.values(form).some(v => v !== '');
            if (isDirty) showConfirm('Discard this lead?', onClose);
            else onClose();
        }
    };

    return (
        <div onClick={handleBackdrop} style={{ position:'fixed', inset:0, background:'rgba(42,38,34,0.45)', zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:T.sans }}>
            <div style={{ width:820, maxWidth:'95vw', maxHeight:'90vh', background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:4, boxShadow:'0 24px 64px rgba(42,38,34,0.22), 0 4px 12px rgba(42,38,34,0.08)', display:'flex', flexDirection:'column', overflow:'hidden' }}>

                {/* ── Header ── */}
                <div style={{ padding:'14px 20px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
                    <div style={{ width:28, height:28, borderRadius:4, background:'rgba(200,185,154,0.30)', color:T.goldInk, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontFamily:T.serif, fontStyle:'italic', fontWeight:700 }}>L</div>
                    <div style={{ flex:1 }}>
                        <div style={{ fontSize:15, fontWeight:700, color:T.ink, fontFamily:T.sans }}>New lead</div>
                        <div style={{ fontSize:11, color:T.inkMid, fontFamily:T.sans }}>We'll enrich, score, and route as you type.</div>
                    </div>
                    {enriched && (
                        <span style={{ padding:'3px 8px', fontSize:10, fontWeight:700, borderRadius:2, background:'rgba(77,107,61,0.12)', color:T.ok, letterSpacing:0.5, textTransform:'uppercase' }}>✓ Enriched</span>
                    )}
                    <button onClick={onClose} style={{ background:'rgba(0,0,0,0.08)', border:'none', cursor:'pointer', borderRadius:4, width:26, height:26, fontSize:15, display:'flex', alignItems:'center', justifyContent:'center', color:T.ink }}>✕</button>
                </div>

                {/* ── Body: two-pane ── */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', flex:1, minHeight:0, overflow:'hidden' }}>

                    {/* Left — form */}
                    <div style={{ padding:'18px 20px', overflowY:'auto', borderRight:`1px solid ${T.border}` }}>
                        {errors._server && (
                            <div style={{ marginBottom:12, padding:'8px 12px', background:'rgba(156,58,46,0.08)', border:`1px solid ${T.danger}`, borderRadius:T.r, fontSize:12, color:T.danger, fontFamily:T.sans }}>
                                {errors._server}
                            </div>
                        )}

                        {/* Name row */}
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                            <div>
                                <AlmLabel required>First name</AlmLabel>
                                <AlmInput value={form.firstName} onChange={v => set('firstName', v)} error={errors.firstName} autoFocus placeholder="First name" />
                                {errors.firstName && <div style={{ fontSize:10.5, color:T.danger, marginTop:3 }}>{errors.firstName}</div>}
                            </div>
                            <div>
                                <AlmLabel required>Last name</AlmLabel>
                                <AlmInput value={form.lastName} onChange={v => set('lastName', v)} error={errors.lastName} placeholder="Last name"/>
                                {errors.lastName && <div style={{ fontSize:10.5, color:T.danger, marginTop:3 }}>{errors.lastName}</div>}
                            </div>
                        </div>

                        {/* Company */}
                        <div style={{ marginBottom:12 }}>
                            <AlmLabel required hint="we'll enrich industry & employee count">Company</AlmLabel>
                            <AlmInput value={form.company} onChange={v => set('company', v)} error={errors.company} placeholder="Company name"/>
                            {errors.company && <div style={{ fontSize:10.5, color:T.danger, marginTop:3 }}>{errors.company}</div>}
                        </div>

                        {/* Email + Phone */}
                        <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:12, marginBottom:12 }}>
                            <div>
                                <AlmLabel required>Email</AlmLabel>
                                <AlmInput value={form.email} onChange={v => set('email', v)} onBlur={handleEmailBlur} error={errors.email} placeholder="email@company.com" mono/>
                                {errors.email && <div style={{ fontSize:10.5, color:T.danger, marginTop:3 }}>{errors.email}</div>}
                            </div>
                            <div>
                                <AlmLabel>Phone</AlmLabel>
                                <AlmInput value={form.phone} onChange={v => set('phone', v)} placeholder="(555) 000-0000" mono/>
                            </div>
                        </div>

                        {/* Title */}
                        <div style={{ marginBottom:12 }}>
                            <AlmLabel>Title</AlmLabel>
                            <AlmInput value={form.title} onChange={v => set('title', v)} placeholder="VP Operations"/>
                        </div>

                        {/* Source + Revenue */}
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                            <div>
                                <AlmLabel required>Source</AlmLabel>
                                <SourceChipSelect value={form.source} onChange={v => set('source', v)} options={leadSources}/>
                                {errors.source && <div style={{ fontSize:10.5, color:T.danger, marginTop:3 }}>{errors.source}</div>}
                            </div>
                            <div>
                                <AlmLabel>Est. revenue</AlmLabel>
                                <AlmInput value={form.rev} onChange={v => set('rev', v)} placeholder="$0" mono/>
                            </div>
                        </div>

                        {/* Notes */}
                        <div>
                            <AlmLabel>Notes</AlmLabel>
                            <AlmTextarea value={form.notes} onChange={v => set('notes', v)}/>
                        </div>
                    </div>

                    {/* Right — smart panels */}
                    <div style={{ padding:'16px 14px', background:T.surface2, overflowY:'auto', display:'flex', flexDirection:'column', gap:0 }}>

                        {/* Score preview */}
                        <SmartPanel label="Score preview" accent={T.goldInk}>
                            <ScoreRing
                                score={scoreResult.score}
                                band={scoreResult.band}
                                bandColor={scoreResult.bandColor}
                                contributors={scoreResult.contributors}
                            />
                        </SmartPanel>

                        {/* Routing */}
                        <SmartPanel label="Routing" accent={T.gold}>
                            {assignee ? (
                                <>
                                    <div style={{ fontSize:13, color:T.ink, marginBottom:6, fontFamily:T.sans, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                                        <strong>{assignee}</strong>
                                        {!manualAssignee && (
                                            <span style={{ fontSize:9.5, fontWeight:700, padding:'1px 6px', background:'rgba(58,90,122,0.12)', color:T.info, borderRadius:8, textTransform:'uppercase', letterSpacing:0.4 }}>Auto</span>
                                        )}
                                        {manualAssignee && (
                                            <span style={{ fontSize:9.5, fontWeight:700, padding:'1px 6px', background:'rgba(122,90,60,0.12)', color:T.goldInk, borderRadius:8, textTransform:'uppercase', letterSpacing:0.4 }}>Manual</span>
                                        )}
                                    </div>
                                    {routing && !manualAssignee && (
                                        <div style={{ fontSize:11, color:T.inkMid, lineHeight:1.5, fontFamily:T.sans }}>
                                            {routing.rule} · position {routing.rrPos}/{routing.total} · {routing.load} active lead{routing.load !== 1 ? 's' : ''}
                                        </div>
                                    )}
                                    <div ref={assigneePickerRef} style={{ position:'relative', marginTop:8 }}>
                                        <div onClick={() => setShowAssigneePicker(o => !o)} style={{ fontSize:11, color:T.goldInk, cursor:'pointer', fontWeight:600, fontFamily:T.sans }}>
                                            Reassign manually →
                                        </div>
                                        {showAssigneePicker && (
                                            <div style={{ position:'absolute', top:'100%', left:0, right:0, marginTop:4, zIndex:100, background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, boxShadow:'0 8px 24px rgba(42,38,34,0.12)', overflow:'hidden' }}>
                                                {repNames.map(r => (
                                                    <div key={r} onClick={() => { setManualAssignee(r); setShowAssigneePicker(false); }}
                                                        style={{ padding:'7px 10px', fontSize:12, color:T.ink, cursor:'pointer', fontFamily:T.sans, fontWeight: r === assignee ? 700 : 400 }}
                                                        onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                        {r}
                                                    </div>
                                                ))}
                                                {manualAssignee && (
                                                    <div onClick={() => { setManualAssignee(null); setShowAssigneePicker(false); }}
                                                        style={{ padding:'7px 10px', fontSize:11, color:T.inkMuted, cursor:'pointer', fontFamily:T.sans, borderTop:`1px solid ${T.border}` }}
                                                        onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                        ↺ Reset to auto-routing
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans, lineHeight:1.5 }}>
                                    No reps configured. Add team members in Settings → People & Teams.
                                </div>
                            )}
                        </SmartPanel>

                        {/* Enrichment */}
                        <SmartPanel label="Enrichment" accent={T.ok}>
                            {enriched ? (
                                <div style={{ fontSize:11.5, color:T.inkMid, lineHeight:1.6, fontFamily:T.sans }}>
                                    <div><strong style={{ color:T.ink }}>{enriched.company}</strong></div>
                                    {enriched.industry && <div>{enriched.industry}{enriched.employees ? ` · ${enriched.employees} employees` : ''}</div>}
                                    {(enriched.city || enriched.foundedYear) && <div>{[enriched.city, enriched.foundedYear && `founded ${enriched.foundedYear}`].filter(Boolean).join(' · ')}</div>}
                                    {enriched.sourceUrl && <div style={{ marginTop:6, fontSize:10.5, color:T.inkMuted }}>Auto-filled from <strong>{enriched.sourceUrl}</strong></div>}
                                </div>
                            ) : (
                                <div style={{ fontSize:11, color:T.inkMuted, lineHeight:1.5, fontFamily:T.sans }}>
                                    {form.email && form.email.includes('@')
                                        ? 'No enrichment data found for this domain.'
                                        : 'Enter a business email to trigger enrichment.'
                                    }
                                    <div style={{ marginTop:6 }}>
                                        <span style={{ color:T.info, fontWeight:600, cursor:'pointer' }}>
                                            Enable enrichment in Settings →
                                        </span>
                                    </div>
                                </div>
                            )}
                        </SmartPanel>

                        {/* Possible duplicate */}
                        {duplicate && (
                            <SmartPanel label="Possible duplicate" accent={T.warn}>
                                <div style={{ fontSize:11.5, color:T.inkMid, lineHeight:1.55, fontFamily:T.sans }}>
                                    <strong style={{ color:T.ink }}>{duplicate.label}</strong>
                                    {duplicate.company && <> at <strong>{duplicate.company}</strong></>}
                                    {' '}exists as a {duplicate.type}.
                                </div>
                                <div style={{ marginTop:8, display:'flex', gap:6 }}>
                                    <button style={{ padding:'4px 10px', fontSize:10.5, fontWeight:600, background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:12, cursor:'pointer', color:T.ink, fontFamily:T.sans }}>
                                        View {duplicate.type}
                                    </button>
                                </div>
                            </SmartPanel>
                        )}
                    </div>
                </div>

                {/* ── Footer ── */}
                <div style={{ padding:'12px 20px', borderTop:`1px solid ${T.border}`, background:T.surface2, display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
                    <span style={{ fontSize:11, color:T.inkMid, cursor:'pointer', fontWeight:600, fontFamily:T.sans }}>+ Add custom field</span>
                    {savedCount > 0 && (
                        <span style={{ fontSize:11, color:T.ok, fontWeight:600, fontFamily:T.sans }}>✓ {savedCount} lead{savedCount > 1 ? 's' : ''} added</span>
                    )}
                    <div style={{ flex:1 }}/>
                    <button onClick={onClose} style={{ padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                    <button onClick={handleSaveAnother} disabled={saving} style={{ padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:saving?'wait':'pointer', fontFamily:T.sans, opacity:saving?0.6:1 }}>
                        Save &amp; add another
                    </button>
                    <button onClick={handleSaveOpen} disabled={saving} style={{ padding:'7px 16px', background:saving?T.borderStrong:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:700, cursor:saving?'wait':'pointer', fontFamily:T.sans, opacity:saving?0.7:1 }}>
                        {saving ? 'Saving…' : 'Save & open in Cockpit'}
                    </button>
                </div>
            </div>
        </div>
    );
}
