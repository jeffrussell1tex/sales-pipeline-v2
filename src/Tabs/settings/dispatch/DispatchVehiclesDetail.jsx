// settings/dispatch/DispatchVehiclesDetail.jsx
import React, { useState, useEffect } from 'react';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { CSectionCard } from '../shared/form.jsx';
import { SPTable } from '../salesProcess/shared.jsx';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';

export const DispatchVehiclesDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {
    const saved = settings?.dispatchVehicles || [];
    const [vehicles, setVehicles] = useState(() => JSON.parse(JSON.stringify(saved)));
    const [dirty,    setDirty]    = useState(false);
    const [saving,   setSaving]   = useState(false);
    const [showAdd,  setShowAdd]  = useState(false);
    const [newV,     setNewV]     = useState({ name:'', type:'Van', plate:'', notes:'' });
    const savedEquipment = settings?.dispatchEquipment || [];
    const [equipment, setEquipment] = useState(() => JSON.parse(JSON.stringify(savedEquipment)));
    const [showAddEquip, setShowAddEquip] = useState(false);
    const [newEquip, setNewEquip] = useState({ name:'', qty:1, share:true, notes:'' });
    const [vehMenu,   setVehMenu]   = useState(null);
    const [equipMenu, setEquipMenu] = useState(null);

    const handleSave = async () => {
        setSaving(true);
        setSettings(prev => ({ ...prev, dispatchVehicles: vehicles, dispatchEquipment: equipment }));
        try { await dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ dispatchVehicles: vehicles, dispatchEquipment: equipment }) }); }
        catch(e) { console.error('save vehicles', e); }
        setSaving(false); setDirty(false);
    };

    React.useEffect(() => { if (setSettingsDirty) setSettingsDirty(dirty); return () => { if (setSettingsDirty) setSettingsDirty(false); }; }, [dirty]);
    React.useEffect(() => {
        if (!settingsSaveRef) return;
        settingsSaveRef.current = dirty ? handleSave : null;
        return () => { if (settingsSaveRef) settingsSaveRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dirty]);

    const TYPES = ['Van','Truck','Car','Trailer','Other'];
    return (
        <CategoryDetailChrome crumb="Vehicles & equipment" category="Dispatch" title="Vehicles & equipment"
            subtitle="Fleet vehicles available to assign to techs."
            onBack={onBack} dirty={dirty}
            onCancel={() => { setVehicles(JSON.parse(JSON.stringify(saved))); setDirty(false); }}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
            extraActions={
                <>
                    <button style={{ padding:'7px 14px', background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:500, color:T.inkMid, cursor:'pointer', fontFamily:T.sans }}>Export CSV</button>
                </>
            }>
            <CSectionCard title="Fleet vehicles" desc="Assign vehicles to techs in Settings → People & Teams.">
                <SPTable columns={[
                    { key:'name',   label:'Vehicle',          w:'1.2fr' },
                    { key:'kind',   label:'Kind',             w:'110px' },
                    { key:'payload',label:'Payload',          w:'90px' },
                    { key:'tech',   label:'Assigned to',      w:'1fr' },
                    { key:'equip',  label:'On-board equipment', w:'1.5fr' },
                    { key:'status', label:'Status',           w:'80px' },
                    { key:'more',   label:'',                 w:'28px' },
                ]} rows={vehicles.map((v,i)=>({
                    name:   <span style={{ fontWeight:600, color:T.ink, fontFamily:T.sans }}>{v.name}</span>,
                    kind:   <span style={{ fontSize:12, color:T.inkMid, fontFamily:T.sans }}>{v.type||v.kind||'—'}</span>,
                    payload:<span style={{ fontSize:12, color:T.inkMuted, fontFamily:T.sans }}>{v.payload||'—'}</span>,
                    tech:   v.assignedTo && v.assignedTo!=='—' ? <span style={{ fontSize:12, fontWeight:500, color:T.ink, fontFamily:T.sans }}>{v.assignedTo}</span> : <span style={{ fontSize:11.5, color:T.inkMuted, fontStyle:'italic' }}>Unassigned</span>,
                    equip:  <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>{(v.equip||[]).map(e=><span key={e} style={{ fontSize:10.5, padding:'1px 6px', borderRadius:4, background:T.surface2, border:`1px solid ${T.border}`, color:T.inkMid }}>{e}</span>)}</div>,
                    status: <span style={{ fontSize:11, padding:'2px 8px', borderRadius:3, fontWeight:600, background:v.status==='Active'?`${T.ok}14`:`${T.warn}14`, color:v.status==='Active'?T.ok:T.warn }}>{v.status||'Active'}</span>,
                    more:   <button onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setVehMenu(vehMenu?.id===v.id?null:{id:v.id,idx:i,v,rect:{top:r.bottom+4,right:window.innerWidth-r.right}});}} style={{background:'none',border:'none',cursor:'pointer',color:T.inkMuted,fontSize:16,fontWeight:700,padding:'0 2px',lineHeight:1}}>⋯</button>,
                }))}/>
                {showAdd ? (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 90px 100px 1.5fr auto auto', gap:8, alignItems:'center', padding:'10px 0' }}>
                        <input value={newV.name} onChange={e=>setNewV(p=>({...p,name:e.target.value}))} placeholder="Van 1, Truck A…" autoFocus
                            style={{ padding:'6px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none' }}/>
                        <select value={newV.type} onChange={e=>setNewV(p=>({...p,type:e.target.value}))}
                            style={{ padding:'6px 8px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12, fontFamily:T.sans, outline:'none' }}>
                            {TYPES.map(t=><option key={t}>{t}</option>)}
                        </select>
                        <input value={newV.plate} onChange={e=>setNewV(p=>({...p,plate:e.target.value}))} placeholder="Plate #"
                            style={{ padding:'6px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12, fontFamily:T.sans, outline:'none' }}/>
                        <input value={newV.notes} onChange={e=>setNewV(p=>({...p,notes:e.target.value}))} placeholder="e.g. Recovery cart, MC4 kit"
                            style={{ padding:'6px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12, fontFamily:T.sans, outline:'none' }}/>
                        <button onClick={()=>{ if(!newV.name.trim()) return; setVehicles(p=>[...p,{id:'v_'+Date.now(),...newV}]); setNewV({name:'',type:'Van',plate:'',notes:''}); setShowAdd(false); setDirty(true); }}
                            style={{ padding:'6px 12px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Add</button>
                        <button onClick={()=>setShowAdd(false)}
                            style={{ padding:'6px 10px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                    </div>
                ) : (
                    <button onClick={()=>setShowAdd(true)} style={{ marginTop:10, padding:'6px 14px', background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, color:T.ink, cursor:'pointer', fontFamily:T.sans }}>+ Add vehicle</button>
                )}
            </CSectionCard>

            <CSectionCard title="Shared equipment" desc="Tools/kits stored at HQ or shared across vehicles. Match scoring deducts when a job needs an item that isn't available.">
                <SPTable columns={[
                    { key:'name',  label:'Item',           w:'1.5fr' },
                    { key:'qty',   label:'Quantity',       w:'80px' },
                    { key:'share', label:'Shared / Per-van', w:'110px' },
                    { key:'notes', label:'Notes',          w:'1.5fr' },
                    { key:'more',  label:'',               w:'28px' },
                ]} rows={equipment.map((eq,i)=>({name:  <span style={{ fontWeight:600, color:T.ink, fontFamily:T.sans }}>{eq.name}</span>,
                    qty:   <span style={{ fontSize:12, fontFamily:'ui-monospace,Menlo,monospace', color:T.inkMid }}>{eq.qty||1}</span>,
                    share: <span style={{ fontSize:11, padding:'2px 8px', borderRadius:3, fontWeight:600, background:eq.share?`${T.info}14`:`${T.ok}14`, color:eq.share?T.info:T.ok }}>{eq.share?'Shared':'Per-van'}</span>,
                    notes: <span style={{ fontSize:11.5, color:T.inkMuted, fontFamily:T.sans }}>{eq.notes||'—'}</span>,
                    more:  <button onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setEquipMenu(equipMenu?.id===eq.id?null:{id:eq.id,idx:i,eq,rect:{top:r.bottom+4,right:window.innerWidth-r.right}});}} style={{background:'none',border:'none',cursor:'pointer',color:T.inkMuted,fontSize:16,fontWeight:700,padding:'0 2px',lineHeight:1}}>⋯</button>,
                }))}/>
                {showAddEquip ? (
                    <div style={{ display:'grid', gridTemplateColumns:'1.5fr 70px 110px 1.5fr auto auto', gap:8, alignItems:'center', padding:'10px 0' }}>
                        <input value={newEquip.name} onChange={e=>setNewEquip(p=>({...p,name:e.target.value}))} placeholder="Item name" autoFocus style={{ padding:'6px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none' }}/>
                        <input type="number" value={newEquip.qty} onChange={e=>setNewEquip(p=>({...p,qty:parseInt(e.target.value)||1}))} style={{ padding:'6px 8px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12, fontFamily:T.sans, outline:'none' }}/>
                        <select value={newEquip.share?'Shared':'Per-van'} onChange={e=>setNewEquip(p=>({...p,share:e.target.value==='Shared'}))} style={{ padding:'6px 8px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12, fontFamily:T.sans, outline:'none' }}><option>Shared</option><option>Per-van</option></select>
                        <input value={newEquip.notes} onChange={e=>setNewEquip(p=>({...p,notes:e.target.value}))} placeholder="Notes" style={{ padding:'6px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12, fontFamily:T.sans, outline:'none' }}/>
                        <button onClick={()=>{if(!newEquip.name.trim())return;setEquipment(p=>[...p,{id:'eq_'+Date.now(),...newEquip}]);setNewEquip({name:'',qty:1,share:true,notes:''});setShowAddEquip(false);setDirty(true);}} style={{ padding:'6px 12px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Add</button>
                        <button onClick={()=>setShowAddEquip(false)} style={{ padding:'6px 10px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                    </div>
                ) : (
                    <button onClick={()=>setShowAddEquip(true)} style={{ marginTop:10, padding:'6px 14px', background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, color:T.ink, cursor:'pointer', fontFamily:T.sans }}>+ Add item</button>
                )}
            </CSectionCard>

            {/* ── Vehicle row kebab ── */}
            {vehMenu && vehMenu.rect && (() => {
                const {idx, v} = vehMenu;
                const assigned = v.assignedTo && v.assignedTo !== '—';
                return (<>
                    <div style={{position:'fixed',inset:0,zIndex:9998}} onClick={()=>setVehMenu(null)}/>
                    <div style={{position:'fixed',top:vehMenu.rect.top,right:vehMenu.rect.right,zIndex:9999,background:T.surface,border:`1px solid ${T.border}`,borderRadius:T.r+2,boxShadow:'0 4px 16px rgba(42,38,34,0.12)',minWidth:148,overflow:'hidden'}}>
                        <button onClick={()=>setVehMenu(null)} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',textAlign:'left',fontSize:13,color:T.ink,cursor:'pointer',fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background='none'}>Edit</button>
                        <button onClick={()=>{const n=[...vehicles];n[idx]={...n[idx],status:v.status==='Active'?'In shop':'Active'};setVehicles(n);setDirty(true);setVehMenu(null);}} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',borderTop:`1px solid ${T.border}`,textAlign:'left',fontSize:13,color:T.ink,cursor:'pointer',fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background='none'}>{v.status==='Active'?'Mark in shop':'Mark active'}</button>
                        <button onClick={()=>{if(assigned)return;setVehicles(p=>p.filter((_,ri)=>ri!==idx));setDirty(true);setVehMenu(null);}} disabled={assigned} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',borderTop:`1px solid ${T.border}`,textAlign:'left',fontSize:13,color:assigned?T.inkMuted:T.danger,cursor:assigned?'default':'pointer',fontFamily:T.sans,opacity:assigned?0.5:1}} onMouseEnter={e=>e.currentTarget.style.background='rgba(156,58,46,0.06)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                            Delete{assigned&&<div style={{fontSize:10.5,color:T.inkMuted,marginTop:2}}>Assigned to {v.assignedTo}</div>}
                        </button>
                    </div>
                </>);
            })()}

            {/* ── Equipment row kebab ── */}
            {equipMenu && equipMenu.rect && (() => {
                const {idx, eq} = equipMenu;
                return (<>
                    <div style={{position:'fixed',inset:0,zIndex:9998}} onClick={()=>setEquipMenu(null)}/>
                    <div style={{position:'fixed',top:equipMenu.rect.top,right:equipMenu.rect.right,zIndex:9999,background:T.surface,border:`1px solid ${T.border}`,borderRadius:T.r+2,boxShadow:'0 4px 16px rgba(42,38,34,0.12)',minWidth:148,overflow:'hidden'}}>
                        <button onClick={()=>setEquipMenu(null)} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',textAlign:'left',fontSize:13,color:T.ink,cursor:'pointer',fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background='none'}>Edit</button>
                        <button onClick={()=>{const n=[...equipment];n[idx]={...n[idx],share:!eq.share};setEquipment(n);setDirty(true);setEquipMenu(null);}} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',borderTop:`1px solid ${T.border}`,textAlign:'left',fontSize:13,color:T.ink,cursor:'pointer',fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background='none'}>Toggle shared / per-van</button>
                        <button onClick={()=>{setEquipment(p=>p.filter((_,ri)=>ri!==idx));setDirty(true);setEquipMenu(null);}} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',borderTop:`1px solid ${T.border}`,textAlign:'left',fontSize:13,color:T.danger,cursor:'pointer',fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background='rgba(156,58,46,0.06)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>Delete</button>
                    </div>
                </>);
            })()}
        </CategoryDetailChrome>
    );
};
