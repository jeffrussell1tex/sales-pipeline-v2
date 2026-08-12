// settings/salesProcess/FlatListDetail.jsx
import React, { useState, useEffect, useRef } from 'react';
import { dbFetch } from '../../../utils/storage';
import { putSettings } from '../shared/saveSettings.js';
import { T } from '../shared/tokens.js';
import { CSectionCard } from '../shared/form.jsx';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';

function FlatListDetail({ title, description, placeholder, settingsKey, settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) {
    const saved   = settings?.[settingsKey] || [];
    const [items, setItems]   = useState(() => [...saved]);
    const [dirty, setDirty]   = useState(false);
    const [saveError, setSaveError] = useState('');
    const [saving, setSaving] = useState(false);
    const [newItem, setNewItem] = useState('');
    const inputRef = useRef(null);

    const handleSave = async () => {
        setSaving(true);
        setSettings(prev => ({ ...prev, [settingsKey]: items }));
        try {
            // A failure was only console.error'd and the dirty flag cleared anyway.
            // This file is generic, so that one bug applied to every settings key
            // rendered through it.
            await putSettings({ [settingsKey]: items });
            setSaveError('');
            setDirty(false);
        } catch (e) {
            setSaveError(e.message);
            setSaving(false);
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
    const handleCancel = () => { setItems([...saved]); setDirty(false); };

    const addItem = () => {
        const val = newItem.trim();
        if (!val || items.includes(val)) return;
        setItems(prev => [...prev, val]);
        setNewItem('');
        setDirty(true);
        inputRef.current?.focus();
    };
    const removeItem = (idx) => {
        setItems(prev => prev.filter((_, i) => i !== idx));
        setDirty(true);
    };
    const moveItem = (idx, dir) => {
        const next = [...items];
        const swap = idx + dir;
        if (swap < 0 || swap >= next.length) return;
        [next[idx], next[swap]] = [next[swap], next[idx]];
        setItems(next);
        setDirty(true);
    };

    return (
        <CategoryDetailChrome
            error={saveError}
            crumb={title} title={title} subtitle={description}
            statusDetail={`${items.length} ${items.length === 1 ? title.toLowerCase().replace(/s$/, '') : title.toLowerCase()}`}
            updatedBy="Admin" updatedAt="now"
            onBack={onBack} dirty={dirty} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
            rightActions={
                <div style={{ display:'flex', gap:8 }}>
                    <button type="button" onClick={handleCancel} style={{ padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                    <button type="button" onClick={handleSave} disabled={saving} style={{ padding:'7px 14px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:saving?'default':'pointer', fontFamily:T.sans }}>{saving?'Saving…':'Save changes'}</button>
                </div>
            }
        >
            <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:20 }}>
                {/* Left — list */}
                <CSectionCard title={`${title} · ${items.length}`} description={description}>
                    {/* Add row */}
                    <div style={{ display:'flex', gap:8, marginBottom:14 }}>
                        <input
                            ref={inputRef}
                            value={newItem}
                            onChange={e => setNewItem(e.target.value)}
                            onKeyDown={e => { if (e.key==='Enter') addItem(); if (e.key==='Escape') setNewItem(''); }}
                            placeholder={placeholder}
                            style={{ flex:1, padding:'7px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none' }}
                        />
                        <button type="button" onClick={addItem} disabled={!newItem.trim() || items.includes(newItem.trim())}
                            style={{ padding:'7px 16px', background: newItem.trim() ? T.ink : T.borderStrong, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:13, fontWeight:600, cursor: newItem.trim()?'pointer':'default', fontFamily:T.sans }}>
                            + Add
                        </button>
                    </div>
                    {items.length === 0 && (
                        <div style={{ padding:'24px 0', textAlign:'center', color:T.inkMuted, fontSize:13, fontStyle:'italic', fontFamily:T.sans }}>
                            No {title.toLowerCase()} yet. Add one above.
                        </div>
                    )}
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                        {items.map((item, idx) => (
                            <div key={idx} style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:T.r+2 }}>
                                {/* Reorder arrows */}
                                <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
                                    <button onClick={() => moveItem(idx, -1)} disabled={idx===0}
                                        style={{ background:'none', border:'none', cursor:idx===0?'default':'pointer', color:idx===0?T.inkMuted:T.inkMid, padding:'1px 3px', fontSize:10, lineHeight:1 }}>▲</button>
                                    <button onClick={() => moveItem(idx, 1)} disabled={idx===items.length-1}
                                        style={{ background:'none', border:'none', cursor:idx===items.length-1?'default':'pointer', color:idx===items.length-1?T.inkMuted:T.inkMid, padding:'1px 3px', fontSize:10, lineHeight:1 }}>▼</button>
                                </div>
                                <span style={{ flex:1, fontSize:13, color:T.ink, fontFamily:T.sans }}>{item}</span>
                                <button onClick={() => removeItem(idx)}
                                    style={{ background:'none', border:'none', color:T.danger, cursor:'pointer', fontSize:16, lineHeight:1, padding:'0 4px', fontFamily:T.sans }}>×</button>
                            </div>
                        ))}
                    </div>
                </CSectionCard>
                {/* Right — tips */}
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                    <CSectionCard title="Tips">
                        <ul style={{ margin:0, paddingLeft:16, fontSize:12.5, color:T.inkMid, lineHeight:1.7, fontFamily:T.sans }}>
                            <li>Items appear as options in the opportunity form.</li>
                            <li>Use the arrows to set display order.</li>
                            <li>Deleting an item won't affect existing opportunity records.</li>
                        </ul>
                    </CSectionCard>
                </div>
            </div>
        </CategoryDetailChrome>
    );
}

export const CompetitorsDetail  = (p) => <FlatListDetail {...p} title="Competitors"  settingsKey="competitors" placeholder="e.g. Salesforce, HubSpot…"      description="Competitor names shown in the opportunity form for win/loss tracking." />;

export const ReasonsWonDetail   = (p) => <FlatListDetail {...p} title="Reasons won"  settingsKey="reasonsWon"  placeholder="e.g. Best price, Strong support…" description="Win reason options shown when a deal is marked Closed Won." />;

export const ReasonsLostDetail  = (p) => <FlatListDetail {...p} title="Reasons lost" settingsKey="reasonsLost" placeholder="e.g. Lost to competitor, Budget…"  description="Loss reason options shown when a deal is marked Closed Lost." />;
