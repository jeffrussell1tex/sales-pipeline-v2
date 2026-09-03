// settings/salesProcess/FunnelStagesDetail.jsx
import React, { useState, useEffect } from 'react';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { putSettings } from '../shared/saveSettings.js';
import { CSectionCard } from '../shared/form.jsx';
import { StatusChip } from '../shared/ui.jsx';
import { SPTable, SPDrag } from './shared.jsx';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';

const DEFAULT_FUNNEL_STAGES = [
    { name:'Prospecting',  prob:10,  type:'Open', color:'#e07b4a' },
    { name:'Qualification',prob:25,  type:'Open', color:'#d4a847' },
    { name:'Discovery',    prob:40,  type:'Open', color:'#8aab5a' },
    { name:'Proposal',     prob:60,  type:'Open', color:'#4a8abd' },
    { name:'Negotiation',  prob:80,  type:'Open', color:'#7a5abd' },
    { name:'Closing',      prob:90,  type:'Open', color:'#4aad8a' },
    { name:'Closed Won',   prob:100, type:'Won',  color:'#4d6b3d' },
    { name:'Closed Lost',  prob:0,   type:'Lost', color:'#9c3a2e' },
];

export const FunnelStagesDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {
    const saved = settings?.funnelStages?.length ? settings.funnelStages : DEFAULT_FUNNEL_STAGES;
    const [stages, setStages] = useState(() => JSON.parse(JSON.stringify(saved)));
    const [dirty, setDirty]   = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');

    const update = (i, field, val) => {
        setStages(prev => prev.map((s, si) => si === i ? { ...s, [field]: val } : s));
        setDirty(true);
    };
    const addStage = () => {
        setStages(prev => [...prev, { name:'New stage', prob:50, type:'Open', color:'#8a8378' }]);
        setDirty(true);
    };
    const handleCancel = () => { setStages(JSON.parse(JSON.stringify(saved))); setDirty(false); };
    const handleSave   = async () => {
        setSaving(true);
        setSettings(prev => ({ ...prev, funnelStages: stages }));
        try {
            await putSettings({ funnelStages: stages });
            setSaveError('');
            setDirty(false);
        } catch (e) {
            // Keep the panel dirty: the change was NOT saved, and clearing the
            // flag here is what made a 403 look like success.
            setSaveError(e.message);
            // Clear the spinner BEFORE rethrowing — the `setSaving(false)` after
            // this try/catch is skipped by the throw, and the panel would sit on
            // "Saving…" for the rest of the session.
            setSaving(false);
            // Rethrow so the navigation guard knows the save failed. The panel
            // already keeps itself dirty and shows the error; without this the
            // guard's `await save()` resolves and it navigates away.
            throw e;
        }
        setSaving(false);
    };
    // Sync dirty state to app-level nav guard
    React.useEffect(() => { if (setSettingsDirty) setSettingsDirty(dirty); return () => { if (setSettingsDirty) setSettingsDirty(false); }; }, [dirty]);
    React.useEffect(() => {
        if (!settingsSaveRef) return;
        settingsSaveRef.current = dirty ? handleSave : null;
        return () => { if (settingsSaveRef) settingsSaveRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dirty]);

    // Open stages only for probability curve
    const openStages = stages.filter(s => s.type === 'Open');

    return (
        <CategoryDetailChrome error={saveError}
            crumb="Funnel stages" title="Funnel stages"
            subtitle="Stage names and default win probability"
            statusDetail={`${stages.length} stages`}
            onBack={onBack} dirty={dirty} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
        >
            <div style={{ display:'grid', gridTemplateColumns:'1fr 380px', gap:20 }}>
                {/* Left: stage table */}
                <div>
                    <CSectionCard
                        title="Canonical stages"
                        description="The master list of stages used across all pipelines. Disabling a stage removes it from any pipeline that references it."
                        headAction={<button onClick={addStage} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 11px', background:'transparent', border:`1px solid ${T.border}`, color:T.ink, fontSize:12, fontWeight:500, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>+ Add stage</button>}
                    >
                        <SPTable
                            columns={[
                                { key:'drag',  label:'',              w:'28px' },
                                { key:'name',  label:'Stage',         w:'1.4fr' },
                                { key:'prob',  label:'Default prob.',  w:'140px', align:'right' },
                                { key:'type',  label:'Type',           w:'90px' },
                                { key:'used',  label:'Used in',        w:'140px' },
                                { key:'state', label:'State',          w:'80px' },
                                { key:'more',  label:'',              w:'28px', align:'right' },
                            ]}
                            rows={stages.map((s,i) => ({
                                drag: <SPDrag muted={s.type !== 'Open'}/>,
                                name: <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
                                    <input type="color" value={s.color} onChange={e => update(i,'color',e.target.value)}
                                        style={{ width:14, height:14, border:'none', borderRadius:'50%', padding:0, cursor:'pointer', flexShrink:0 }}/>
                                    <b style={{ fontFamily:T.sans }}>{s.name}</b>
                                </span>,
                                prob: <input type="number" min="0" max="100" value={s.prob}
                                    onChange={e => update(i,'prob',Math.max(0,Math.min(100,parseInt(e.target.value)||0)))}
                                    style={{ width:60, padding:'3px 6px', fontSize:12, border:`1px solid ${T.border}`, borderRadius:T.r, background:T.surface, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace', textAlign:'right' }}/>,
                                type: <select value={s.type} onChange={e => update(i,'type',e.target.value)}
                                    style={{ fontSize:12, padding:'3px 6px', border:`1px solid ${T.border}`, borderRadius:T.r, background:T.surface, color:T.ink, fontFamily:T.sans, cursor:'pointer' }}>
                                    <option>Open</option><option>Won</option><option>Lost</option>
                                </select>,
                                used: <span style={{ fontSize:12, color:T.inkMid, fontFamily:T.sans }}>{s.type!=='Open' ? 'All pipelines' : 'New business'}</span>,
                                state: <StatusChip status="ok" detail="Active" small/>,
                                more: <span style={{ color:T.inkMuted, cursor:'pointer' }}>⋯</span>,
                            }))}
                        />
                    </CSectionCard>

                    <CSectionCard title="Probability display" description="How win probability is shown to reps on opportunity cards and in forecasts.">
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                            {[
                                { k:'Stage default',   sub:'Use the default % for each stage', on:true  },
                                { k:'Rep-adjustable',  sub:'Allow reps to override per-deal',  on:false },
                            ].map((o,i) => (
                                <div key={i} style={{ padding:'12px 14px', border:`1.5px solid ${o.on ? T.goldInk : T.border}`, borderRadius:T.r+2, background: o.on ? 'rgba(200,185,154,0.10)' : T.surface }}>
                                    <div style={{ fontSize:13, fontWeight:700, color:T.ink, fontFamily:T.sans }}>{o.k}</div>
                                    <div style={{ fontSize:11.5, color:T.inkMid, marginTop:3, fontFamily:T.sans }}>{o.sub}</div>
                                    {o.on && <div style={{ marginTop:6, fontSize:10, fontWeight:700, color:T.goldInk, letterSpacing:0.4, fontFamily:T.sans }}>● ACTIVE</div>}
                                </div>
                            ))}
                        </div>
                    </CSectionCard>
                </div>

                {/* Right: live probability curve */}
                <div>
                    <div style={{ position:'sticky', top:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+4, overflow:'hidden' }}>
                        <div style={{ padding:'14px 16px', background:'#2a2622', color:'#fbf8f3' }}>
                            <div style={{ fontSize:10, fontWeight:700, color:T.gold, letterSpacing:0.8, textTransform:'uppercase', marginBottom:5, fontFamily:T.sans }}>Probability curve</div>
                            <div style={{ fontSize:13, color:'#fbf8f3', lineHeight:1.5, fontFamily:T.sans }}>How deals weight into your forecast as they move through stages.</div>
                        </div>
                        <div style={{ padding:'16px 16px 8px' }}>
                            <svg width="100%" height="160" viewBox="0 0 320 160" preserveAspectRatio="none">
                                {[0,25,50,75,100].map((v,i) => (
                                    <line key={i} x1="30" x2="310" y1={136 - i*28} y2={136-i*28} stroke={T.border} strokeWidth="1" strokeDasharray="3 3"/>
                                ))}
                                {openStages.length > 1 && (
                                    <path
                                        d={openStages.map((s,i) => {
                                            const x = 30 + (i/(openStages.length-1))*280;
                                            const y = 132 - (s.prob/100)*112;
                                            return `${i===0?'M':'L'}${x} ${y}`;
                                        }).join(' ')}
                                        stroke={T.goldInk} strokeWidth="2" fill="none"
                                    />
                                )}
                                {openStages.map((s,i) => {
                                    const x = 30 + (i/(Math.max(openStages.length-1,1)))*280;
                                    const y = 132 - (s.prob/100)*112;
                                    return <circle key={i} cx={x} cy={y} r="4" fill={s.color||T.goldInk}/>;
                                })}
                                {[0,25,50,75,100].map((v,i) => (
                                    <text key={i} x="22" y={140-i*28} fontSize="9" fill={T.inkMuted} textAnchor="end">{v}%</text>
                                ))}
                            </svg>
                            <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:T.inkMuted, padding:'0 4px 8px', fontFamily:T.sans }}>
                                {openStages.map((s,i) => <span key={i}>{s.name.split(' ')[0]}</span>)}
                            </div>
                        </div>
                        <div style={{ padding:'12px 14px', background:'rgba(77,107,61,0.08)', borderTop:`1px solid ${T.border}` }}>
                            <div style={{ fontSize:11.5, color:T.inkMid, lineHeight:1.55, fontFamily:T.sans }}>
                                <b style={{ color:T.ink }}>Forecast math.</b> A $100k deal at Proposal ({openStages.find(s=>s.name==='Proposal')?.prob||60}%) contributes ${Math.round((openStages.find(s=>s.name==='Proposal')?.prob||60))}k to weighted pipeline.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </CategoryDetailChrome>
    );
};
