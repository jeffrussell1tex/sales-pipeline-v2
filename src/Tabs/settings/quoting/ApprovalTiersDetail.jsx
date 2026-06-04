// settings/quoting/ApprovalTiersDetail.jsx
import React, { useState, useEffect } from 'react';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { CSectionCard } from '../shared/form.jsx';
import { SPDrag } from '../salesProcess/shared.jsx';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';
import { QPill, ATToggle } from './shared.jsx';

const DEFAULT_APPROVAL_TIERS = [
    { id:'rep',  label:'Rep',          color:'#4d6b3d', maxDiscount:0.10, approver:null,            sla:null, fallback:null,       active:true },
    { id:'mgr',  label:'Mgr approval', color:'#b87333', maxDiscount:0.20, approver:'Sales Manager', sla:'8h', fallback:'VP Sales',  active:true },
    { id:'vp',   label:'VP approval',  color:'#9c3a2e', maxDiscount:0.30, approver:'VP Sales',      sla:'24h',fallback:'CFO',       active:true },
    { id:'cfo',  label:'CFO approval', color:'#6b2a22', maxDiscount:1.00, approver:'CFO',           sla:'48h',fallback:'CEO',       active:true },
];

const APPROVAL_TIER_USAGE = [
    { tier:'Rep',          tone:'rep', quotes:312, approved:312, declined:0,  pending:0,  avgHours:0  },
    { tier:'Mgr approval', tone:'mgr', quotes:88,  approved:76,  declined:12, pending:4,  avgHours:6  },
    { tier:'VP approval',  tone:'vp',  quotes:24,  approved:20,  declined:4,  pending:2,  avgHours:18 },
    { tier:'CFO approval', tone:'cfo', quotes:6,   approved:5,   declined:1,  pending:1,  avgHours:36 },
];

const DEFAULT_TRIGGERS = [
    { k:'Average discount %',    on:true,  hint:'Calculated across all line items.' },
    { k:'Single-line discount',  on:false, hint:'Trigger if any one line exceeds the threshold.' },
    { k:'Contract term > 36 mo', on:true,  hint:'Long terms route to VP regardless of discount.' },
    { k:'Custom pricing used',   on:true,  hint:'Any line with non-list price triggers Mgr at minimum.' },
    { k:'Deal value > $250K',    on:false, hint:'Big deals always route to VP.' },
    { k:'Non-standard terms',    on:true,  hint:'Custom legal/payment terms route to CFO.' },
];

const NumStep = ({ value, onChange, suffix='', min=0, max=100 }) => (
    <div style={{ display:'inline-flex', alignItems:'center', border:`1px solid ${T.border}`, borderRadius:T.r, background:T.surface, overflow:'hidden' }}>
        <button onClick={() => onChange && onChange(Math.max(min, value-1))} style={{ padding:'4px 8px', background:'none', border:'none', color:T.inkMuted, fontSize:14, cursor:'pointer', lineHeight:1 }}>−</button>
        <span style={{ borderLeft:`1px solid ${T.border}`, borderRight:`1px solid ${T.border}`, padding:'4px 10px', minWidth:56, textAlign:'center', fontFamily:'ui-monospace,Menlo,monospace', fontSize:13, color:T.ink }}>{value}{suffix}</span>
        <button onClick={() => onChange && onChange(Math.min(max, value+1))} style={{ padding:'4px 8px', background:'none', border:'none', color:T.inkMuted, fontSize:14, cursor:'pointer', lineHeight:1 }}>+</button>
    </div>
);

