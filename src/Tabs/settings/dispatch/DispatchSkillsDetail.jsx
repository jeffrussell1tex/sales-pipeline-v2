// settings/dispatch/DispatchSkillsDetail.jsx
import React, { useState, useEffect } from 'react';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { CSectionCard } from '../shared/form.jsx';
import { SPTable } from '../salesProcess/shared.jsx';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';

export const DispatchSkillsDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {
    const savedSkills   = settings?.dispatchSkills   || [];
    const savedCerts    = settings?.dispatchCerts    || [];
    const savedLicenses = settings?.dispatchLicenses || ['Apprentice','Journeyman','Master','Lead'];
    const [skills,   setSkills]   = useState(() => JSON.parse(JSON.stringify(savedSkills)));
    const [certs,    setCerts]    = useState(() => JSON.parse(JSON.stringify(savedCerts)));
    const [licenses, setLicenses] = useState(() => [...savedLicenses]);
    const [dirty,    setDirty]    = useState(false);
    const [saving,   setSaving]   = useState(false);
    const [addingSkill, setAddingSkill] = useState(false);
    const [addingCert,  setAddingCert]  = useState(false);
    const [newSkill, setNewSkill] = useState({ name:'', category:'Field', color:'#7a5a3c' });
    const [editingSkill, setEditingSkill] = useState(null);
    const [editingCert,  setEditingCert]  = useState(null);
    // Kebab state — one per section, rendered outside the table to escape overflow:hidden
    const [skillMenu, setSkillMenu] = useState(null); // { id, idx, rect }
    const [certMenu,  setCertMenu]  = useState(null);
    const [licMenu,   setLicMenu]   = useState(null);
    const [newCert,  setNewCert]  = useState({ name:'', renewalDays:365 });

    const handleSave = async () => {
        setSaving(true);
        const payload = { dispatchSkills: skills, dispatchCerts: certs, dispatchLicenses: licenses };
        setSettings(prev => ({ ...prev, ...payload }));
        try { await dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify(payload) }); }
        catch(e) { console.error('save dispatch skills', e); }
        setSaving(false); setDirty(false);
    };

    React.useEffect(() => { if (setSettingsDirty) setSettingsDirty(dirty); return () => { if (setSettingsDirty) setSettingsDirty(false); }; }, [dirty]);
    React.useEffect(() => {
        if (!settingsSaveRef) return;
        settingsSaveRef.current = dirty ? handleSave : null;
        return () => { if (settingsSaveRef) settingsSaveRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dirty]);

    const SKILL_CATS = ['Field','Electrical','Plumbing','HVAC','Solar','Role','Other'];
    const COLORS = ['#7a5a3c','#3a5a7a','#b87333','#4d6b3d','#9c3a2e','#7a6a48','#2a2622'];

    return (
        <CategoryDetailChrome crumb="Skills & certifications" category="Dispatch" title="Skills & certifications"
            subtitle="Skills, certs, and license levels your dispatchers schedule around."
            onBack={onBack} dirty={dirty}
            onCancel={() => { setSkills(JSON.parse(JSON.stringify(savedSkills))); setCerts(JSON.parse(JSON.stringify(savedCerts))); setLicenses([...savedLicenses]); setDirty(false); }}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
            extraActions={<button style={{ padding:'7px 14px', background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:500, color:T.inkMid, cursor:'pointer', fontFamily:T.sans }}>Import preset</button>}>

            <CSectionCard title="Skills" desc="Skill names your crews are dispatched around (e.g. Refrigeration, Solar install, Panel upgrade).">
                <SPTable columns={[
                    { key:'name',  label:'Skill',         w:'1fr' },
                    { key:'cat',   label:'Category',      w:'110px' },
                    { key:'cert',  label:'Requires cert', w:'130px' },
                    { key:'color', label:'Color',         w:'50px' },
                    { key:'techs', label:'Techs',         w:'55px' },
                    { key:'more',  label:'',              w:'28px' },
                ]} rows={skills.map((s,i) => ({
                    name:  editingSkill===s.id ? <input autoFocus value={s.name} onChange={e=>{ const n=[...skills]; n[i]={...n[i],name:e.target.value}; setSkills(n); setDirty(true); }} onBlur={()=>setEditingSkill(null)} onKeyDown={e=>e.key==='Enter'&&setEditingSkill(null)} style={{ padding:'3px 7px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none', width:'100%' }}/> : <span style={{ fontWeight:600, color:T.ink, fontFamily:T.sans }}>{s.name}</span>,
                    cat:   <span style={{ fontSize:12, color:T.inkMid, fontFamily:T.sans }}>{s.category}</span>,
                    cert:  s.cert ? <span style={{ fontSize:11, padding:'1px 7px', borderRadius:8, background:`${T.info}14`, color:T.info, fontWeight:600 }}>{s.cert}</span> : <span style={{ fontSize:11, color:T.inkMuted, fontStyle:'italic' }}>—</span>,
                    color: <span style={{ display:'inline-block', width:18, height:18, borderRadius:3, background:s.color, border:`1px solid ${T.border}` }}/>,
                    techs: <span style={{ fontSize:12, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace' }}>{s.techs||0}</span>,
                    more:  <button onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setSkillMenu(skillMenu?.id===s.id?null:{id:s.id,idx:i,rect:{top:r.bottom+4,right:window.innerWidth-r.right}});}} style={{background:'none',border:'none',cursor:'pointer',color:T.inkMuted,fontSize:16,fontWeight:700,padding:'0 2px',lineHeight:1}}>⋯</button>,
                }))}/>
                {addingSkill ? (
                    <div style={{ display:'flex', gap:8, alignItems:'center', padding:'10px 0', flexWrap:'wrap' }}>
                        <input value={newSkill.name} onChange={e=>setNewSkill(p=>({...p,name:e.target.value}))} placeholder="Skill name" autoFocus
                            style={{ padding:'6px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none', flex:1, minWidth:120 }}/>
                        <select value={newSkill.category} onChange={e=>setNewSkill(p=>({...p,category:e.target.value}))}
                            style={{ padding:'6px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12, fontFamily:T.sans, outline:'none' }}>
                            {SKILL_CATS.map(c=><option key={c}>{c}</option>)}
                        </select>
                        <div style={{ display:'flex', gap:4 }}>
                            {COLORS.map(c=>(
                                <div key={c} onClick={()=>setNewSkill(p=>({...p,color:c}))}
                                    style={{ width:20, height:20, borderRadius:3, background:c, cursor:'pointer', outline:newSkill.color===c?`2px solid ${T.ink}`:'none', outlineOffset:1 }}/>
                            ))}
                        </div>
                        <button onClick={()=>{ if(!newSkill.name.trim()) return; setSkills(p=>[...p,{id:'sk_'+Date.now(),...newSkill}]); setNewSkill({name:'',category:'Field',color:'#7a5a3c'}); setAddingSkill(false); setDirty(true); }}
                            style={{ padding:'6px 12px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Add</button>
                        <button onClick={()=>setAddingSkill(false)}
                            style={{ padding:'6px 10px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                    </div>
                ) : (
                    <button onClick={()=>setAddingSkill(true)}
                        style={{ marginTop:10, padding:'6px 14px', background:T.surface, border:`1px solid ${T.borderStrong}`, fontWeight:600, color:T.ink, borderRadius:T.r, fontSize:12.5, color:T.inkMid, cursor:'pointer', fontFamily:T.sans }}>
                        + Add skill
                    </button>
                )}
            </CSectionCard>

            <CSectionCard title="Certifications" desc="Certs with expiry tracking. Expired certs block auto-scheduling.">
                <SPTable columns={[
                    { key:'name',    label:'Cert',         w:'1fr' },
                    { key:'gates',   label:'Gates skill',  w:'1fr' },
                    { key:'renewal', label:'Renewal',      w:'100px' },
                    { key:'holding', label:'Techs',        w:'60px' },
                    { key:'exp30',   label:'Expiring 30d', w:'90px' },
                    { key:'more',    label:'',             w:'28px' },
                ]} rows={certs.map((c,i) => ({
                    name:    editingCert===c.id ? <input autoFocus value={c.name} onChange={e=>{ const n=[...certs]; n[i]={...n[i],name:e.target.value}; setCerts(n); setDirty(true); }} onBlur={()=>setEditingCert(null)} onKeyDown={e=>e.key==='Enter'&&setEditingCert(null)} style={{ padding:'3px 7px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none', width:'100%' }}/> : <span style={{ fontWeight:600, color:T.ink, fontFamily:T.sans }}>{c.name}</span>,
                    gates:   c.gatesSkill ? <span style={{ fontSize:12, color:T.inkMid, fontFamily:T.sans }}>{c.gatesSkill}</span> : <span style={{ fontSize:11, color:T.inkMuted, fontStyle:'italic' }}>none — informational</span>,
                    renewal: <span style={{ fontSize:12, fontFamily:'ui-monospace,Menlo,monospace', color:T.inkMid }}>{Math.round((c.renewalDays||365)/30)} months</span>,
                    holding: <span style={{ fontSize:12, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace' }}>{c.techsHolding||0}</span>,
                    exp30:   (c.expiringIn30d||0)>0 ? <span style={{ fontSize:12, fontWeight:700, color:T.warn }}>{c.expiringIn30d} ⚠</span> : <span style={{ fontSize:12, color:T.inkMuted }}>0</span>,
                    more:    <button onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setCertMenu(certMenu?.id===c.id?null:{id:c.id,idx:i,rect:{top:r.bottom+4,right:window.innerWidth-r.right}});}} style={{background:'none',border:'none',cursor:'pointer',color:T.inkMuted,fontSize:16,fontWeight:700,padding:'0 2px',lineHeight:1}}>⋯</button>,
                }))}/>
                {addingCert ? (
                    <div style={{ display:'flex', gap:8, alignItems:'center', padding:'10px 0' }}>
                        <input value={newCert.name} onChange={e=>setNewCert(p=>({...p,name:e.target.value}))} placeholder="Cert name e.g. EPA 608" autoFocus
                            style={{ padding:'6px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none', flex:1 }}/>
                        <input type="number" value={newCert.renewalDays} onChange={e=>setNewCert(p=>({...p,renewalDays:parseInt(e.target.value)||365}))}
                            style={{ width:70, padding:'6px 8px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12, fontFamily:T.sans, outline:'none' }}/>
                        <span style={{ fontSize:12, color:T.inkMid }}>days</span>
                        <button onClick={()=>{ if(!newCert.name.trim()) return; setCerts(p=>[...p,{id:'cert_'+Date.now(),...newCert}]); setNewCert({name:'',renewalDays:365}); setAddingCert(false); setDirty(true); }}
                            style={{ padding:'6px 12px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Add</button>
                        <button onClick={()=>setAddingCert(false)}
                            style={{ padding:'6px 10px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                    </div>
                ) : (
                    <button onClick={()=>setAddingCert(true)}
                        style={{ marginTop:10, padding:'6px 14px', background:T.surface, border:`1px solid ${T.borderStrong}`, fontWeight:600, color:T.ink, borderRadius:T.r, fontSize:12.5, color:T.inkMid, cursor:'pointer', fontFamily:T.sans }}>
                        + Add certification
                    </button>
                )}
            </CSectionCard>

            <CSectionCard title="License levels" desc="Ordered hierarchy. Jobs specify a minimum level required.">
                <div style={{ border:`1px solid ${T.border}`, borderRadius:T.r, overflow:'visible' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'40px 1fr 70px 100px 28px', gap:12, padding:'8px 14px', background:T.surface2, fontSize:10, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.5, fontFamily:T.sans, borderBottom:`1px solid ${T.border}` }}>
                        <div>Rank</div><div>Name</div><div>Techs</div><div>Jobs requiring</div><div/>
                    </div>
                    {licenses.map((l,i)=>(
                        <div key={i} style={{ display:'grid', gridTemplateColumns:'40px 1fr 70px 100px 28px', gap:12, padding:'10px 14px', alignItems:'center', borderBottom:i<licenses.length-1?`1px solid ${T.border}`:'none', fontSize:13, fontFamily:T.sans }}>
                            <span style={{ fontSize:11, fontWeight:700, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace' }}>{i+1}</span>
                            <input value={l} onChange={e=>{ const n=[...licenses]; n[i]=e.target.value; setLicenses(n); setDirty(true); }}
                                style={{ border:'none', outline:'none', background:'transparent', fontSize:13, fontWeight:600, color:T.ink, fontFamily:T.sans, width:'100%' }}/>
                            <span style={{ fontSize:12, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace' }}>—</span>
                            <span style={{ fontSize:12, color:T.inkMuted, fontFamily:T.sans }}>—</span>
                            <button onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setLicMenu(licMenu?.id===`lic_${i}`?null:{id:`lic_${i}`,idx:i,rect:{top:r.bottom+4,right:window.innerWidth-r.right}});}} style={{background:'none',border:'none',cursor:'pointer',color:T.inkMuted,fontSize:16,fontWeight:700,padding:'0 2px',lineHeight:1}}>⋯</button>
                        </div>
                    ))}
                </div>
                <button onClick={()=>{ setLicenses(p=>[...p,'New level']); setDirty(true); }}
                    style={{ marginTop:8, padding:'6px 12px', background:T.surface, border:`1px solid ${T.borderStrong}`, fontWeight:600, color:T.ink, borderRadius:T.r, fontSize:12.5, color:T.inkMid, cursor:'pointer', fontFamily:T.sans }}>
                    + Add level
                </button>
            </CSectionCard>

            {/* ── Skill row kebab dropdown ── */}
            {skillMenu && skillMenu.rect && (() => {
                const s = skills[skillMenu.idx];
                if (!s) return null;
                return (
                    <>
                        <div style={{position:'fixed',inset:0,zIndex:9998}} onClick={()=>setSkillMenu(null)}/>
                        <div style={{position:'fixed',top:skillMenu.rect.top,right:skillMenu.rect.right,zIndex:9999,background:T.surface,border:`1px solid ${T.border}`,borderRadius:T.r+2,boxShadow:'0 4px 16px rgba(42,38,34,0.12)',minWidth:140,overflow:'hidden'}}>
                            <button onClick={()=>{setEditingSkill(s.id);setSkillMenu(null);}} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',textAlign:'left',fontSize:13,color:T.ink,cursor:'pointer',fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background='none'}>Edit</button>
                            <button onClick={()=>{if((s.techs||0)>0)return;setSkills(prev=>prev.filter((_,ri)=>ri!==skillMenu.idx));setDirty(true);setSkillMenu(null);}} disabled={(s.techs||0)>0} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',borderTop:`1px solid ${T.border}`,textAlign:'left',fontSize:13,color:(s.techs||0)>0?T.inkMuted:T.danger,cursor:(s.techs||0)>0?'default':'pointer',fontFamily:T.sans,opacity:(s.techs||0)>0?0.5:1}} onMouseEnter={e=>e.currentTarget.style.background='rgba(156,58,46,0.06)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                                Delete{(s.techs||0)>0 && <div style={{fontSize:10.5,color:T.inkMuted,marginTop:2}}>Used by {s.techs} tech{s.techs===1?'':'s'}</div>}
                            </button>
                        </div>
                    </>
                );
            })()}

            {/* ── Cert row kebab dropdown ── */}
            {certMenu && certMenu.rect && (() => {
                const c = certs[certMenu.idx];
                if (!c) return null;
                return (
                    <>
                        <div style={{position:'fixed',inset:0,zIndex:9998}} onClick={()=>setCertMenu(null)}/>
                        <div style={{position:'fixed',top:certMenu.rect.top,right:certMenu.rect.right,zIndex:9999,background:T.surface,border:`1px solid ${T.border}`,borderRadius:T.r+2,boxShadow:'0 4px 16px rgba(42,38,34,0.12)',minWidth:140,overflow:'hidden'}}>
                            <button onClick={()=>{setEditingCert(c.id);setCertMenu(null);}} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',textAlign:'left',fontSize:13,color:T.ink,cursor:'pointer',fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background='none'}>Edit</button>
                            <button onClick={()=>{if((c.techsHolding||0)>0)return;setCerts(prev=>prev.filter((_,ri)=>ri!==certMenu.idx));setDirty(true);setCertMenu(null);}} disabled={(c.techsHolding||0)>0} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',borderTop:`1px solid ${T.border}`,textAlign:'left',fontSize:13,color:(c.techsHolding||0)>0?T.inkMuted:T.danger,cursor:(c.techsHolding||0)>0?'default':'pointer',fontFamily:T.sans,opacity:(c.techsHolding||0)>0?0.5:1}} onMouseEnter={e=>e.currentTarget.style.background='rgba(156,58,46,0.06)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                                Delete{(c.techsHolding||0)>0 && <div style={{fontSize:10.5,color:T.inkMuted,marginTop:2}}>Held by {c.techsHolding} tech{c.techsHolding===1?'':'s'}</div>}
                            </button>
                        </div>
                    </>
                );
            })()}

            {/* ── License row kebab dropdown ── */}
            {licMenu && licMenu.rect && (() => {
                const i = licMenu.idx;
                return (
                    <>
                        <div style={{position:'fixed',inset:0,zIndex:9998}} onClick={()=>setLicMenu(null)}/>
                        <div style={{position:'fixed',top:licMenu.rect.top,right:licMenu.rect.right,zIndex:9999,background:T.surface,border:`1px solid ${T.border}`,borderRadius:T.r+2,boxShadow:'0 4px 16px rgba(42,38,34,0.12)',minWidth:140,overflow:'hidden'}}>
                            <button onClick={()=>setLicMenu(null)} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',textAlign:'left',fontSize:13,color:T.ink,cursor:'pointer',fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background='none'}>Rename</button>
                            <button onClick={()=>{if(licenses.length<=1)return;setLicenses(p=>p.filter((_,ri)=>ri!==i));setDirty(true);setLicMenu(null);}} disabled={licenses.length<=1} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',borderTop:`1px solid ${T.border}`,textAlign:'left',fontSize:13,color:licenses.length<=1?T.inkMuted:T.danger,cursor:licenses.length<=1?'default':'pointer',fontFamily:T.sans,opacity:licenses.length<=1?0.5:1}} onMouseEnter={e=>e.currentTarget.style.background='rgba(156,58,46,0.06)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                                Delete{licenses.length<=1 && <div style={{fontSize:10.5,color:T.inkMuted,marginTop:2}}>Need at least one level</div>}
                            </button>
                        </div>
                    </>
                );
            })()}
        </CategoryDetailChrome>
    );
};
