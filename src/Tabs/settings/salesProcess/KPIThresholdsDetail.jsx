// settings/salesProcess/KPIThresholdsDetail.jsx
import React, { useState, useEffect } from 'react';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { CSectionCard } from '../shared/form.jsx';
import { SPDetailPageChrome, SPSparkline } from './shared.jsx';

const DEFAULT_KPI_THRESHOLDS = [
    { k:'Quota attainment',     unit:'%',  good:100, ok:80,  poor:60,  reverse:false, sample:[62,70,68,75,82,88,94,97,103] },
    { k:'Win rate',             unit:'%',  good:30,  ok:22,  poor:15,  reverse:false, sample:[22,24,19,25,26,28,31,30,29] },
    { k:'Avg deal size',        unit:'$k', good:50,  ok:35,  poor:25,  reverse:false, sample:[34,38,42,45,48,46,51,54,52] },
    { k:'Sales cycle length',   unit:'d',  good:35,  ok:50,  poor:70,  reverse:true,  sample:[65,62,58,55,50,48,45,42,40] },
    { k:'Activities per deal',  unit:'',   good:10,  ok:6,   poor:3,   reverse:false, sample:[4,5,6,6,7,8,9,9,10] },
    { k:'Opportunity pipeline', unit:'$M', good:4,   ok:2.5, poor:1.5, reverse:false, sample:[1.8,2.1,2.5,2.8,3.2,3.5,3.8,4.1,4.3] },
];

