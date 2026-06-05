// settings/people/TerritoriesDetail.jsx
import React, { useState, useEffect } from 'react';
import { useApp } from '../../../AppContext';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { UserAvatar } from '../shared/ui.jsx';

const TerritoryModal = ({ mode, territory, settings, setSettings, onClose }) => {
    // mode: 'new' | 'edit' | 'owner' | 'reps' | 'rule'
    const allUsers   = (settings.users || []).filter(u => u.name);
    const territories = settings.territories || [];

    const [name,    setName]    = useState(territory?.name    || '');
    const [parent,  setParent]  = useState(territory?.parent  || '');
    const [rule,    setRule]    = useState(territory?.rule    || '');
    const [ownerId, setOwnerId] = useState(territory?.ownerId || '');
    const [repIds,  setRepIds]  = useState(territory?.repIds  || []);
    const [saving,  setSaving]  = useState(false);
    const [err,     setErr]     = useState('');

    const owners = allUsers; // any user can own a territory
    const reps   = allUsers;
    const toggleRep = (id) => setRepIds(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);

    const save = async () => {
        if ((mode === 'new' || mode === 'edit') && !name.trim()) { setErr('Name is required.'); return; }
        setSaving(true); setErr('');
        try {
            let updatedTerritories = [...territories];
            let updatedUsers = [...allUsers];

            if (mode === 'new') {
                const newT = { id:`terr_${Date.now()}`, name:name.trim(), parent:parent.trim(), rule:rule.trim(), ownerId, repIds, accounts:0, pipeline:'—', status: ownerId ? 'Active' : 'Unassigned' };
                updatedTerritories = [...territories, newT];
            } else if (mode === 'edit') {
                const oldName = territory.name;
                updatedTerritories = territories.map(t => t.id === territory.id ? { ...t, name:name.trim(), parent:parent.trim() } : t);
                // Sync rename onto users
                updatedUsers = allUsers.map(u => u.territory === oldName ? { ...u, territory: name.trim() } : u);
            } else if (mode === 'rule') {
                updatedTerritories = territories.map(t => t.id === territory.id ? { ...t, rule:rule.trim() } : t);
            } else if (mode === 'owner') {
                const owner = allUsers.find(u => u.id === ownerId);
                updatedTerritories = territories.map(t => t.id === territory.id
                    ? { ...t, ownerId, ownerInit: owner ? owner.name.slice(0,2).toUpperCase() : null, owner: owner?.name || 'Unassigned', status: owner ? 'Active' : 'Unassigned' }
                    : t);
            } else if (mode === 'reps') {
                updatedTerritories = territories.map(t => t.id === territory.id ? { ...t, repIds, reps: repIds.length } : t);
                // Update u.territory for added/removed reps
                updatedUsers = allUsers.map(u => {
                    if (repIds.includes(u.id)) return { ...u, territory: territory.name };
                    if ((territory.repIds||[]).includes(u.id) && !repIds.includes(u.id)) return { ...u, territory: '' };
                    return u;
                });
            }

            const res  = await dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ territories: updatedTerritories }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Save failed');

            // Persist changed users
            const changedUsers = updatedUsers.filter((u, i) => allUsers[i] && u.territory !== allUsers[i].territory);
            for (const u of changedUsers) {
                try { await dbFetch('/.netlify/functions/users', { method:'PUT', body: JSON.stringify({ id: u.id, territory: u.territory }) }); } catch(e) {}
            }

            setSettings(prev => ({ ...prev, territories: updatedTerritories, users: updatedUsers }));
            onClose();
        } catch(e) {
            setErr(e.message || 'Save failed.');
        } finally { setSaving(false); }
    };

    const title = { new:'New territory', edit:'Edit territory', owner:'Assign owner', reps:'Assign reps', rule:'Edit rule' }[mode];
    const inp = { width:'100%', padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, background:T.surface, fontFamily:T.sans, outline:'none', boxSizing:'border-box' };
    const lbl = { display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 };
    const sel = { ...inp, cursor:'pointer' };
    const parentOptions = [...new Set(territories.map(t => t.parent).filter(Boolean))];

    return (
        <div style={{ position:'fixed', inset:0, background:'rgba(42,38,34,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onClose}>
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, width:460, maxHeight:'88vh', overflowY:'auto', boxShadow:'0 8px 32px rgba(42,38,34,0.18)', fontFamily:T.sans }} onClick={e=>e.stopPropagation()}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:`1px solid ${T.border}`, position:'sticky', top:0, background:T.surface, zIndex:1 }}>
                    <div style={{ fontSize:15, fontWeight:700, color:T.ink }}>{title}</div>
                    <button onClick={onClose} style={{ background:'none', border:'none', fontSize:18, color:T.inkMuted, cursor:'pointer' }}>×</button>
                </div>
                <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:14 }}>
                    {(mode === 'new' || mode === 'edit') && <>
                        <div>
                            <label style={lbl}>Territory name *</label>
                            <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. NAM West" style={inp} autoFocus/>
                        </div>
                        <div>
                            <label style={lbl}>Parent territory</label>
                            <input value={parent} onChange={e=>setParent(e.target.value)}
                                placeholder={parentOptions.length ? parentOptions.join(', ') : 'e.g. NAM, EMEA'}
                                list="parent-opts" style={inp}/>
                            <datalist id="parent-opts">{parentOptions.map(p=><option key={p} value={p}/>)}</datalist>
                        </div>
                    </>}
                    {mode === 'rule' && (
                        <div>
                            <label style={lbl}>Assignment rule</label>
                            <input value={rule} onChange={e=>setRule(e.target.value)}
                                placeholder='e.g. State ∈ {CA, OR, WA}' style={inp} autoFocus/>
                            <div style={{ fontSize:11, color:T.inkMuted, marginTop:5 }}>Descriptive — used for display and routing reference only.</div>
                        </div>
                    )}
                    {mode === 'owner' && (
                        <div>
                            <label style={lbl}>Territory owner</label>
                            <select value={ownerId} onChange={e=>setOwnerId(e.target.value)} style={sel} autoFocus>
                                <option value="">— Unassigned —</option>
                                {owners.map(u => <option key={u.id} value={u.id}>{u.name} · {u.userType||u.role||'User'}</option>)}
                            </select>
                        </div>
                    )}
                    {mode === 'reps' && (
                        <div>
                            <label style={lbl}>Sales reps ({repIds.length} assigned)</label>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, maxHeight:220, overflowY:'auto', padding:8, border:`1px solid ${T.border}`, borderRadius:T.r }}>
                                {reps.map(u => {
                                    const selected = repIds.includes(u.id);
                                    return (
                                        <div key={u.id} onClick={()=>toggleRep(u.id)}
                                            style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 8px', borderRadius:4, cursor:'pointer', background: selected ? 'rgba(58,90,122,0.08)' : T.surface2, border: selected ? `1px solid rgba(58,90,122,0.25)` : `1px solid ${T.border}`, userSelect:'none' }}>
                                            <span style={{ width:14, height:14, borderRadius:3, border: selected?'none':`1.5px solid ${T.border}`, background: selected?T.info:'transparent', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                                                {selected && <span style={{ color:'#fff', fontSize:9, fontWeight:700 }}>✓</span>}
                                            </span>
                                            <div>
                                                <div style={{ fontSize:12.5, fontWeight:600, color:T.ink }}>{u.name}</div>
                                                <div style={{ fontSize:10.5, color:T.inkMuted }}>{u.userType||'User'}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    {err && <div style={{ fontSize:12, color:T.danger, fontWeight:600 }}>{err}</div>}
                </div>
                <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'14px 20px', borderTop:`1px solid ${T.border}`, position:'sticky', bottom:0, background:T.surface }}>
                    <button onClick={onClose} style={{ padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                    <button onClick={save} disabled={saving} style={{ padding:'7px 16px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:T.sans, opacity:saving?0.7:1 }}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export const TerritoriesDetail = ({ settings, setSettings, onBack }) => {
    const { showConfirm } = useApp();
    const allUsers    = (settings.users || []).filter(u => u.name);
    const territories = settings.territories || [];

    const [openTerrKebab, setOpenTerrKebab] = useState(null);
    const [modal,         setModal]         = useState(null); // { mode, territory }

    React.useEffect(() => {
        if (openTerrKebab === null) return;
        const h = () => setOpenTerrKebab(null);
        document.addEventListener('click', h);
        return () => document.removeEventListener('click', h);
    }, [openTerrKebab]);

    const openModal = (mode, territory = null) => { setOpenTerrKebab(null); setModal({ mode, territory }); };

    const handleImportCSV = () => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.csv,text/csv';
        input.onchange = async (ev) => {
            const file = ev.target.files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                const rows = text.split(/\r?\n/).filter(l => l.trim());
                if (rows.length < 2) { window.alert('No rows found in the CSV.'); return; }
                const parseLine = (line) => { const c=[]; let cur=''; let q=false; for (let i=0;i<line.length;i++){ const ch=line[i]; if(q){ if(ch==='"'){ if(line[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=ch; } else if(ch===','){ c.push(cur); cur=''; } else if(ch==='"'){ q=true; } else cur+=ch; } c.push(cur); return c; };
                const header = parseLine(rows[0]).map(h => h.trim().toLowerCase());
                const col = (names) => { for (const n of names) { const i = header.indexOf(n); if (i>=0) return i; } return -1; };
                const iName = col(['name','territory','territory name']);
                if (iName < 0) { window.alert('CSV must include a "Name" column.'); return; }
                const iParent = col(['parent']); const iRule = col(['rule']);
                const parsed = rows.slice(1).map(parseLine).filter(c => (c[iName]||'').trim());
                const byName = new Map(territories.map(tr => [String(tr.name||'').toLowerCase(), tr]));
                parsed.forEach(c => {
                    const name = (c[iName]||'').trim(); const key = name.toLowerCase();
                    const parent = iParent>=0 ? (c[iParent]||'').trim() : '';
                    const rule   = iRule>=0   ? (c[iRule]||'').trim()   : '';
                    if (byName.has(key)) byName.set(key, { ...byName.get(key), parent, rule });
                    else byName.set(key, { id:'terr_'+crypto.randomUUID(), name, parent, rule, ownerId:'', repIds:[], accounts:0, pipeline:'—', status:'Unassigned' });
                });
                const updated = Array.from(byName.values());
                const res = await dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ territories: updated }) });
                if (res.ok) { setSettings(prev => ({ ...prev, territories: updated })); window.alert(`Imported ${parsed.length} territor${parsed.length===1?'y':'ies'}.`); }
                else window.alert('Import failed to save. Please try again.');
            } catch (e) { console.error('territory CSV import', e); window.alert('Could not import the CSV. Please check the format.'); }
        };
        input.click();
    };

    const handleDelete = (tr) => {
        setOpenTerrKebab(null);
        showConfirm(`Delete territory "${tr.name}"? Assigned reps will become unassigned.`, async () => {
            const updatedTerritories = territories.filter(t => t.id !== tr.id);
            const updatedUsers = allUsers.map(u => u.territory === tr.name ? { ...u, territory: '' } : u);
            try {
                const res = await dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ territories: updatedTerritories }) });
                if (res.ok) {
                    for (const u of allUsers.filter(u => u.territory === tr.name)) {
                        try { await dbFetch('/.netlify/functions/users', { method:'PUT', body: JSON.stringify({ id: u.id, territory: '' }) }); } catch(e) {}
                    }
                    setSettings(prev => ({ ...prev, territories: updatedTerritories, users: updatedUsers }));
                }
            } catch(e) { console.error('Delete territory failed', e); }
        });
    };

    // Live stats
    const unassignedCount = territories.filter(t => !t.ownerId && t.status !== 'Active').length;
    const totalCount      = territories.length;

    // Resolve owner display from live users
    const resolveOwner = (tr) => {
        if (tr.ownerId) {
            const u = allUsers.find(u => u.id === tr.ownerId);
            return u ? { name: u.name, found: true } : { name: tr.owner || 'Unassigned', found: false };
        }
        return { name: tr.owner || 'Unassigned', found: false };
    };

    // Rep count from repIds or fall back to tr.reps
    const repCount = (tr) => tr.repIds ? tr.repIds.length : (tr.reps || 0);

    return (
    <div style={{ fontFamily:T.sans }}>
        {modal && (
            <TerritoryModal
                mode={modal.mode}
                territory={modal.territory}
                settings={settings}
                setSettings={setSettings}
                onClose={() => setModal(null)}/>
        )}

        {/* Breadcrumb */}
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:T.inkMuted, marginBottom:10 }}>
            <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>Settings</button>
            <span>/</span>
            <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>People & Teams</button>
            <span>/</span>
            <span style={{ color:T.ink, fontWeight:600 }}>Territories</span>
        </div>

        {/* Title band */}
        <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', paddingBottom:16, borderBottom:`1px solid ${T.border}`, marginBottom:20 }}>
            <div style={{ borderLeft:`3px solid ${T.goldInk}`, paddingLeft:10 }}>
                <div style={{ fontSize:22, fontWeight:700, color:T.ink, letterSpacing:-0.3 }}>Territories</div>
                <div style={{ fontSize:13, color:T.inkMid, marginTop:3, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    <span>Sales territory definitions and rep assignments</span>
                    <span style={{ color:T.inkMuted }}>•</span>
                    <span style={{ color:T.ok, fontWeight:600 }}>✓</span>
                    <span>
                        {totalCount} territor{totalCount!==1?'ies':'y'}
                        {unassignedCount > 0 && <> · <span style={{ color:T.warn, fontWeight:600 }}>{unassignedCount} unassigned</span></>}
                    </span>
                </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
                <button onClick={handleImportCSV} style={{ padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}
                    onMouseEnter={e=>e.currentTarget.style.background=T.surface2}
                    onMouseLeave={e=>e.currentTarget.style.background=T.surface}>Import CSV</button>
                <button onClick={() => openModal('new')}
                    style={{ padding:'7px 16px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:T.sans }}>
                    New territory
                </button>
            </div>
        </div>

        {/* Territory table */}
        <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8 }}>
            <div style={{ padding:'12px 16px 8px', borderBottom:`1px solid ${T.border}` }}>
                <div style={{ fontSize:13.5, fontWeight:700, color:T.ink }}>All territories</div>
                <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:2 }}>Click any row to edit its rule, owner, and rep assignments.</div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'24px 140px 80px 1fr 70px 80px 160px 50px 100px 32px', gap:8, padding:'8px 16px', background:T.surface2, borderBottom:`1px solid ${T.border}` }}>
                {['','TERRITORY','PARENT','RULE','ACCOUNTS','PIPELINE','OWNER','REPS','STATUS',''].map((h,i) => (
                    <div key={i} style={{ fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', fontFamily:T.sans }}>{h}</div>
                ))}
            </div>
            {territories.length === 0 ? (
                <div style={{ padding:'32px 16px', textAlign:'center', color:T.inkMuted, fontSize:13 }}>
                    No territories yet. Click <b>New territory</b> to create your first.
                </div>
            ) : territories.map((tr, i) => {
                const owner    = resolveOwner(tr);
                const isActive = owner.found || tr.status === 'Active';
                return (
                <div key={tr.id}
                    style={{ display:'grid', gridTemplateColumns:'24px 140px 80px 1fr 70px 80px 160px 50px 100px 32px', gap:8, padding:'10px 16px', borderBottom: i<territories.length-1 ? `1px solid ${T.border}` : 'none', alignItems:'center', cursor:'pointer', transition:'background 80ms' }}
                    onMouseEnter={e=>e.currentTarget.style.background=T.surface2}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                    onClick={() => openModal('edit', tr)}>
                    <span style={{ color:T.border, fontSize:14, cursor:'grab' }} onClick={e=>e.stopPropagation()}>⠿</span>
                    <div style={{ fontSize:13, fontWeight:700, color:T.ink }}>{tr.name}</div>
                    <div style={{ fontSize:12, color:T.inkMuted }}>{tr.parent || '—'}</div>
                    <div style={{ overflow:'hidden' }}>
                        {tr.rule
                            ? <span style={{ display:'inline-block', padding:'2px 6px', background:'rgba(58,90,122,0.08)', border:`1px solid rgba(58,90,122,0.15)`, borderRadius:3, fontFamily:'ui-monospace,Menlo,monospace', fontSize:10.5, color:T.info, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'100%' }}>{tr.rule}</span>
                            : <span style={{ fontSize:11.5, color:T.border, fontStyle:'italic' }}>No rule set</span>}
                    </div>
                    <div style={{ fontSize:13, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace' }}>{tr.accounts ?? '—'}</div>
                    <div style={{ fontSize:13, fontWeight:600, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace' }}>{tr.pipeline || '—'}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
                        {owner.found
                            ? <UserAvatar name={owner.name} size={20}/>
                            : <span style={{ width:20, height:20, borderRadius:'50%', background:T.border, display:'inline-block', flexShrink:0 }}/>}
                        <span style={{ fontSize:12, color: isActive ? T.inkMid : T.inkMuted, fontStyle: isActive ? 'normal' : 'italic', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{owner.name}</span>
                    </div>
                    <div style={{ fontSize:13, color:T.ink }}>{repCount(tr)}</div>
                    <span style={{ display:'inline-block', padding:'2px 7px', borderRadius:10, fontSize:11, fontWeight:700,
                        background: isActive ? 'rgba(77,107,61,0.12)' : 'rgba(184,115,51,0.12)',
                        color: isActive ? T.ok : T.warn }}>
                        {isActive ? 'Active' : 'Unassigned'}
                    </span>
                    <div style={{ position:'relative' }} onClick={e=>e.stopPropagation()}>
                        <button onClick={e => { e.stopPropagation(); setOpenTerrKebab(openTerrKebab === tr.id ? null : tr.id); }}
                            style={{ background:'none', border:'none', color:T.inkMuted, fontSize:16, cursor:'pointer', padding:'2px 4px', lineHeight:1, borderRadius:T.r }}
                            onMouseEnter={e=>e.currentTarget.style.background=T.surface2}
                            onMouseLeave={e=>e.currentTarget.style.background='none'}>⋯</button>
                        {openTerrKebab === tr.id && (
                            <div onClick={e=>e.stopPropagation()}
                                style={{ position:'absolute', right:0, bottom:'100%', marginBottom:4, zIndex:400, background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2, boxShadow:'0 4px 16px rgba(42,38,34,0.12)', minWidth:180 }}>
                                {[
                                    { label:'Edit territory',   action: () => openModal('edit',  tr) },
                                    { label:'Assign owner',     action: () => openModal('owner', tr) },
                                    { label:'Assign reps',      action: () => openModal('reps',  tr) },
                                    { label:'Edit rule',        action: () => openModal('rule',  tr) },
                                    { label:'Delete territory', action: () => handleDelete(tr), danger: true },
                                ].map((item, mi) => (
                                    <button key={mi} onClick={item.action}
                                        style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', borderTop: mi>0?`1px solid ${T.border}`:'none', textAlign:'left', fontSize:13, color:item.danger?T.danger:T.ink, cursor:'pointer', fontFamily:T.sans }}
                                        onMouseEnter={e=>e.currentTarget.style.background=item.danger?'rgba(156,58,46,0.06)':T.surface2}
                                        onMouseLeave={e=>e.currentTarget.style.background='none'}>
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                );
            })}
        </div>
    </div>
    );
};
