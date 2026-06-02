// settings/dispatch/DispatchJobTemplatesDetail.jsx
import React, { useState, useEffect } from 'react';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { CSectionCard } from '../shared/form.jsx';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';

export const DispatchJobTemplatesDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {
    const saved = settings?.dispatchJobTemplates || [];
    const skills   = settings?.dispatchSkills   || [];
    const licenses = settings?.dispatchLicenses || ['Apprentice','Journeyman','Master','Lead'];
    const custTypes = settings?.customerTypes   || [];

    const [templates, setTemplates] = useState(() => JSON.parse(JSON.stringify(saved)));
    const [dirty,    setDirty]    = useState(false);
    const [saving,   setSaving]   = useState(false);
    const [selectedId, setSelectedId] = useState(saved[0]?.id || null);
    const [showAdd,  setShowAdd]  = useState(false);
    const [tmplMenu, setTmplMenu] = useState(null);

    const selected = templates.find(t => t.id === selectedId);

    const handleSave = async () => {
        setSaving(true);
        setSettings(prev => ({ ...prev, dispatchJobTemplates: templates }));
        try { await dbFetch('/.netlify/functions/settings', { method: 'PUT', body: JSON.stringify({ dispatchJobTemplates: templates }) }); }
        catch(e) { console.error('save job templates', e); }
        setSaving(false); setDirty(false);
    };

    React.useEffect(() => { if (setSettingsDirty) setSettingsDirty(dirty); return () => { if (setSettingsDirty) setSettingsDirty(false); }; }, [dirty]);
    React.useEffect(() => {
        if (!settingsSaveRef) return;
        settingsSaveRef.current = dirty ? handleSave : null;
        return () => { if (settingsSaveRef) settingsSaveRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dirty]);

    const updateTemplate = (field, val) => {
        setTemplates(prev => prev.map(t => t.id === selectedId ? { ...t, [field]: val } : t));
        setDirty(true);
    };

    const toggleSkill = (skillId) => {
        if (!selected) return;
        const next = (selected.skills||[]).includes(skillId)
            ? (selected.skills||[]).filter(s => s !== skillId)
            : [...(selected.skills||[]), skillId];
        updateTemplate('skills', next);
    };

    const prioColor = (p) => ({ urgent: T.danger, standard: T.warn, low: T.inkMuted }[p] || T.inkMuted);

    // Sanity checks for selected template
    const sanityChecks = selected ? [
        {
            ok: (selected.skills||[]).every(id => skills.find(s=>s.id===id)),
            label: 'All required skills exist',
            detail: `${(selected.skills||[]).filter(id=>skills.find(s=>s.id===id)).length} of ${(selected.skills||[]).length} skills referenced`,
        },
        {
            ok: licenses.includes(selected.minLicense),
            label: 'Min license exists',
            detail: `"${selected.minLicense}" is rank ${licenses.indexOf(selected.minLicense)+1} of ${licenses.length}`,
        },
        {
            ok: true,
            label: 'Customer type linked',
            detail: selected.ctype || 'No customer type',
        },
    ] : [];

    return (
        <CategoryDetailChrome crumb="Job templates" category="Dispatch" title="Job templates"
            subtitle="When an opportunity moves to Closed Won, Accelerep can auto-create a Job using the template tied to the customer's type. Defaults pre-fill — dispatchers can still edit before scheduling."
            onBack={onBack} dirty={dirty}
            onCancel={() => { setTemplates(JSON.parse(JSON.stringify(saved))); setDirty(false); }}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
            extraActions={
                <>
                    <button style={{ padding:'7px 14px', background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:500, color:T.inkMid, cursor:'pointer', fontFamily:T.sans }}>Test auto-create</button>
                    <button onClick={()=>{ const id='tmpl_'+Date.now(); setTemplates(p=>[...p,{id,ctype:'',crew:1,hrs:2,skills:[],minLicense:licenses[0]||'Apprentice',equip:'',autojob:true,priority:'standard',used:0}]); setSelectedId(id); setDirty(true); }} style={{ padding:'7px 14px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>+ New template</button>
                </>
            }>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
                {/* Left — templates + form */}
                <div>
                    {/* Templates table */}
                    <CSectionCard title="Templates" desc="One per Customer Type. Reach the Customer Types list at Settings → Sales process → Customer types.">
                        <div style={{ border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 60px 60px 1.2fr 100px 80px 80px 80px 28px', gap: 8, padding: '8px 12px', background: T.surface2, fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: T.sans }}>
                                <div>Customer type</div><div>Crew</div><div>Hours</div><div>Required skills</div><div>Min license</div><div>Priority</div><div>Auto-create</div><div>Used 30d</div><div/>
                            </div>
                            {templates.map((t, i) => (
                                <div key={t.id} onClick={() => setSelectedId(t.id)}
                                    style={{ display: 'grid', gridTemplateColumns: '1.5fr 60px 60px 1.2fr 100px 80px 80px 80px 28px', gap: 8, padding: '10px 12px', alignItems: 'center', fontSize: 12, fontFamily: T.sans, cursor: 'pointer',
                                        borderTop: i>0?`1px solid ${T.border}`:'none',
                                        background: selectedId===t.id ? `${T.goldInk}08` : T.surface,
                                        borderLeft: selectedId===t.id ? `3px solid ${T.goldInk}` : '3px solid transparent' }}>
                                    <div style={{ fontWeight: selectedId===t.id ? 700 : 400, color: T.ink }}>{t.ctype || '—'}</div>
                                    <div style={{ color: T.inkMid }}>{t.crew}p</div>
                                    <div style={{ color: T.inkMid }}>{t.hrs}h</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                        {(t.skills||[]).map(id => { const s=skills.find(sk=>sk.id===id); return s?<span key={id} style={{ fontSize:9.5, padding:'1px 5px', borderRadius:8, background:`${s.color}14`, color:s.color, fontWeight:600 }}>{s.name}</span>:null; })}
                                    </div>
                                    <div><span style={{ fontSize:11, padding:'2px 7px', borderRadius:3, background:`${T.info}14`, color:T.info, fontWeight:600 }}>{t.minLicense}</span></div>
                                    <div><span style={{ fontSize:11, padding:'2px 7px', borderRadius:3, background:`${prioColor(t.priority)}14`, color:prioColor(t.priority), fontWeight:600 }}>{t.priority}</span></div>
                                    <div><span style={{ fontSize:11, padding:'2px 7px', borderRadius:3, background:t.autojob?`${T.ok}14`:`${T.inkMuted}14`, color:t.autojob?T.ok:T.inkMuted, fontWeight:600 }}>{t.autojob?'On':'Off'}</span></div>
                                    <div style={{ color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace', fontSize:11 }}>{t.used||0}</div>
                                    <button onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setTmplMenu(tmplMenu?.id===t.id?null:{id:t.id,t,rect:{top:r.bottom+4,right:window.innerWidth-r.right}});}} style={{background:'none',border:'none',cursor:'pointer',color:T.inkMuted,fontSize:16,fontWeight:700,padding:'0 2px',lineHeight:1}}>⋯</button>
                                </div>
                            ))}
                        </div>

                    </CSectionCard>
                    {/* Selected template form */}
                    {selected && (
                        <CSectionCard title={selected.ctype || 'New template'} desc="Edit the template fields below.">
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                <div>
                                    <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.6, marginBottom:5, fontFamily:T.sans }}>Template name</div>
                                    <input value={selected.ctype||''} onChange={e=>updateTemplate('ctype',e.target.value)} placeholder="e.g. Emergency · same-day"
                                        style={{ width:'100%', padding:'7px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none', boxSizing:'border-box', background:T.surface }}/>
                                </div>
                                <div>
                                    <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.6, marginBottom:5, fontFamily:T.sans }}>Tied to customer type</div>
                                    <select value={selected.ctype||''} onChange={e=>updateTemplate('ctype',e.target.value)}
                                        style={{ width:'100%', padding:'7px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none', background:T.surface, boxSizing:'border-box' }}>
                                        <option value="">— Select customer type —</option>
                                        {custTypes.map((ct,i)=><option key={i} value={typeof ct==='string'?ct:ct.name}>{typeof ct==='string'?ct:ct.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.6, marginBottom:5, fontFamily:T.sans }}>Default crew size</div>
                                    <input type="number" min={1} max={10} value={selected.crew||1} onChange={e=>updateTemplate('crew',parseInt(e.target.value)||1)}
                                        style={{ width:'100%', padding:'7px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none', boxSizing:'border-box', background:T.surface }}/>
                                </div>
                                <div>
                                    <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.6, marginBottom:5, fontFamily:T.sans }}>Default duration</div>
                                    <input value={selected.hrs ? selected.hrs + ' hours' : ''} onChange={e=>updateTemplate('hrs',parseFloat(e.target.value)||2)}
                                        placeholder="e.g. 4 hours"
                                        style={{ width:'100%', padding:'7px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none', boxSizing:'border-box', background:T.surface }}/>
                                </div>
                                <div>
                                    <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.6, marginBottom:5, fontFamily:T.sans }}>Minimum license</div>
                                    <select value={selected.minLicense||licenses[0]} onChange={e=>updateTemplate('minLicense',e.target.value)}
                                        style={{ width:'100%', padding:'7px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none', background:T.surface, boxSizing:'border-box' }}>
                                        {licenses.map(l=><option key={l}>{l}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.6, marginBottom:5, fontFamily:T.sans }}>Default priority</div>
                                    <select value={selected.priority||'standard'} onChange={e=>updateTemplate('priority',e.target.value)}
                                        style={{ width:'100%', padding:'7px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none', background:T.surface, boxSizing:'border-box' }}>
                                        <option>urgent</option><option>standard</option><option>low</option>
                                    </select>
                                </div>
                                <div style={{ gridColumn:'1 / -1' }}>
                                    <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.6, marginBottom:8, fontFamily:T.sans }}>Required skills</div>
                                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                                        {skills.map(s => {
                                            const active = (selected.skills||[]).includes(s.id);
                                            return (
                                                <span key={s.id} onClick={()=>toggleSkill(s.id)} style={{ fontSize:11, padding:'3px 9px', borderRadius:8, cursor:'pointer',
                                                    background:active?`${s.color}20`:T.surface2, border:`1px solid ${active?s.color:T.border}`,
                                                    color:active?s.color:T.inkMuted, fontWeight:active?700:400, fontFamily:T.sans, transition:'all 100ms' }}>{s.name}</span>
                                            );
                                        })}
                                    </div>
                                    {skills.length===0 && <div style={{ fontSize:12, color:T.inkMuted, fontStyle:'italic', fontFamily:T.sans }}>No skills configured. Add in Settings → Dispatch → Skills.</div>}
                                </div>
                                <div style={{ gridColumn:'1 / -1' }}>
                                    <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.6, marginBottom:5, fontFamily:T.sans }}>Default equipment</div>
                                    <input value={selected.equip||''} onChange={e=>updateTemplate('equip',e.target.value)} placeholder="e.g. Recovery cart, spares"
                                        style={{ width:'100%', padding:'7px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none', boxSizing:'border-box', background:T.surface }}/>
                                    <div style={{ fontSize:11, color:T.inkMuted, marginTop:4, fontFamily:T.sans }}>Comma-separated. Each item must exist in Vehicles & equipment.</div>
                                </div>
                            </div>

                            {/* Auto-create rule card */}
                            <div style={{ marginTop:16, background:`${T.warn}0a`, border:`1px solid ${T.warn}30`, borderRadius:T.r, padding:'14px 16px' }}>
                                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                                    <div style={{ fontSize:10, fontWeight:700, color:T.warn, textTransform:'uppercase', letterSpacing:0.8, fontFamily:T.sans }}>Auto-create</div>
                                    <div onClick={()=>updateTemplate('autojob',!selected.autojob)}
                                        style={{ width:30, height:18, borderRadius:9, background:selected.autojob?T.ok:T.border, position:'relative', cursor:'pointer', transition:'background 120ms', flexShrink:0 }}>
                                        <span style={{ position:'absolute', top:2, left:selected.autojob?14:2, width:14, height:14, borderRadius:'50%', background:'#fbf8f3', boxShadow:'0 1px 2px rgba(0,0,0,0.15)', transition:'left 100ms' }}/>
                                    </div>
                                    <span style={{ fontSize:12, fontWeight:600, color:selected.autojob?T.ok:T.inkMuted, fontFamily:T.sans }}>{selected.autojob?'ON':'OFF'}</span>
                                </div>
                                <div style={{ fontSize:12.5, color:T.inkMid, lineHeight:1.55, fontFamily:T.sans }}>
                                    When an opportunity of this customer type moves to <strong style={{ color:T.ink }}>Closed Won</strong>, Accelerep auto-creates a Job in the Dispatch queue with these defaults pre-filled. Dispatchers can still edit before scheduling.
                                </div>
                            </div>
                        </CSectionCard>
                    )}
                </div>

                {/* Right rail — preview + sanity checks */}
                <div>
                    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2, padding:'14px 16px', marginBottom:12 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.6, marginBottom:10, fontFamily:T.sans }}>Preview · what gets created</div>
                        {selected ? (
                            <div style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:T.r, padding:'10px 12px' }}>
                                <div style={{ fontSize:12, fontWeight:700, color:T.ink, marginBottom:4, fontFamily:T.sans }}>New Customer · {selected.ctype || 'Unknown type'}</div>
                                <div style={{ fontSize:11, color:T.inkMuted, marginBottom:8, fontFamily:T.sans }}>123 Main St · ASAP · same day</div>
                                <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:8 }}>
                                    {(selected.skills||[]).map(id=>{ const s=skills.find(sk=>sk.id===id); return s?<span key={id} style={{ fontSize:10, padding:'1px 6px', borderRadius:8, background:`${s.color}14`, color:s.color, fontWeight:600, border:`1px solid ${s.color}30` }}>{s.name}</span>:null; })}
                                </div>
                                <div style={{ fontSize:11, color:T.inkMid, fontFamily:T.sans }}>Crew × hours: <strong>{selected.crew||1} × {selected.hrs||2}h</strong></div>
                                <div style={{ fontSize:11, color:T.inkMid, fontFamily:T.sans }}>Min license: <strong>{selected.minLicense}</strong></div>
                                <div style={{ fontSize:11, color:T.inkMid, fontFamily:T.sans }}>Priority: <strong style={{ color:prioColor(selected.priority) }}>{selected.priority}</strong></div>
                                {selected.equip && <div style={{ fontSize:11, color:T.inkMid, fontFamily:T.sans }}>Equipment: <strong>{selected.equip}</strong></div>}
                            </div>
                        ) : (
                            <div style={{ fontSize:12, color:T.inkMuted, fontStyle:'italic', fontFamily:T.sans }}>Select a template to preview.</div>
                        )}
                    </div>

                    {selected && (
                        <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2, padding:'14px 16px' }}>
                            <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.6, marginBottom:10, fontFamily:T.sans }}>Sanity checks</div>
                            {sanityChecks.map((c,i) => (
                                <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', marginBottom:10 }}>
                                    <span style={{ fontSize:14, color:c.ok?T.ok:T.warn, flexShrink:0 }}>{c.ok?'✓':'⚠'}</span>
                                    <div>
                                        <div style={{ fontSize:12, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{c.label}</div>
                                        <div style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>{c.detail}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Job template row kebab ── */}
            {tmplMenu && tmplMenu.rect && (() => {
                const {t} = tmplMenu;
                return (<>
                    <div style={{position:'fixed',inset:0,zIndex:9998}} onClick={()=>setTmplMenu(null)}/>
                    <div style={{position:'fixed',top:tmplMenu.rect.top,right:tmplMenu.rect.right,zIndex:9999,background:T.surface,border:`1px solid ${T.border}`,borderRadius:T.r+2,boxShadow:'0 4px 16px rgba(42,38,34,0.12)',minWidth:180,overflow:'hidden'}}>
                        <button onClick={()=>{const clone={...t,id:'tmpl_'+Date.now(),ctype:t.ctype+' (copy)',used:0};setTemplates(p=>[...p,clone]);setSelectedId(clone.id);setDirty(true);setTmplMenu(null);}} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',textAlign:'left',fontSize:13,color:T.ink,cursor:'pointer',fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background='none'}>Duplicate</button>
                        <button onClick={()=>{setTemplates(p=>p.map(tm=>tm.id===t.id?{...tm,autojob:!tm.autojob}:tm));setDirty(true);setTmplMenu(null);}} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',borderTop:`1px solid ${T.border}`,textAlign:'left',fontSize:13,color:T.ink,cursor:'pointer',fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background='none'}>{t.autojob?'Disable auto-create':'Enable auto-create'}</button>
                        <button onClick={()=>{setTemplates(p=>p.filter(tm=>tm.id!==t.id));if(selectedId===t.id)setSelectedId(templates.find(tm=>tm.id!==t.id)?.id||null);setDirty(true);setTmplMenu(null);}} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',borderTop:`1px solid ${T.border}`,textAlign:'left',fontSize:13,color:T.danger,cursor:'pointer',fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background='rgba(156,58,46,0.06)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>Delete</button>
                    </div>
                </>);
            })()}
        </CategoryDetailChrome>
    );
};