export const KPIThresholdsDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {
    const saved = settings?.kpiThresholds?.length ? settings.kpiThresholds : DEFAULT_KPI_THRESHOLDS;
    const [rows, setRows]     = useState(() => JSON.parse(JSON.stringify(saved)));
    const [dirty, setDirty]   = useState(false);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState({});
    // Kebab menu state
    const [openKPI, setOpenKPI]       = useState(null); // index
    const [editingUnit, setEditingUnit] = useState(null); // index — inline unit editor
    // Add KPI form state
    const [showAdd, setShowAdd]   = useState(false);
    const [newKPI, setNewKPI]     = useState({ k:'', unit:'%', good:80, ok:60, poor:40, reverse:false, sample:[40,45,50,55,60,65,70,75,80], custom:true });
    const [addErr, setAddErr]     = useState('');

    const validate = (row, idx) => {
        if (!row.reverse && !(row.good > row.ok && row.ok > row.poor)) return 'Good > Ok > Poor required';
        if (row.reverse  && !(row.good < row.ok && row.ok < row.poor)) return 'Good < Ok < Poor required (lower is better)';
        return null;
    };

    const update = (i, field, val) => {
        const n = parseFloat(val);
        const updated = rows.map((r,ri) => ri===i ? { ...r, [field]: isNaN(n) ? val : n } : r);
        setRows(updated);
        setDirty(true);
        setErrors(prev => {
            const next = { ...prev };
            const err = validate(updated[i], i);
            if (err) next[i] = err; else delete next[i];
            return next;
        });
    };

    const hasErrors = Object.keys(errors).length > 0;

    const handleCancel = () => { setRows(JSON.parse(JSON.stringify(saved))); setDirty(false); setErrors({}); setShowAdd(false); };
    const handleSave   = async () => {
        if (hasErrors) return;
        setSaving(true);
        setSettings(prev => ({ ...prev, kpiThresholds: rows }));
        try { await dbFetch('/.netlify/functions/settings', { method:'PUT', body:JSON.stringify({ kpiThresholds: rows }) }); }
        catch(e) { console.error('save kpi thresholds', e); }
        setSaving(false); setDirty(false);
    };
    // Sync dirty state to app-level nav guard
    React.useEffect(() => { if (setSettingsDirty) setSettingsDirty(dirty); return () => { if (setSettingsDirty) setSettingsDirty(false); }; }, [dirty]);
    React.useEffect(() => {
        if (!settingsSaveRef) return;
        settingsSaveRef.current = dirty ? handleSave : null;
        return () => { if (settingsSaveRef) settingsSaveRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dirty]);

    // ── Kebab actions ─────────────────────────────────────────
    const handleResetToDefault = (i) => {
        const def = DEFAULT_KPI_THRESHOLDS.find(d => d.k === rows[i].k);
        if (!def) return;
        const updated = rows.map((r,ri) => ri===i ? { ...def } : r);
        setRows(updated); setDirty(true); setOpenKPI(null);
        setErrors(prev => { const next = {...prev}; delete next[i]; return next; });
    };

    const handleToggleHidden = (i) => {
        const updated = rows.map((r,ri) => ri===i ? { ...r, hidden: !r.hidden } : r);
        setRows(updated); setDirty(true); setOpenKPI(null);
    };

    const handleDuplicate = (i) => {
        const clone = { ...rows[i], k: rows[i].k + ' (copy)', custom: true };
        setRows(prev => [...prev, clone]); setDirty(true); setOpenKPI(null);
    };

    const handleRemove = (i) => {
        setRows(prev => prev.filter((_,ri) => ri !== i));
        setErrors(prev => {
            const next = {};
            Object.entries(prev).forEach(([k,v]) => { const ki = parseInt(k); if (ki < i) next[ki] = v; else if (ki > i) next[ki-1] = v; });
            return next;
        });
        setDirty(true); setOpenKPI(null);
    };

    // ── Add KPI ───────────────────────────────────────────────
    const handleAddKPI = () => {
        if (!newKPI.k.trim()) { setAddErr('KPI name is required.'); return; }
        if (rows.some(r => r.k.toLowerCase() === newKPI.k.trim().toLowerCase())) { setAddErr('A KPI with that name already exists.'); return; }
        const err = validate(newKPI, -1);
        if (err) { setAddErr(err); return; }
        setRows(prev => [...prev, { ...newKPI, k: newKPI.k.trim() }]);
        setNewKPI({ k:'', unit:'%', good:80, ok:60, poor:40, reverse:false, sample:[40,45,50,55,60,65,70,75,80], custom:true });
        setAddErr(''); setShowAdd(false); setDirty(true);
    };

    const numInp = (i, field, color) => (
        <input type="number" value={rows[i][field]} onChange={e => update(i, field, e.target.value)}
            style={{ width:64, padding:'4px 6px', fontSize:12, border:`1px solid ${errors[i] ? T.danger : T.border}`, borderRadius:T.r, background:T.surface, color, fontFamily:'ui-monospace,Menlo,monospace', textAlign:'right' }}/>
    );

    const UNITS = ['%', '$k', '$M', 'd', 'h', 'count', '$'];
    const inpSt = { padding:'6px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, boxSizing:'border-box' };

    return (
        <SPDetailPageChrome
            crumb="KPI thresholds" title="KPI thresholds"
            subtitle="Thresholds, colors, and sparkline ranges for dashboards"
            statusDetail={`${rows.filter(r=>!r.hidden).length} KPIs configured`}
            updatedBy="Admin" updatedAt="1 month ago"
            onBack={onBack} dirty={dirty && !hasErrors} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
            disablePrimary={!dirty || hasErrors || saving}
        >
            <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:20 }}>
                <div>
                    <CSectionCard
                        title="Core KPIs"
                        description="Thresholds determine the color (red / yellow / green) shown on Home, Sales Manager dashboards, and report cards."
                        headAction={
                            <button onClick={() => { setShowAdd(v => !v); setAddErr(''); }}
                                style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 11px', background: showAdd ? T.surface2 : 'transparent', border:`1px solid ${T.border}`, color:T.ink, fontSize:12, fontWeight:500, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>
                                + New KPI
                            </button>
                        }
                    >
                        {/* Add KPI inline form */}
                        {showAdd && (
                            <div style={{ padding:'12px 14px', background:T.surface2, border:`1px solid ${T.borderStrong}`, borderRadius:T.r+1, marginBottom:14 }}>
                                <div style={{ fontSize:12.5, fontWeight:700, color:T.ink, marginBottom:10, fontFamily:T.sans }}>New KPI</div>
                                <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 90px 90px 90px auto auto', gap:8, alignItems:'flex-end' }}>
                                    <div>
                                        <label style={{ fontSize:10.5, fontWeight:600, color:T.inkMid, display:'block', marginBottom:3, fontFamily:T.sans }}>Name</label>
                                        <input value={newKPI.k} onChange={e => { setNewKPI(p => ({ ...p, k:e.target.value })); setAddErr(''); }}
                                            placeholder="e.g. Emails per deal"
                                            style={{ ...inpSt, width:'100%' }}
                                            onKeyDown={e => { if (e.key==='Enter') handleAddKPI(); if (e.key==='Escape') { setShowAdd(false); setAddErr(''); } }}/>
                                    </div>
                                    <div>
                                        <label style={{ fontSize:10.5, fontWeight:600, color:T.inkMid, display:'block', marginBottom:3, fontFamily:T.sans }}>Unit</label>
                                        <select value={newKPI.unit} onChange={e => setNewKPI(p => ({ ...p, unit:e.target.value }))}
                                            style={{ ...inpSt, width:'100%', appearance:'none', cursor:'pointer' }}>
                                            {UNITS.map(u => <option key={u}>{u}</option>)}
                                        </select>
                                    </div>
                                    {[['Poor', 'poor', T.danger], ['Ok', 'ok', T.warn], ['Good', 'good', T.ok]].map(([lbl, field, color]) => (
                                        <div key={field}>
                                            <label style={{ fontSize:10.5, fontWeight:600, color, display:'block', marginBottom:3, fontFamily:T.sans }}>{lbl}</label>
                                            <input type="number" value={newKPI[field]}
                                                onChange={e => setNewKPI(p => ({ ...p, [field]: parseFloat(e.target.value)||0 }))}
                                                style={{ ...inpSt, width:'100%', fontFamily:'ui-monospace,Menlo,monospace', color, textAlign:'right' }}/>
                                        </div>
                                    ))}
                                    <button onClick={handleAddKPI}
                                        style={{ padding:'6px 14px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Add</button>
                                    <button onClick={() => { setShowAdd(false); setAddErr(''); }}
                                        style={{ padding:'6px 10px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                                </div>
                                <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8 }}>
                                    <input type="checkbox" id="reverse-chk" checked={newKPI.reverse} onChange={e => setNewKPI(p => ({ ...p, reverse:e.target.checked }))} style={{ cursor:'pointer' }}/>
                                    <label htmlFor="reverse-chk" style={{ fontSize:12, color:T.inkMid, cursor:'pointer', fontFamily:T.sans }}>Lower is better (e.g. cycle length, churn rate)</label>
                                </div>
                                {addErr && <div style={{ fontSize:11.5, color:T.danger, marginTop:6, fontFamily:T.sans }}>{addErr}</div>}
                            </div>
                        )}

                        {/* KPI table — native div so each row can have relative positioning for the popover */}
                        <div style={{ border:`1px solid ${T.border}`, borderRadius:T.r+2, overflow:'hidden' }}>
                            {/* Header */}
                            <div style={{ display:'grid', gridTemplateColumns:'1.6fr 110px 110px 110px 140px 28px', padding:'9px 14px', borderBottom:`1px solid ${T.border}`, background:T.surface2, gap:10 }}>
                                {['KPI','Poor ≤','Ok ≥','Good ≥','Last 9 periods',''].map((h,i) => (
                                    <div key={i} style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', textAlign: i>0&&i<4 ? 'right' : 'left', fontFamily:T.sans }}>{h}</div>
                                ))}
                            </div>

                            {rows.map((k,i) => (
                                <div key={i} style={{ display:'grid', gridTemplateColumns:'1.6fr 110px 110px 110px 140px 28px', padding:'12px 14px', gap:10, borderBottom: i<rows.length-1 ? `1px solid ${T.border}` : 'none', alignItems:'center', background: k.hidden ? 'rgba(138,131,120,0.06)' : T.surface, position:'relative', opacity: k.hidden ? 0.6 : 1 }}>
                                    {/* Name cell */}
                                    <div>
                                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                            <b style={{ fontFamily:T.sans, color:T.ink }}>{k.k}</b>
                                            {k.custom && <span style={{ fontSize:9, fontWeight:700, color:T.goldInk, background:'rgba(200,185,154,0.25)', padding:'1px 5px', borderRadius:2, letterSpacing:0.4, fontFamily:T.sans }}>CUSTOM</span>}
                                            {k.hidden && <span style={{ fontSize:9, fontWeight:700, color:T.inkMuted, background:T.surface2, padding:'1px 5px', borderRadius:2, letterSpacing:0.4, fontFamily:T.sans }}>HIDDEN</span>}
                                        </div>
                                        {editingUnit === i ? (
                                            <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:3 }}>
                                                <span style={{ fontSize:10.5, color:T.inkMuted, fontFamily:T.sans }}>Unit:</span>
                                                <select value={k.unit} onChange={e => { update(i,'unit',e.target.value); }} onBlur={() => setEditingUnit(null)}
                                                    autoFocus style={{ fontSize:11, padding:'2px 6px', border:`1px solid ${T.border}`, borderRadius:T.r, background:T.surface, color:T.ink, fontFamily:T.sans, cursor:'pointer' }}>
                                                    {UNITS.map(u => <option key={u}>{u}</option>)}
                                                </select>
                                                <input type="checkbox" checked={k.reverse||false} onChange={e => update(i,'reverse',e.target.checked)} style={{ cursor:'pointer' }}/>
                                                <span style={{ fontSize:10.5, color:T.inkMuted, fontFamily:T.sans }}>Lower is better</span>
                                            </div>
                                        ) : (
                                            <div style={{ fontSize:10.5, color:T.inkMuted, marginTop:2, fontFamily:T.sans }}>
                                                Unit: {k.unit||'count'}{k.reverse ? ' · lower is better':''}
                                            </div>
                                        )}
                                        {errors[i] && <div style={{ fontSize:10.5, color:T.danger, marginTop:3, fontFamily:T.sans }}>⚠ {errors[i]}</div>}
                                    </div>
                                    {/* Threshold inputs */}
                                    <div style={{ textAlign:'right' }}>{numInp(i,'poor',T.danger)}</div>
                                    <div style={{ textAlign:'right' }}>{numInp(i,'ok',  T.warn)}</div>
                                    <div style={{ textAlign:'right' }}>{numInp(i,'good',T.ok)}</div>
                                    <div><SPSparkline data={k.sample||[40,50,60,65,70,72,75,78,80]} color={T.ok}/></div>
                                    {/* Kebab */}
                                    <div style={{ position:'relative' }}>
                                        <button onClick={e => { e.stopPropagation(); setOpenKPI(openKPI===i ? null : i); setEditingUnit(null); }}
                                            style={{ background:'none', border:'none', cursor:'pointer', color:T.inkMuted, fontSize:16, padding:0, lineHeight:1 }}>⋯</button>
                                        {openKPI === i && (
                                            <div onClick={e => e.stopPropagation()}
                                                style={{ position:'absolute', right:0, top:'100%', zIndex:300, background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2, boxShadow:'0 4px 16px rgba(42,38,34,0.12)', minWidth:200, overflow:'hidden' }}>
                                                {[
                                                    { label:'Edit unit & format', action: () => { setEditingUnit(i); setOpenKPI(null); } },
                                                    { label: k.hidden ? 'Show on dashboards' : 'Hide from dashboards', action: () => handleToggleHidden(i) },
                                                    { label:'Duplicate', action: () => handleDuplicate(i) },
                                                    ...(!k.custom ? [{ label:'Reset to default', action: () => handleResetToDefault(i) }] : []),
                                                    { label:'View usage', action: () => setOpenKPI(null), note:'Quota attainment appears on 3 dashboards' },
                                                    ...(k.custom ? [{ label:'Remove', action: () => handleRemove(i), danger: true }] : []),
                                                ].map((item, mi) => (
                                                    <button key={mi} onClick={item.action}
                                                        style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', borderTop: mi>0 ? `1px solid ${T.border}` : 'none', textAlign:'left', fontSize:13, color: item.danger ? T.danger : T.ink, cursor:'pointer', fontFamily:T.sans }}
                                                        onMouseEnter={e => e.currentTarget.style.background = item.danger ? 'rgba(156,58,46,0.06)' : T.surface2}
                                                        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                                        <div>{item.label}</div>
                                                        {item.note && <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>{item.note}</div>}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CSectionCard>

                    <CSectionCard title="Color palette" description="Applies to all KPI cards, sparklines, and bar fills.">
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                            {[{ k:'Good', c:T.ok, hex:'#4d6b3d' },{ k:'Ok', c:T.warn, hex:'#b87333' },{ k:'Poor', c:T.danger, hex:'#9c3a2e' }].map((s,i) => (
                                <div key={i} style={{ padding:'12px 14px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2, display:'flex', alignItems:'center', gap:12 }}>
                                    <div style={{ width:28, height:28, background:s.c, borderRadius:T.r, flexShrink:0 }}/>
                                    <div>
                                        <div style={{ fontSize:13, fontWeight:700, color:T.ink, fontFamily:T.sans }}>{s.k}</div>
                                        <div style={{ fontSize:11, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace' }}>{s.hex}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CSectionCard>
                </div>

                {/* Right: live preview card */}
                <div>
                    <div style={{ position:'sticky', top:20 }}>
                        <CSectionCard title="Preview — Home dashboard card" description="How a KPI card renders with current thresholds.">
                            <div style={{ padding:16, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:T.r+2 }}>
                                <div style={{ fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.8, textTransform:'uppercase', fontFamily:T.sans }}>QUOTA ATTAINMENT · Q1</div>
                                <div style={{ display:'flex', alignItems:'flex-end', gap:10, marginTop:6 }}>
                                    <div style={{ fontSize:34, fontWeight:700, color:T.ok, fontFamily:T.serif, fontStyle:'italic' }}>103%</div>
                                    <div style={{ fontSize:12, color:T.ok, marginBottom:10, fontWeight:600, fontFamily:T.sans }}>+6 vs LQ</div>
                                </div>
                                <SPSparkline data={rows[0]?.sample||DEFAULT_KPI_THRESHOLDS[0].sample} color={T.ok}/>
                                <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:T.inkMuted, marginTop:4, fontFamily:T.sans }}>
                                    <span>Target {rows[0]?.good||100}{rows[0]?.unit||'%'}</span>
                                    <span>Poor &lt; {rows[0]?.poor||60}{rows[0]?.unit||'%'}</span>
                                </div>
                            </div>
                        </CSectionCard>
                        {hasErrors && (
                            <div style={{ padding:'12px 14px', background:'rgba(156,58,46,0.08)', border:`1px solid rgba(156,58,46,0.25)`, borderRadius:T.r+2, marginTop:10, fontSize:12.5, color:T.danger, fontFamily:T.sans, fontWeight:600 }}>
                                ⚠ Fix threshold errors before saving.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </SPDetailPageChrome>
    );
};
