// settings/salesProcess/PainPointsDetail.jsx
import React, { useState, useEffect, useRef } from 'react';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { putSettings } from '../shared/saveSettings.js';
import { CSectionCard } from '../shared/form.jsx';
import { LIcon } from '../shared/ui.jsx';
import { SPDrag } from './shared.jsx';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';

const DEFAULT_PAIN_POINTS = [
    { cat:'Cost & ROI',       items:['High TCO vs incumbent','Unpredictable renewal costs','Low ROI on current stack','Hidden implementation fees'] },
    { cat:'Efficiency',       items:['Manual data entry across tools','Reps hopping between 5+ apps','Reports take > 2 days to compile','Forecasting is a spreadsheet game'] },
    { cat:'Data & reporting', items:['Pipeline hygiene is poor','Leadership distrusts forecast','No single source of truth'] },
    { cat:'Team & adoption',  items:['Low CRM adoption','High rep turnover','Training onboarding > 30 days','Managers coach blind'] },
    { cat:'Integrations',     items:['Quote-to-cash is disjointed','Email sync is unreliable','Slack alerts are noisy'] },
    { cat:'Compliance',       items:['No audit trail','GDPR requests are manual','Field-level permissions are coarse'] },
];

const MOST_USED_PAIN_POINTS = [
    { k:'Manual data entry across tools',   n:38 },
    { k:'Forecasting is a spreadsheet game',n:31 },
    { k:'Low CRM adoption',                 n:27 },
    { k:'Reps hopping between 5+ apps',     n:24 },
    { k:'Pipeline hygiene is poor',         n:19 },
];

// Minimal CSV parser (quoted fields + commas)
const parsePainCSV = (text) => {
    const rows = [];
    for (const line of String(text).replace(/\r\n/g, '\n').split('\n')) {
        if (line.trim() === '') continue;
        const cells = []; let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (inQ) {
                if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
                else if (c === '"') inQ = false;
                else cur += c;
            } else if (c === '"') inQ = true;
            else if (c === ',') { cells.push(cur); cur = ''; }
            else cur += c;
        }
        cells.push(cur);
        rows.push(cells.map(s => s.trim()));
    }
    return rows;
};