export const ApprovalTiersDetail = ({ settings, setSettings, onBack }) => {
    const saved = {
        tiers:    settings?.approvalTiers    || DEFAULT_APPROVAL_TIERS,
        triggers: settings?.approvalTriggers || DEFAULT_TRIGGERS,
    };
    const [tiers,    setTiers]    = useState(() => JSON.parse(JSON.stringify(saved.tiers)));
    const [triggers, setTriggers] = useState(() => JSON.parse(JSON.stringify(saved.triggers)));
    const [dirty,    setDirty]    = useState(false);
    const [saving,   setSaving]   = useState(false);

    // Try a deal simulator
    const [trialDiscount, setTrialDiscount] = useState(18);
    const [trialValue,    setTrialValue]    = useState(84500);
    const [trialTerm,     setTrialTerm]     = useState('24 months');

    const matchedTier = (() => {
        for (const tier of tiers) {
            const lo = tiers[tiers.indexOf(tier) - 1]?.maxDiscount ?? 0;
            if ((trialDiscount / 100) <= tier.maxDiscount) return tier;
        }
        return tiers[tiers.length - 1];
    })();

    const handleCancel = () => { setTiers(JSON.parse(JSON.stringify(saved.tiers))); setTriggers(JSON.parse(JSON.stringify(saved.triggers))); setDirty(false); };
    const handleSave   = async () => {
        setSaving(true);
        setSettings(prev => ({ ...prev, approvalTiers: tiers, approvalTriggers: triggers }));
        try { await dbFetch('/.netlify/functions/settings', { method:'PUT', body:JSON.stringify({ approvalTiers: tiers, approvalTriggers: triggers }) }); }
        catch(e) { console.error('save approval tiers', e); }
        setSaving(false); setDirty(false);
    };

    const toggleTrigger = (i) => { setTriggers(prev => prev.map((t,ti) => ti===i ? { ...t, on:!t.on } : t)); setDirty(true); };
    const addTier = () => {
        setTiers(prev => [...prev, { id: 'tier_' + crypto.randomUUID(), label: 'New tier', color: '#8a8378', maxDiscount: 1.00, approver: '', sla: '24h', fallback: '', active: true }]);
        setDirty(true);
    };
    const deleteTier = (i) => {
        setTiers(prev => prev.filter((_, idx) => idx !== i));
        setOpenTierMenu(null);
        setDirty(true);
    };
    const toneForIdx = (i) => ['rep','mgr','vp','cfo'][i] || 'neutral';

    // ── Live approval stats ──────────────────────────────────
    const [approvalStats, setApprovalStats] = useState(null);
    const [statsLoading, setStatsLoading]   = useState(false);

    React.useEffect(() => {
        let cancelled = false;
        const fetchStats = async () => {
            setStatsLoading(true);
            try {
                const res = await dbFetch('/.netlify/functions/quotes?approvalStats=true');
                const data = await res.json();
                if (!cancelled && data.approvalStats) setApprovalStats(data.approvalStats);
            } catch(e) { console.error('fetch approval stats', e); }
            if (!cancelled) setStatsLoading(false);
        };
        fetchStats();
        return () => { cancelled = true; };
    }, []);

    // ── Tier kebab state ─────────────────────────────────────
    const [openTierMenu,    setOpenTierMenu]    = useState(null);  // tier index
    const [editingField,    setEditingField]    = useState(null);  // { idx, field } for inline edit
    const [editingVal,      setEditingVal]      = useState('');

    // Close on click-outside
    React.useEffect(() => {
        if (openTierMenu === null) return;
        const h = () => setOpenTierMenu(null);
        document.addEventListener('click', h);
        return () => document.removeEventListener('click', h);
    }, [openTierMenu]);

    // ── Tier kebab handlers ───────────────────────────────────
    const handleDuplicateTier = (i) => {
        const clone = { ...tiers[i], id: tiers[i].id + '_copy', label: tiers[i].label + ' (copy)' };
        setTiers(prev => { const n = [...prev]; n.splice(i+1, 0, clone); return n; });
        setDirty(true); setOpenTierMenu(null);
    };
    const handleInsertTierAbove = (i) => {
        const prev_max = i===0 ? 0 : tiers[i-1].maxDiscount;
        const blank = { id:`tier_${Date.now()}`, label:'New tier', color:'#7a6a48', maxDiscount: parseFloat(((prev_max + tiers[i].maxDiscount)/2).toFixed(2)), approver:'', sla:'', fallback:'', active:true };
        setTiers(prev => { const n=[...prev]; n.splice(i,0,blank); return n; });
        setDirty(true); setOpenTierMenu(null);
    };
    const handleInsertTierBelow = (i) => {
        const this_max = tiers[i].maxDiscount;
        const next_max = tiers[i+1]?.maxDiscount ?? 1.0;
        const blank = { id:`tier_${Date.now()}`, label:'New tier', color:'#7a6a48', maxDiscount: parseFloat(((this_max + next_max)/2).toFixed(2)), approver:'', sla:'', fallback:'', active:true };
        setTiers(prev => { const n=[...prev]; n.splice(i+1,0,blank); return n; });
        setDirty(true); setOpenTierMenu(null);
    };
    const handleNewTierFromThis = (i) => {
        const t = tiers[i];
        const clone = { ...t, id:`tier_${Date.now()}`, label: t.label + ' (new)', maxDiscount: Math.min(1, parseFloat((t.maxDiscount + 0.1).toFixed(2))) };
        setTiers(prev => [...prev, clone]);
        setDirty(true); setOpenTierMenu(null);
    };
    const commitFieldEdit = (i, field, val) => {
        setTiers(prev => prev.map((t,ti) => {
            if (ti !== i) return t;
            if (field === 'maxDiscount') {
                const n = parseFloat(val) / 100;
                return isNaN(n) ? t : { ...t, maxDiscount: Math.max(0.01, Math.min(1, n)) };
            }
            return { ...t, [field]: val };
        }));
        setDirty(true); setEditingField(null); setEditingVal('');
    };
    const startEdit = (i, field, currentVal) => {
        setEditingField({ idx:i, field }); setEditingVal(currentVal); setOpenTierMenu(null);
    };

    return (
        <CategoryDetailChrome
            crumb="Approval tiers" category="Quoting" title="Approval tiers"
            subtitle="Discount thresholds that trigger manager or VP approval"
            statusDetail={`${tiers.length} tiers · advanced rules off`}
            updatedBy="Admin" updatedAt="2 months ago"
            onBack={onBack} dirty={dirty} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
        >
            <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:20 }}>
                {/* ── LEFT COLUMN ─────────────────────────────────── */}
                <div>
                    {/* Discount thresholds table */}
                    <CSectionCard
                        title="Discount thresholds"
                        description="When a quote's average discount crosses a threshold, it's routed to the listed approver before it can be sent."
                        headAction={
                            <button onClick={addTier} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 11px', background:'transparent', border:`1px solid ${T.border}`, color:T.ink, fontSize:12, fontWeight:500, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>
                                + Add tier
                            </button>
                        }
                    >
                        <div style={{ border:`1px solid ${T.border}`, borderRadius:T.r+2, overflow:'visible' }}>
                            {/* Header */}
                            <div style={{ display:'grid', gridTemplateColumns:'28px 1.4fr 170px 1.2fr 80px 1fr 70px 30px', padding:'9px 14px', borderBottom:`1px solid ${T.border}`, background:T.surface2, gap:10, borderRadius:`${T.r+2}px ${T.r+2}px 0 0` }}>
                                {['','Tier','Discount range','Approver','SLA','Fallback','',''].map((h,i) => (
                                    <div key={i} style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', textAlign: i>=4&&i<=5 ? 'right' : 'left', fontFamily:T.sans }}>{h}</div>
                                ))}
                            </div>
                            {tiers.map((t,i) => {
                                const lo = i===0 ? 0 : tiers[i-1].maxDiscount;
                                const hi = t.maxDiscount;
                                const ef = editingField?.idx === i ? editingField.field : null;
                                const inpSt = { padding:'3px 8px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace', outline:'none', background:T.surface };
                                return (
                                    <div key={t.id} style={{ display:'grid', gridTemplateColumns:'28px 1.4fr 170px 1.2fr 80px 1fr 70px 30px', padding:'12px 14px', gap:10, borderBottom: i<tiers.length-1 ? `1px solid ${T.border}` : 'none', alignItems:'center', background:T.surface, fontSize:13, fontFamily:T.sans, position:'relative' }}>
                                        <div><SPDrag/></div>

                                        {/* Tier label */}
                                        <div>
                                            {ef === 'label' ? (
                                                <input autoFocus value={editingVal} onChange={e => setEditingVal(e.target.value)}
                                                    onBlur={() => commitFieldEdit(i,'label',editingVal)}
                                                    onKeyDown={e => { if(e.key==='Enter') commitFieldEdit(i,'label',editingVal); if(e.key==='Escape') { setEditingField(null); } }}
                                                    style={{ ...inpSt, fontFamily:T.sans, fontWeight:700, width:'90%' }}/>
                                            ) : (
                                                <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
                                                    <span style={{ width:10, height:10, background:t.color, borderRadius:2, flexShrink:0 }}/>
                                                    <b style={{ fontFamily:T.sans }}>{t.label}</b>
                                                </span>
                                            )}
                                        </div>

                                        {/* Discount range — click to edit max */}
                                        <div style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:12, color:T.inkMid }}>
                                            {ef === 'maxDiscount' ? (
                                                <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                                                    <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:12 }}>{Math.round(lo*100)}% – </span>
                                                    <input autoFocus type="number" min={Math.round(lo*100)+1} max={100} value={editingVal}
                                                        onChange={e => setEditingVal(e.target.value)}
                                                        onBlur={() => commitFieldEdit(i,'maxDiscount',editingVal)}
                                                        onKeyDown={e => { if(e.key==='Enter') commitFieldEdit(i,'maxDiscount',editingVal); if(e.key==='Escape') setEditingField(null); }}
                                                        style={{ ...inpSt, width:52 }}/>
                                                    <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:12 }}>%</span>
                                                </div>
                                            ) : (
                                                `${Math.round(lo*100)}% – ${Math.round(hi*100)}%`
                                            )}
                                        </div>

                                        {/* Approver */}
                                        <div>
                                            {ef === 'approver' ? (
                                                <input autoFocus value={editingVal} onChange={e => setEditingVal(e.target.value)}
                                                    onBlur={() => commitFieldEdit(i,'approver',editingVal)}
                                                    onKeyDown={e => { if(e.key==='Enter') commitFieldEdit(i,'approver',editingVal); if(e.key==='Escape') setEditingField(null); }}
                                                    style={{ ...inpSt, fontFamily:T.sans, width:'90%' }} placeholder="Approver name"/>
                                            ) : t.approver ? (
                                                <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                                                    <span style={{ width:22, height:22, borderRadius:'50%', background:T.surface2, border:`1px solid ${T.border}`, fontSize:10, color:T.inkMid, display:'inline-flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>
                                                        {t.approver.split(' ').map(s=>s[0]).slice(0,2).join('')}
                                                    </span>
                                                    <span style={{ fontSize:13 }}>{t.approver}</span>
                                                </span>
                                            ) : (
                                                <span style={{ color:T.inkMuted, fontStyle:'italic', fontSize:12 }}>No approval needed</span>
                                            )}
                                        </div>

                                        {/* SLA */}
                                        <div style={{ textAlign:'right', fontFamily:'ui-monospace,Menlo,monospace', fontSize:12 }}>
                                            {ef === 'sla' ? (
                                                <input autoFocus value={editingVal} onChange={e => setEditingVal(e.target.value)}
                                                    onBlur={() => commitFieldEdit(i,'sla',editingVal)}
                                                    onKeyDown={e => { if(e.key==='Enter') commitFieldEdit(i,'sla',editingVal); if(e.key==='Escape') setEditingField(null); }}
                                                    style={{ ...inpSt, width:56, textAlign:'right' }} placeholder="e.g. 8h"/>
                                            ) : t.sla || '—'}
                                        </div>

                                        {/* Fallback */}
                                        <div style={{ color:T.inkMid, fontSize:12 }}>
                                            {ef === 'fallback' ? (
                                                <input autoFocus value={editingVal} onChange={e => setEditingVal(e.target.value)}
                                                    onBlur={() => commitFieldEdit(i,'fallback',editingVal)}
                                                    onKeyDown={e => { if(e.key==='Enter') commitFieldEdit(i,'fallback',editingVal); if(e.key==='Escape') setEditingField(null); }}
                                                    style={{ ...inpSt, fontFamily:T.sans, width:'90%' }} placeholder="e.g. CEO"/>
                                            ) : t.fallback || '—'}
                                        </div>

                                        <div style={{ textAlign:'right' }}><QPill tone={toneForIdx(i)} dot>Active</QPill></div>

                                        {/* Kebab */}
                                        <div style={{ position:'relative', textAlign:'right' }} onClick={e => e.stopPropagation()}>
                                            <button onClick={() => setOpenTierMenu(openTierMenu===i ? null : i)}
                                                style={{ background:'none', border:'none', cursor:'pointer', color:T.inkMuted, fontSize:16, padding:0, lineHeight:1 }}>⋯</button>

                                            {openTierMenu === i && (
                                                <div style={{ position:'absolute', right:0, zIndex:500, background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2, boxShadow:'0 4px 20px rgba(42,38,34,0.14)', minWidth:230, overflow:'hidden',
                                                    ...(i >= tiers.length - 2 ? { bottom:'100%', marginBottom:4 } : { top:'100%', marginTop:4 }) }}>

                                                    {/* Edit group */}
                                                    {[
                                                        { label:'Edit tier',  sub:'Name, color, discount cap', action:() => startEdit(i,'label',t.label) },
                                                        { label:'Duplicate',  sub:'Clone as a new editable tier', action:() => handleDuplicateTier(i) },
                                                        { label:'Move…',      sub:'Reorder this tier', action:() => setOpenTierMenu(null), muted:true },
                                                    ].map((item,mi) => (
                                                        <button key={mi} onClick={item.action}
                                                            style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', borderTop: mi>0?`1px solid ${T.border}`:'none', textAlign:'left', cursor:item.muted?'default':'pointer', fontFamily:T.sans }}
                                                            onMouseEnter={e => { if(!item.muted) e.currentTarget.style.background=T.surface2; }}
                                                            onMouseLeave={e => e.currentTarget.style.background='none'}>
                                                            <div style={{ fontSize:13, color:item.muted?T.inkMuted:T.ink }}>{item.label}</div>
                                                            {item.sub && <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>{item.sub}</div>}
                                                        </button>
                                                    ))}

                                                    {/* Add New Tier group */}
                                                    <div style={{ padding:'5px 14px 3px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', borderTop:`1px solid ${T.border}`, background:T.surface2, fontFamily:T.sans }}>Add new tier</div>
                                                    {[
                                                        { label:'Insert tier above', sub:`New tier just above ${t.label}`, action:() => handleInsertTierAbove(i) },
                                                        { label:'Insert tier below', sub:'Catch-all above 100%', action:() => handleInsertTierBelow(i) },
                                                        { label:'New tier from this…', sub:`Pre-fill color, SLA, approver`, action:() => handleNewTierFromThis(i) },
                                                    ].map((item,mi) => (
                                                        <button key={mi} onClick={item.action}
                                                            style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', borderTop:`1px solid ${T.border}`, textAlign:'left', cursor:'pointer', fontFamily:T.sans }}
                                                            onMouseEnter={e => e.currentTarget.style.background=T.surface2}
                                                            onMouseLeave={e => e.currentTarget.style.background='none'}>
                                                            <div style={{ fontSize:13, color:T.ink }}>{item.label}</div>
                                                            {item.sub && <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>{item.sub}</div>}
                                                        </button>
                                                    ))}

                                                    {/* Approver Chain group */}
                                                    <div style={{ padding:'5px 14px 3px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', borderTop:`1px solid ${T.border}`, background:T.surface2, fontFamily:T.sans }}>Approver chain</div>
                                                    {[
                                                        { label:'Change approver…',  sub:t.approver?`${t.approver} — someone else`:'Set an approver', action:() => startEdit(i,'approver',t.approver||'') },
                                                        { label:'Edit SLA',           sub:`Currently ${t.sla||'not set'}`, action:() => startEdit(i,'sla',t.sla||'') },
                                                        { label:'Edit fallback',      sub:`${t.fallback||'Not set'} after SLA breach`, action:() => startEdit(i,'fallback',t.fallback||'') },
                                                        { label:'Add co-approver',    sub:'Require both signatures', action:() => setOpenTierMenu(null), muted:true },
                                                    ].map((item,mi) => (
                                                        <button key={mi} onClick={item.action}
                                                            style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', borderTop:`1px solid ${T.border}`, textAlign:'left', cursor:item.muted?'default':'pointer', fontFamily:T.sans }}
                                                            onMouseEnter={e => { if(!item.muted) e.currentTarget.style.background=T.surface2; }}
                                                            onMouseLeave={e => e.currentTarget.style.background='none'}>
                                                            <div style={{ fontSize:13, color:item.muted?T.inkMuted:T.ink }}>{item.label}</div>
                                                            {item.sub && <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>{item.sub}</div>}
                                                        </button>
                                                    ))}

                                                    {/* Active Quotes group */}
                                                    <div style={{ padding:'5px 14px 3px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', borderTop:`1px solid ${T.border}`, background:T.surface2, fontFamily:T.sans }}>Active quotes</div>
                                                    {[
                                                        { label:'View quotes routed',   sub:`All quotes at ${t.label}`, action:() => setOpenTierMenu(null) },
                                                        { label:'View pending now',      sub:`Awaiting ${t.approver||'approval'} sign-off`, action:() => setOpenTierMenu(null) },
                                                    ].map((item,mi) => (
                                                        <button key={mi} onClick={item.action}
                                                            style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', borderTop:`1px solid ${T.border}`, textAlign:'left', cursor:'pointer', fontFamily:T.sans }}
                                                            onMouseEnter={e => e.currentTarget.style.background=T.surface2}
                                                            onMouseLeave={e => e.currentTarget.style.background='none'}>
                                                            <div style={{ fontSize:13, color:T.ink }}>{item.label}</div>
                                                            {item.sub && <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>{item.sub}</div>}
                                                        </button>
                                                    ))}

                                                    {/* Delete */}
                                                    <button onClick={() => deleteTier(i)}
                                                        style={{ display:'block', width:'100%', padding:'9px 14px', background:T.surface2, border:'none', borderTop:`1px solid ${T.border}`, textAlign:'left', cursor:'pointer', fontFamily:T.sans }}
                                                        onMouseEnter={e => e.currentTarget.style.background='rgba(156,58,46,0.08)'}
                                                        onMouseLeave={e => e.currentTarget.style.background=T.surface2}>
                                                        <div style={{ fontSize:13, color:T.danger, fontWeight:600 }}>Delete tier</div>
                                                        <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>Remove this approval tier</div>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CSectionCard>

                    {/* Approval ladder flow strip */}
                    <CSectionCard title="Approval ladder" description="A live preview of how the tiers carve up the 0–100% discount range.">
                        <div>
                            <div style={{ display:'flex', height:28, borderRadius:T.r+1, overflow:'hidden', border:`1px solid ${T.border}` }}>
                                {(() => {
                                    let prev = 0;
                                    return tiers.map((t,i) => {
                                        const width = (t.maxDiscount - prev) * 100;
                                        const seg = (
                                            <div key={i} style={{ flex:`${width} 0 0`, background:t.color, opacity:0.85, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:11, fontWeight:600, letterSpacing:0.2, borderRight: i<tiers.length-1 ? '1px solid rgba(255,255,255,0.3)' : 'none', overflow:'hidden', whiteSpace:'nowrap', padding:'0 6px' }}>
                                                {t.label}
                                            </div>
                                        );
                                        prev = t.maxDiscount;
                                        return seg;
                                    });
                                })()}
                            </div>
                            <div style={{ position:'relative', height:14, marginTop:4 }}>
                                <span style={{ position:'absolute', left:0, fontSize:10, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace', transform:'translateX(-50%)' }}>0%</span>
                                {tiers.map((t,i) => (
                                    <span key={i} style={{ position:'absolute', left:`${t.maxDiscount*100}%`, fontSize:10, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace', transform:'translateX(-50%)' }}>
                                        {Math.round(t.maxDiscount*100)}%
                                    </span>
                                ))}
                            </div>
                        </div>
                    </CSectionCard>

                    {/* Triggers */}
                    <CSectionCard title="Triggers" description="What activates the approval flow. By default only avg discount, but you can add deal-level triggers.">
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                            {triggers.map((r,i) => (
                                <div key={i} onClick={() => toggleTrigger(i)} style={{ padding:'10px 12px', border:`1px solid ${r.on ? T.goldInk : T.border}`, borderRadius:T.r+2, background: r.on ? 'rgba(200,185,154,0.08)' : T.surface, cursor:'pointer', transition:'all 120ms' }}>
                                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                                        <ATToggle on={r.on}/>
                                        <span style={{ fontSize:13, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{r.k}</span>
                                    </div>
                                    <div style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>{r.hint}</div>
                                </div>
                            ))}
                        </div>
                        <div style={{ marginTop:14, fontSize:11.5, color:T.inkMuted, display:'flex', alignItems:'center', gap:8, fontFamily:T.sans }}>
                            Need conditional logic per product or customer type?
                            <span style={{ color:T.goldInk, fontWeight:600, cursor:'pointer' }}>Switch to advanced rules →</span>
                        </div>
                    </CSectionCard>
                </div>

                {/* ── RIGHT COLUMN ────────────────────────────────── */}
                <div>
                    <div style={{ position:'sticky', top:20 }}>
                        {/* Last 90 days — live from quotes API */}
                        <CSectionCard title="Last 90 days" description="How approvals are flowing in practice.">
                            {statsLoading && (
                                <div style={{ fontSize:12, color:T.inkMuted, fontStyle:'italic', fontFamily:T.sans, padding:'8px 0' }}>Loading…</div>
                            )}
                            {!statsLoading && tiers.map((t,i) => {
                                const tones = ['rep','mgr','vp','cfo'];
                                const tone = tones[i] || 'neutral';
                                // Match live stats to tier by label, fall back to zeros
                                const u = approvalStats?.find(s => s.tier === t.label) || { quotes:0, approved:0, declined:0, pending:0, avgHours:0 };
                                return (
                                    <div key={t.id} style={{ padding:'10px 0', borderBottom: i<tiers.length-1 ? `1px solid ${T.border}` : 'none' }}>
                                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                                            <QPill tone={tone}>{t.label}</QPill>
                                            <div style={{ flex:1 }}/>
                                            <span style={{ fontFamily:T.serif, fontStyle:'italic', fontWeight:700, fontSize:14, color:T.ink }}>{u.quotes}</span>
                                            <span style={{ fontSize:10, color:T.inkMuted, fontFamily:T.sans }}>quotes</span>
                                        </div>
                                        <div style={{ fontSize:11, color:T.inkMid, display:'flex', gap:12, fontFamily:T.sans }}>
                                            <span>✓ {u.approved}</span>
                                            {u.declined > 0 && <span style={{ color:T.danger }}>✗ {u.declined}</span>}
                                            {u.pending  > 0 && <span style={{ color:T.warn }}>● {u.pending} pending</span>}
                                            {u.avgHours > 0 && <span style={{ marginLeft:'auto', color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace' }}>~{u.avgHours}h avg</span>}
                                        </div>
                                    </div>
                                );
                            })}
                            {!statsLoading && approvalStats && approvalStats.every(s => s.quotes === 0) && (
                                <div style={{ fontSize:12, color:T.inkMuted, fontStyle:'italic', fontFamily:T.sans, padding:'8px 0' }}>No approval activity in the last 90 days.</div>
                            )}
                        </CSectionCard>

                        {/* Try a deal — live simulator */}
                        <CSectionCard title="Try a deal" description="See which tier a hypothetical quote would hit.">
                            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                                <div>
                                    <label style={{ fontSize:11, fontWeight:600, color:T.inkMid, display:'block', marginBottom:4, fontFamily:T.sans }}>Avg discount <span style={{ color:T.inkMuted, fontWeight:400 }}>Across all line items.</span></label>
                                    <NumStep value={trialDiscount} onChange={v => { setTrialDiscount(v); }} suffix="%" min={0} max={100}/>
                                </div>
                                <div>
                                    <label style={{ fontSize:11, fontWeight:600, color:T.inkMid, display:'block', marginBottom:4, fontFamily:T.sans }}>Deal value</label>
                                    <input type="number" value={trialValue} onChange={e => setTrialValue(parseInt(e.target.value)||0)}
                                        style={{ padding:'6px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace', outline:'none', width:'100%', boxSizing:'border-box', background:T.surface }}/>
                                    <div style={{ fontSize:11, color:T.inkMuted, marginTop:3, fontFamily:T.sans }}>${trialValue.toLocaleString()}</div>
                                </div>
                                <div>
                                    <label style={{ fontSize:11, fontWeight:600, color:T.inkMid, display:'block', marginBottom:4, fontFamily:T.sans }}>Term</label>
                                    <select value={trialTerm} onChange={e => setTrialTerm(e.target.value)} style={{ padding:'6px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', width:'100%', background:T.surface, cursor:'pointer' }}>
                                        {['12 months','24 months','36 months','48 months','60 months'].map(t => <option key={t}>{t}</option>)}
                                    </select>
                                </div>

                                {/* Result */}
                                <div style={{ padding:'12px 14px', background:`${matchedTier.color}1a`, border:`1.5px solid ${matchedTier.color}`, borderRadius:T.r+2, marginTop:4 }}>
                                    <div style={{ fontSize:10, fontWeight:700, color:matchedTier.color, letterSpacing:0.8, textTransform:'uppercase', fontFamily:T.sans, marginBottom:6 }}>Routes to</div>
                                    <div style={{ fontSize:14, fontWeight:700, color:matchedTier.color, fontFamily:T.sans }}>{matchedTier.label}</div>
                                    <div style={{ fontSize:11, color:T.inkMid, marginTop:4, fontFamily:T.sans }}>
                                        {matchedTier.approver
                                            ? `Avg discount ${trialDiscount}% › ${Math.round((tiers[tiers.indexOf(matchedTier)-1]?.maxDiscount??0)*100)}% threshold · est. ${matchedTier.sla} SLA`
                                            : `Avg discount ${trialDiscount}% is within the ${Math.round(matchedTier.maxDiscount*100)}% rep tier — no approval needed`}
                                    </div>
                                </div>
                            </div>
                        </CSectionCard>
                    </div>
                </div>
            </div>
        </CategoryDetailChrome>
    );
};
