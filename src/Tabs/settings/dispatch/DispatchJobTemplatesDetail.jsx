// settings/dispatch/DispatchJobTemplatesDetail.jsx
import React, { useState, useEffect } from 'react';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { putSettings } from '../shared/saveSettings.js';
import { CSectionCard } from '../shared/form.jsx';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';

// `name` and `ctype` were bound to the SAME field: the "Template name" input and
// the customer-type select both called updateTemplate('ctype', ...), so a
// template had no distinct name and the list rendered customer types as names.
// Existing rows are migrated on read by copying ctype into name — lossless,
// since ctype is whatever the user last typed into either control.
const migrateTemplate = (t) => ({ ...t, name: t.name ?? (t.ctype || '') });

// `equip` was free text ("Recovery cart, spares") with a helper line claiming
// each item had to exist in Vehicles & equipment — nothing enforced that. It is
// now a list of equipment CATEGORIES from the dispatch_equipment table, so a
// requirement can be resolved, counted against the units actually available, and
// used as a scheduling constraint.
//
// Fragments that match nothing are NOT dropped: they are kept and reported, so a
// real requirement typed as "recovery cart (large)" is visible rather than
// silently lost on the first save.
// Requirements name a CATEGORY of equipment, never an individual unit — a job
// needs "a pressure tester", not asset #A-1042. Availability is then the count of
// units in that category, which is also what lets one unit sit in calibration
// while the other stays bookable.
//
// Two legacy shapes migrate in:
//   • `equip`     — free text, comma separated, from before any validation
//   • `equipIds`  — ids into settings.dispatchEquipment, the retired blob
// Both resolve by NAME against the live category list, because the blob's item
// name is exactly what became the category on import. Fragments that match
// nothing are kept and reported rather than dropped.
const migrateEquipment = (t, categories, legacyBlob) => {
    if (Array.isArray(t.equipCategories)) return t;

    const known = new Map((categories || []).map(c => [c.trim().toLowerCase(), c]));
    const wanted = [];

    if (Array.isArray(t.equipIds) && t.equipIds.length) {
        // Blob ids carry no meaning against the tables; recover their names first.
        (t.equipIds || []).forEach(id => {
            const hit = (legacyBlob || []).find(e => e.id === id);
            if (hit && hit.name) wanted.push(String(hit.name).trim());
        });
    } else {
        String(t.equip || '').split(',').map(x => x.trim()).filter(Boolean).forEach(x => wanted.push(x));
    }

    const cats = [], unmatched = [];
    wanted.forEach(nm => {
        const hit = known.get(nm.toLowerCase());
        if (hit) { if (!cats.includes(hit)) cats.push(hit); }
        else if (!unmatched.includes(nm)) unmatched.push(nm);
    });
    return { ...t, equipCategories: cats, equipUnmatched: unmatched };
};