export const PainPointsDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {
    const saved    = settings?.painPoints?.length ? settings.painPoints : DEFAULT_PAIN_POINTS;
    const [groups, setGroups]   = useState(() => JSON.parse(JSON.stringify(saved)));
    const [dirty, setDirty]     = useState(false);
    const fileInputRef = useRef(null);
    const [saving, setSaving]   = useState(false);
    const [saveError, setSaveError] = useState('');
    const [search, setSearch]   = useState('');
    const [addingCat, setAddingCat] = useState(false);
    const [newCat, setNewCat]   = useState('');
    const [addingItem, setAddingItem] = useState(null); // category name
    const [newItem, setNewItem] = useState('');

    const handleCancel = () => { setGroups(JSON.parse(JSON.stringify(saved))); setDirty(false); };
    const handleSave   = async () => {
        setSaving(true);
        setSettings(prev => ({ ...prev, painPoints: groups }));
        try {
            await putSettings({ painPoints: groups });
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

    const addCategory = () => {
        if (!newCat.trim()) return;
        if (groups.some(g => g.cat === newCat.trim())) return;
        setGroups(prev => [...prev, { cat: newCat.trim(), items: [] }]);
        setNewCat(''); setAddingCat(false); setDirty(true);
    };
    const addItem = (cat) => {
        if (!newItem.trim()) return;
        setGroups(prev => prev.map(g => g.cat === cat ? { ...g, items: [...g.items, newItem.trim()] } : g));
        setNewItem(''); setAddingItem(null); setDirty(true);
    };
    const removeItem = (cat, item) => {
        setGroups(prev => prev.map(g => g.cat === cat ? { ...g, items: g.items.filter(i => i !== item) } : g));
        setDirty(true);
    };

    const importCSV = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            let rows = parsePainCSV(reader.result || '');
            if (!rows.length) { e.target.value = ''; return; }
            const h0 = (rows[0][0] || '').toLowerCase(), h1 = (rows[0][1] || '').toLowerCase();
            if (h0.includes('categ') || h1.includes('pain') || h1.includes('point')) rows = rows.slice(1);
            setGroups(prev => {
                const next = JSON.parse(JSON.stringify(prev));
                const byCat = {}; next.forEach(g => { byCat[g.cat.toLowerCase()] = g; });
                for (const r of rows) {
                    const cat = (r[0] || '').trim(), item = (r[1] || '').trim();
                    if (!cat) continue;
                    let grp = byCat[cat.toLowerCase()];
                    if (!grp) { grp = { cat, items: [] }; next.push(grp); byCat[cat.toLowerCase()] = grp; }
                    if (item && !grp.items.some(x => x.toLowerCase() === item.toLowerCase())) grp.items.push(item);
                }
                return next;
            });
            setDirty(true);
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const totalItems = groups.reduce((a,g) => a + g.items.length, 0);
    const filtered   = groups.map(g => ({
        ...g,
        items: search ? g.items.filter(item => item.toLowerCase().includes(search.toLowerCase())) : g.items,
    })).filter(g => !search || g.items.length > 0);

    return (
        <CategoryDetailChrome error={saveError}
            crumb="Pain points library" title="Pain points library"
            subtitle="Reusable customer pain point templates"
            statusDetail={`${totalItems} pain points`}
            updatedBy="Admin" updatedAt="2 weeks ago"
            onBack={onBack} dirty={dirty} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
            rightActions={
                <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => fileInputRef.current?.click()} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                        <LIcon name="upload" size={13}/> Import CSV
                    </button>
                    <input ref={fileInputRef} type="file" accept=".csv,text/csv" style={{ display:'none' }} onChange={importCSV}/>
                    <button onClick={() => setAddingCat(true)} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                        + New pain point
                    </button>
                    <button onClick={handleCancel} disabled={!dirty} style={{ padding:'7px 14px', background:T.surface, color: dirty ? T.ink : T.inkMuted, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor: dirty ? 'pointer' : 'default', fontFamily:T.sans }}>Cancel</button>
                    <button onClick={handleSave} disabled={!dirty || saving} style={{ padding:'7px 14px', background: dirty ? T.ink : T.borderStrong, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor: dirty && !saving ? 'pointer' : 'default', fontFamily:T.sans }}>{saving ? 'Saving…' : 'Save changes'}</button>
                </div>
            }
        >
            <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:20 }}>
                {/* Left */}
                <div>
                    {/* Search + count */}
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, width:260 }}>
                            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={T.inkMuted} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search pain points…" style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:12, color:T.ink, fontFamily:T.sans }}/>
                            {search && <button onClick={() => setSearch('')} style={{ background:'none', border:'none', color:T.inkMuted, cursor:'pointer', fontSize:13, padding:0 }}>×</button>}
                        </div>
                        <div style={{ flex:1 }}/>
                        <span style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>Showing {totalItems} of {totalItems} · grouped by category</span>
                    </div>

                    {/* New category form */}
                    {addingCat && (
                        <div style={{ display:'flex', gap:8, marginBottom:14, padding:12, background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:T.r+2 }}>
                            <input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Category name…" onKeyDown={e => { if (e.key==='Enter') addCategory(); if (e.key==='Escape') { setAddingCat(false); setNewCat(''); } }}
                                autoFocus style={{ flex:1, padding:'6px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, color:T.ink, fontFamily:T.sans, outline:'none' }}/>
                            <button onClick={addCategory} style={{ padding:'6px 14px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Add</button>
                            <button onClick={() => { setAddingCat(false); setNewCat(''); }} style={{ padding:'6px 10px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                        </div>
                    )}

                    {filtered.map((g,gi) => (
                        <CSectionCard
                            key={g.cat}
                            title={`${g.cat} · ${g.items.length}`}
                            description="Drag any pain point onto an opportunity to associate it."
                            headAction={
                                <button onClick={() => { setAddingItem(g.cat); setNewItem(''); }}
                                    style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', background:'transparent', border:`1px solid ${T.border}`, color:T.ink, fontSize:12, fontWeight:500, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>
                                    + Add
                                </button>
                            }
                        >
                            {addingItem === g.cat && (
                                <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                                    <input value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Pain point description…" onKeyDown={e => { if (e.key==='Enter') addItem(g.cat); if (e.key==='Escape') { setAddingItem(null); setNewItem(''); } }}
                                        autoFocus style={{ flex:1, padding:'6px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, color:T.ink, fontFamily:T.sans, outline:'none' }}/>
                                    <button onClick={() => addItem(g.cat)} style={{ padding:'6px 14px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Add</button>
                                    <button onClick={() => { setAddingItem(null); setNewItem(''); }} style={{ padding:'6px 10px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                                </div>
                            )}
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                                {g.items.map((item, ii) => (
                                    <div key={ii} style={{ padding:'10px 12px', display:'flex', alignItems:'center', gap:10, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:T.r+2 }}>
                                        <SPDrag/>
                                        <div style={{ flex:1, fontSize:12.5, color:T.ink, fontWeight:500, fontFamily:T.sans }}>{item}</div>
                                        <button onClick={() => removeItem(g.cat, item)}
                                            style={{ background:'none', border:'none', color:T.inkMuted, cursor:'pointer', fontSize:14, padding:0, lineHeight:1, flexShrink:0 }}
                                            onMouseEnter={e => e.currentTarget.style.color = T.danger}
                                            onMouseLeave={e => e.currentTarget.style.color = T.inkMuted}>×</button>
                                    </div>
                                ))}
                            </div>
                        </CSectionCard>
                    ))}
                </div>

                {/* Right */}
                <div>
                    <div style={{ position:'sticky', top:20 }}>
                        <CSectionCard title="Most-used pain points" description="Across all open opportunities this quarter.">
                            {MOST_USED_PAIN_POINTS.map((p,i) => (
                                <div key={i} style={{ padding:'9px 0', borderBottom: i<4 ? `1px solid ${T.border}` : 'none', display:'flex', gap:10, alignItems:'center' }}>
                                    <div style={{ fontSize:12.5, color:T.ink, flex:1, fontFamily:T.sans }}>{p.k}</div>
                                    <div style={{ fontFamily:T.serif, fontStyle:'italic', fontSize:15, fontWeight:700, color:T.goldInk }}>{p.n}</div>
                                </div>
                            ))}
                        </CSectionCard>
                        <CSectionCard title="Categories" description="Reorder or hide whole categories.">
                            {groups.map((g,i) => (
                                <div key={i} style={{ padding:'8px 0', borderBottom: i<groups.length-1 ? `1px solid ${T.border}` : 'none', display:'flex', alignItems:'center', gap:10 }}>
                                    <SPDrag/>
                                    <div style={{ flex:1, fontSize:12.5, color:T.ink, fontWeight:500, fontFamily:T.sans }}>{g.cat}</div>
                                    <span style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>{g.items.length}</span>
                                </div>
                            ))}
                        </CSectionCard>
                    </div>
                </div>
            </div>
        </CategoryDetailChrome>
    );
};
