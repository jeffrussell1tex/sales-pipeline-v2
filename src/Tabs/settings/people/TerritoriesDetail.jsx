// settings/people/TerritoriesDetail.jsx
import React, { useState, useEffect } from 'react';
import { useLocalLayer } from '../../../hooks/useLocalLayer';
import { useApp } from '../../../AppContext';
import { dbWrite, requestOrg, stillOrg } from '../../../utils/storage';
import { putSettings, writeSettings, takeLatestSettings } from '../shared/saveSettings.js';
import { revsAfter, listChanged } from '../../../utils/settingsRevs.js';
import { T } from '../shared/tokens.js';
import { UserAvatar } from '../shared/ui.jsx';

const TerritoryModal = ({ mode, territory, settings, setSettings, onStale, onClose }) => {
    // mode: 'new' | 'edit' | 'owner' | 'reps' | 'rule'
    const allUsers   = (settings.users || []).filter(u => u.name);
    // The list this window builds from and its token, one matched set taken when it opened (state §0.225): a save
    // another tab landed since is refused, never overwritten. Re-based from this window's own landed save, and from
    // the latest after a refusal.
    const [base, setBase] = useState(() => ({ list: settings.territories || [], rev: settings.revs?.territories ?? null }));
    const territories = base.list;

    const [name,    setName]    = useState(territory?.name    || '');
    const [parent,  setParent]  = useState(territory?.parent  || '');
    const [rule,    setRule]    = useState(territory?.rule    || '');
    const [ownerId, setOwnerId] = useState(territory?.ownerId || '');
    const [repIds,  setRepIds]  = useState(territory?.repIds  || []);
    const [saving,  setSaving]  = useState(false);
    const [err,     setErr]     = useState('');
    // One close for Escape, the backdrop, × and Cancel (state §0.232): a territory changed asks "Discard changes?";
    // nothing while its save is out.
    const [opened] = useState(() => JSON.stringify([territory?.name || '', territory?.parent || '', territory?.rule || '', territory?.ownerId || '', territory?.repIds || []]));
    const requestClose = useLocalLayer(true, { onClose, dirty: JSON.stringify([name, parent, rule, ownerId, repIds]) !== opened, busy: saving });

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

            const askedOrg = requestOrg();   // cut by an org switch, it stops (state §0.175)
            const w = await writeSettings({ territories: updatedTerritories }, { territories: base.rev });
            if (!stillOrg(askedOrg)) return;
            // Another change landed first (state §0.225 — J-B8): the page takes the latest and no member row is sent. An
            // edit closes and the page says so; a new territory stays open on the latest list, its next Save that list's.
            if (w.stale) {
                const latest = await takeLatestSettings(setSettings);
                const words = latest ? listChanged('territory') : w.error;
                if (mode !== 'new') { onStale(words); onClose(); return; }
                if (latest) setBase({ list: latest.territories || [], rev: latest.revs?.territories ?? null });
                setErr(words);
                return;
            }
            if (!w.ok) throw new Error(w.error || 'Save failed');
            setBase({ list: updatedTerritories, rev: w.revs.territories ?? null });

            // Persist changed users. A member whose row did not update is reported by name; one that did is kept as
            // the server answered it — the roster is mapped by id, never replaced from this window's copy, which
            // leaves out a member with no name (state §0.225 — JB2-7).
            const changedUsers = updatedUsers.filter((u, i) => allUsers[i] && u.territory !== allUsers[i].territory);
            const failed = [];
            const answered = new Map();
            for (const u of changedUsers) {
                if (!stillOrg(askedOrg)) return;   // the next PUT would carry the new org's token
                const r = await dbWrite('/.netlify/functions/users', { method:'PUT', body: JSON.stringify({ id: u.id, territory: u.territory }) });
                if (!r.ok) failed.push(`${u.name || u.id}: ${r.error}`);
                else answered.set(u.id, r.data?.user || u);
            }
            if (!stillOrg(askedOrg)) return;

            if (failed.length) {
                setErr(`Territory saved, but ${failed.length} user record(s) did not update: ${failed.join('; ')}`);
                setSettings(prev => ({ ...prev, territories: updatedTerritories, revs: revsAfter(prev.revs, w.revs) }));
                return;
            }
            setSettings(prev => ({
                ...prev,
                territories: updatedTerritories,
                revs: revsAfter(prev.revs, w.revs),
                users: (prev.users || []).map(u => answered.has(u.id) ? answered.get(u.id) : u),
            }));
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
        <div style={{ position:'fixed', inset:0, background:'rgba(42,38,34,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={requestClose}>
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, width:460, maxHeight:'88vh', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 8px 32px rgba(42,38,34,0.18)', fontFamily:T.sans }} onClick={e=>e.stopPropagation()}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:`1px solid ${T.border}`, flexShrink:0, background:T.surface }}>
                    <div style={{ fontSize:15, fontWeight:700, color:T.ink }}>{title}</div>
                    <button onClick={requestClose} style={{ background:'none', border:'none', fontSize:18, color:T.inkMuted, cursor:'pointer' }}>×</button>
                </div>
                {/* The box clips and only the body scrolls, so the scrollbar keeps the rounded corners (state §0.213). */}
                <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:14, flex:'1 1 auto', minHeight:0, overflowY:'auto' }}>
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
                <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'14px 20px', borderTop:`1px solid ${T.border}`, flexShrink:0, background:T.surface }}>
                    <button onClick={requestClose} style={{ padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
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
    // A refused delete had no surface at all: its settings PUT was checked with
    // `if (res.ok)` and did nothing on failure, and the rep cascade was only
    // console.error'd (state §0.109). Both are reported here, above the table.
    const [deleteErr,     setDeleteErr]     = useState('');
    // An edit window refused because another change landed first closes; its words show here (state §0.225 — J-B8).
    const [listNote,      setListNote]      = useState('');
    // Escape closes a territory's ⋯ menu, the one on top only (state §0.232).
    useLocalLayer(openTerrKebab !== null, { onClose: () => setOpenTerrKebab(null) });

    React.useEffect(() => {
        if (openTerrKebab === null) return;
        const h = () => setOpenTerrKebab(null);
        document.addEventListener('click', h);
        return () => document.removeEventListener('click', h);
    }, [openTerrKebab]);

    const openModal = (mode, territory = null) => { setOpenTerrKebab(null); setListNote(''); setModal({ mode, territory }); };

    const handleImportCSV = () => {
        // The org whose territories the file is merged into (state §0.175): after a
        // switch the merged list — the last org's — would replace the new org's.
        const askedOrg = requestOrg();
        // The token of that list (state §0.225): an import merged into a list another tab has changed since is refused.
        const listRev = settings.revs?.territories ?? null;
        setListNote('');
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
                if (!stillOrg(askedOrg)) return;
                const w = await writeSettings({ territories: updated }, { territories: listRev });
                if (!stillOrg(askedOrg)) return;
                if (w.ok) { setSettings(prev => ({ ...prev, territories: updated, revs: revsAfter(prev.revs, w.revs) })); window.alert(`Imported ${parsed.length} territor${parsed.length===1?'y':'ies'}.`); }
                else if (w.stale) {
                    // Not re-applied (state §0.225): the page takes the latest; choosing the file again imports it on that.
                    const latest = await takeLatestSettings(setSettings);
                    window.alert(latest ? listChanged('territory') : `Import failed to save — ${w.error}`);
                }
                else window.alert(`Import failed to save — ${w.error}`);
            } catch (e) { console.error('territory CSV import', e); window.alert('Could not import the CSV. Please check the format.'); }
        };
        input.click();
    };

    const handleDelete = (tr) => {
        setOpenTerrKebab(null);
        showConfirm(`Delete territory "${tr.name}"? Assigned reps will become unassigned.`, async () => {
            const askedOrg = requestOrg();   // cut by an org switch, it stops (state §0.175)
            const updatedTerritories = territories.filter(t => t.id !== tr.id);
            const terrRev = settings.revs?.territories ?? null;   // the token of the list it is built from (state §0.225)
            const reps = allUsers.filter(u => u.territory === tr.name);
            setDeleteErr(''); setListNote('');
            let answer;
            try {
                answer = await putSettings({ territories: updatedTerritories }, { territories: terrRev });   // throws on non-2xx
            } catch (e) {
                // Another change landed first (state §0.225): the page takes the latest and says so.
                if (e.stale) { const latest = await takeLatestSettings(setSettings); if (latest) { setDeleteErr(listChanged('territory')); return; } }
                setDeleteErr(`Territory not deleted — ${e.message}`);
                return;
            }
            setSettings(prev => ({ ...prev, territories: updatedTerritories, revs: revsAfter(prev.revs, answer?.revs) }));
            // The territory is gone; now the rep rows. One that did not update is
            // reported by name, not logged.
            const cleared = new Set(), failed = [];
            for (const u of reps) {
                if (!stillOrg(askedOrg)) return;
                const rc = await dbWrite('/.netlify/functions/users', { method:'PUT', body: JSON.stringify({ id: u.id, territory: '' }) });
                if (rc.ok) cleared.add(u.id); else failed.push(`${u.name || u.id}: ${rc.error}`);
            }
            if (!stillOrg(askedOrg)) return;
            setSettings(prev => ({
                ...prev,
                users: (prev.users || []).map(u => cleared.has(u.id) ? { ...u, territory: '' } : u),
            }));
            if (failed.length) setDeleteErr(`Territory deleted, but ${failed.length} user record(s) did not update: ${failed.join('; ')}`);
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
                onStale={setListNote}
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

        {deleteErr && (
            <div style={{ padding:'10px 14px', marginBottom:14, background:'rgba(156,58,46,0.08)', border:`1px solid ${T.danger}`, borderRadius:T.r, color:T.danger, fontSize:12.5 }}>
                {deleteErr}
            </div>
        )}
        {listNote && (
            <div style={{ padding:'10px 14px', marginBottom:14, background:'rgba(156,58,46,0.08)', border:`1px solid ${T.danger}`, borderRadius:T.r, color:T.danger, fontSize:12.5 }}>
                {listNote}
            </div>
        )}

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