// Numeric template fields are held as raw text while the user types, and only
// coerced on blur. Coercing inside onChange is what made these fields
// uneditable: backspacing to '' gave parseInt('') → NaN → `|| 1`, which rewrote
// the input back to 1 before the next keystroke could land. The duration field
// was worse — its value was the derived string `hrs + ' hours'`, so every
// keystroke was parsed and immediately reformatted, pinning the caret.
const commitNumber = (raw, { min, max, fallback, integer = false }) => {
    const n = integer ? parseInt(raw, 10) : parseFloat(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
};

const CREW_BOUNDS = { min: 1,   max: 10, fallback: 1, integer: true };
const HRS_BOUNDS  = { min: 0.5, max: 24, fallback: 2 };

export const DispatchJobTemplatesDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {
    const saved = settings?.dispatchJobTemplates || [];
    const skills   = settings?.dispatchSkills   || [];
    const licenses = settings?.dispatchLicenses || ['Apprentice','Journeyman','Master','Lead'];
    const custTypes = settings?.customerTypes   || [];
    // Equipment categories come from the dispatch_equipment table — one row per
    // physical unit, grouped by category. The settings blob is retained only to
    // translate legacy template ids into names during migration.
    const legacyEquipBlob = settings?.dispatchEquipment || [];
    const [equipUnits, setEquipUnits] = useState([]);
    const [equipLoaded, setEquipLoaded] = useState(false);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await dbFetch('/.netlify/functions/dispatch-equipment');
                if (!res.ok) { if (!cancelled) setEquipLoaded(true); return; }
                const data = await res.json();
                if (cancelled) return;
                setEquipUnits(data.equipment || []);
            } catch (e) { /* picker stays empty */ }
            if (!cancelled) setEquipLoaded(true);
        })();
        return () => { cancelled = true; };
    }, []);
    const equipCategories = React.useMemo(
        () => [...new Set(equipUnits.map(e => (e.category || '').trim()).filter(Boolean))].sort(),
        [equipUnits]);
    const unitsIn = (cat) => equipUnits.filter(e => (e.category || '').trim() === cat);

    const [templates, setTemplates] = useState(() => JSON.parse(JSON.stringify(saved)).map(migrateTemplate));
    // Equipment migration needs the category list, which arrives asynchronously.
    // Running it against an empty list would file every requirement as unmatched
    // and then persist that on the next save.
    const [equipMigrated, setEquipMigrated] = useState(false);
    useEffect(() => {
        if (!equipLoaded || equipMigrated) return;
        setTemplates(prev => prev.map(t => migrateEquipment(t, equipCategories, legacyEquipBlob)));
        setEquipMigrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [equipLoaded, equipMigrated, equipCategories]);
    const [dirty,    setDirty]    = useState(false);
    const [saving,   setSaving]   = useState(false);
    const [saveError, setSaveError] = useState('');
    const [selectedId, setSelectedId] = useState(saved[0]?.id || null);
    const [showAdd,  setShowAdd]  = useState(false);
    const [tmplMenu, setTmplMenu] = useState(null);

    const selected = templates.find(t => t.id === selectedId);

    const handleSave = async () => {
        setSaving(true);
        // A field still mid-edit ('' or '3.') must not reach the blob — the New
        // Job template picker and the preview panel both read these as numbers.
        const clean = templates.map(t => ({
            ...t,
            crew: commitNumber(t.crew, CREW_BOUNDS),
            hrs:  commitNumber(t.hrs,  HRS_BOUNDS),
        }));
        setTemplates(clean);
        setSettings(prev => ({ ...prev, dispatchJobTemplates: clean }));
        try {
            await putSettings({ dispatchJobTemplates: clean });
            setSaveError('');
            setDirty(false);
        } catch (e) {
            // Keep the panel dirty: the change was NOT saved, and clearing the
            // flag here is what made a 403 look like success.
            setSaveError(e.message);
        }
        setSaving(false);
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

    const toggleEquip = (cat) => {
        if (!selected) return;
        const cur = selected.equipCategories || [];
        updateTemplate('equipCategories', cur.includes(cat) ? cur.filter(x => x !== cat) : [...cur, cat]);
    };

    // Canonical vocabulary: low | normal | high | emergency (matches the schema).
    // Legacy 'urgent'/'standard' values are translated on read so existing
    // templates keep their colour until the next save rewrites them.
    const PRIORITY_ALIASES = { urgent: 'emergency', standard: 'normal', medium: 'normal' };
    const normPrio  = (p) => PRIORITY_ALIASES[p] || p || 'normal';
    const prioColor = (p) => ({ emergency: T.danger, high: T.warn, normal: T.inkMid, low: T.inkMuted }[normPrio(p)] || T.inkMuted);

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
        {
            ok: (selected.equipCategories||[]).every(c => equipCategories.includes(c)) && (selected.equipUnmatched||[]).length === 0,
            label: 'All required equipment exists',
            detail: (selected.equipCategories||[]).length === 0 && (selected.equipUnmatched||[]).length === 0
                ? 'No equipment required'
                : (selected.equipCategories||[]).map(c => `${c} (${unitsIn(c).length} unit${unitsIn(c).length===1?'':'s'})`).join(', ')
                  + ((selected.equipUnmatched||[]).length ? ` · ${(selected.equipUnmatched||[]).length} unmatched` : ''),
        },
    ] : [];

    return (
        <CategoryDetailChrome error={saveError} crumb="Job templates" category="Dispatch" title="Job templates"
            subtitle="When an opportunity moves to Closed Won, Accelerep can auto-create a Job using the template tied to the customer's type. Defaults pre-fill — dispatchers can still edit before scheduling."
            onBack={onBack} dirty={dirty}
            onCancel={() => { setTemplates(JSON.parse(JSON.stringify(saved)).map(migrateTemplate).map(t => migrateEquipment(t, equipCategories, legacyEquipBlob))); setDirty(false); }}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
            extraActions={
                <>
                    <button style={{ padding:'7px 14px', background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:500, color:T.inkMid, cursor:'pointer', fontFamily:T.sans }}>Test auto-create</button>
                    <button onClick={()=>{ const id='tmpl_'+Date.now(); setTemplates(p=>[...p,{id,name:'',ctype:'',crew:1,hrs:2,skills:[],minLicense:licenses[0]||'Apprentice',equipCategories:[],equipUnmatched:[],autojob:true,priority:'normal',used:0}]); setSelectedId(id); setDirty(true); }} style={{ padding:'7px 14px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>+ New template</button>
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
                                    <div style={{ fontWeight: selectedId===t.id ? 700 : 400, color: T.ink }}>{t.name || t.ctype || '—'}</div>
                                    <div style={{ color: T.inkMid }}>{t.crew}p</div>
                                    <div style={{ color: T.inkMid }}>{t.hrs}h</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                        {(t.skills||[]).map(id => { const s=skills.find(sk=>sk.id===id); return s?<span key={id} style={{ fontSize:9.5, padding:'1px 5px', borderRadius:8, background:`${s.color}14`, color:s.color, fontWeight:600 }}>{s.name}</span>:null; })}
                                    </div>
                                    <div><span style={{ fontSize:11, padding:'2px 7px', borderRadius:3, background:`${T.info}14`, color:T.info, fontWeight:600 }}>{t.minLicense}</span></div>
                                    <div><span style={{ fontSize:11, padding:'2px 7px', borderRadius:3, background:`${prioColor(t.priority)}14`, color:prioColor(t.priority), fontWeight:600 }}>{normPrio(t.priority)}</span></div>
                                    <div><span style={{ fontSize:11, padding:'2px 7px', borderRadius:3, background:t.autojob?`${T.ok}14`:`${T.inkMuted}14`, color:t.autojob?T.ok:T.inkMuted, fontWeight:600 }}>{t.autojob?'On':'Off'}</span></div>
                                    <div style={{ color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace', fontSize:11 }}>{t.used||0}</div>
                                    <button onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setTmplMenu(tmplMenu?.id===t.id?null:{id:t.id,t,rect:{top:r.bottom+4,right:window.innerWidth-r.right}});}} style={{background:'none',border:'none',cursor:'pointer',color:T.inkMuted,fontSize:16,fontWeight:700,padding:'0 2px',lineHeight:1}}>⋯</button>
                                </div>
                            ))}
                        </div>

                    </CSectionCard>
                    {/* Selected template form */}
                    {selected && (
                        <CSectionCard title={selected.name || 'New template'} desc="Edit the template fields below.">
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                <div>
                                    <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.6, marginBottom:5, fontFamily:T.sans }}>Template name</div>
                                    <input value={selected.name||''} onChange={e=>updateTemplate('name',e.target.value)} placeholder="e.g. Emergency · same-day"
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
                                    <input type="number" min={1} max={10} step={1}
                                        value={selected.crew ?? ''}
                                        onChange={e=>updateTemplate('crew',e.target.value)}
                                        onBlur={e=>{ const v=commitNumber(e.target.value,CREW_BOUNDS); if(v!==selected.crew) updateTemplate('crew',v); }}
                                        placeholder="1"
                                        style={{ width:'100%', padding:'7px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none', boxSizing:'border-box', background:T.surface }}/>
                                </div>
                                <div>
                                    <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.6, marginBottom:5, fontFamily:T.sans }}>Default duration (hours)</div>
                                    <input type="number" min={0.5} max={24} step={0.5}
                                        value={selected.hrs ?? ''}
                                        onChange={e=>updateTemplate('hrs',e.target.value)}
                                        onBlur={e=>{ const v=commitNumber(e.target.value,HRS_BOUNDS); if(v!==selected.hrs) updateTemplate('hrs',v); }}
                                        placeholder="e.g. 4"
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
                                    <select value={normPrio(selected.priority)} onChange={e=>updateTemplate('priority',e.target.value)}
                                        style={{ width:'100%', padding:'7px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none', background:T.surface, boxSizing:'border-box' }}>
                                        <option value="low">Low</option>
                                        <option value="normal">Normal</option>
                                        <option value="high">High</option>
                                        <option value="emergency">Emergency</option>
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
                                    <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.6, marginBottom:8, fontFamily:T.sans }}>Default equipment</div>
                                    {!equipLoaded ? (
                                        <div style={{ fontSize:12, color:T.inkMuted, fontStyle:'italic', fontFamily:T.sans }}>Loading equipment&hellip;</div>
                                    ) : equipCategories.length === 0 ? (
                                        <div style={{ fontSize:12, color:T.inkMuted, fontStyle:'italic', fontFamily:T.sans }}>
                                            No equipment configured. Add items in Settings &rarr; Dispatch &rarr; Vehicles &amp; equipment.
                                        </div>
                                    ) : (
                                        <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                                            {equipCategories.map(cat => {
                                                const active = (selected.equipCategories||[]).includes(cat);
                                                const units  = unitsIn(cat);
                                                const free   = units.filter(u => (u.status||'available') === 'available').length;
                                                return (
                                                    <span key={cat} onClick={()=>toggleEquip(cat)}
                                                        title={`${free} of ${units.length} unit(s) currently available`}
                                                        style={{ fontSize:11, padding:'3px 9px', borderRadius:8, cursor:'pointer',
                                                            background:active?`${T.info}20`:T.surface2, border:`1px solid ${active?T.info:T.border}`,
                                                            color:active?T.info:T.inkMuted, fontWeight:active?700:400, fontFamily:T.sans, transition:'all 100ms' }}>
                                                        {cat}
                                                        <span style={{ marginLeft:5, opacity:0.7, fontFamily:'ui-monospace,Menlo,monospace' }}>{free}/{units.length}</span>
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {(selected.equipUnmatched||[]).length > 0 && (
                                        <div style={{ marginTop:8, padding:'6px 10px', borderRadius:T.r, background:`${T.warn}14`, borderLeft:`3px solid ${T.warn}`, fontSize:11.5, fontFamily:T.sans, color:T.ink }}>
                                            Not matched to your equipment list: <strong>{(selected.equipUnmatched||[]).join(', ')}</strong>.
                                            Add {(selected.equipUnmatched||[]).length === 1 ? 'it' : 'them'} under Vehicles &amp; equipment and select above, or
                                            <span onClick={()=>updateTemplate('equipUnmatched',[])} style={{ color:T.info, fontWeight:600, cursor:'pointer' }}> dismiss</span>.
                                        </div>
                                    )}
                                    <div style={{ fontSize:11, color:T.inkMuted, marginTop:6, fontFamily:T.sans }}>
                                        Counts are available units over total units. A job requires a category, not a
                                        specific unit; scheduling blocks when every available unit is already committed to
                                        an overlapping job that day.
                                    </div>
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
                                <div style={{ fontSize:11, color:T.inkMid, fontFamily:T.sans }}>Priority: <strong style={{ color:prioColor(selected.priority) }}>{normPrio(selected.priority)}</strong></div>
                                {(selected.equipCategories||[]).length > 0 && (
                                    <div style={{ fontSize:11, color:T.inkMid, fontFamily:T.sans }}>Equipment: <strong>
                                        {(selected.equipCategories||[]).join(', ')}
                                    </strong></div>
                                )}
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
                        <button onClick={()=>{const clone={...t,id:'tmpl_'+Date.now(),name:(t.name||t.ctype||'')+' (copy)',used:0};setTemplates(p=>[...p,clone]);setSelectedId(clone.id);setDirty(true);setTmplMenu(null);}} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',textAlign:'left',fontSize:13,color:T.ink,cursor:'pointer',fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background='none'}>Duplicate</button>
                        <button onClick={()=>{setTemplates(p=>p.map(tm=>tm.id===t.id?{...tm,autojob:!tm.autojob}:tm));setDirty(true);setTmplMenu(null);}} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',borderTop:`1px solid ${T.border}`,textAlign:'left',fontSize:13,color:T.ink,cursor:'pointer',fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background='none'}>{t.autojob?'Disable auto-create':'Enable auto-create'}</button>
                        <button onClick={()=>{setTemplates(p=>p.filter(tm=>tm.id!==t.id));if(selectedId===t.id)setSelectedId(templates.find(tm=>tm.id!==t.id)?.id||null);setDirty(true);setTmplMenu(null);}} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',borderTop:`1px solid ${T.border}`,textAlign:'left',fontSize:13,color:T.danger,cursor:'pointer',fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background='rgba(156,58,46,0.06)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>Delete</button>
                    </div>
                </>);
            })()}
        </CategoryDetailChrome>
    );
};
