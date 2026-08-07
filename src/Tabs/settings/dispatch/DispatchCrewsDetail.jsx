// settings/dispatch/DispatchCrewsDetail.jsx
import React, { useState, useEffect } from 'react';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { putSettings } from '../shared/saveSettings.js';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';

export const DispatchCrewsDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {
    const saved = settings?.dispatchCrews || [];
    const skills = settings?.dispatchSkills || [];
    const vehicles = settings?.dispatchVehicles || [];
    // Crew members come from dispatch_technicians, the source of truth. This
    // previously read settings.users.filter(u => u.dispatchEnabled) — a flag
    // nothing sets any more (and which never persisted), so the member picker
    // was always empty and no one could be added to a crew.
    const [users, setUsers] = useState([]);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await dbFetch('/.netlify/functions/dispatch-technicians');
                if (!res.ok) return;                     // leave empty rather than render {error}
                const data = await res.json();
                if (cancelled) return;
                setUsers((data.technicians || [])
                    .filter(t => t.status !== 'inactive')
                    .map(t => ({
                        id:             t.id,
                        name:           `${t.firstName || ''} ${t.lastName || ''}`.trim() || t.email || t.id,
                        dispatchSkills: t.skills || [],
                        dispatchLicense: t.licenseLevel || null,
                        hoursCap:       40,
                    })));
            } catch (e) { /* picker stays empty */ }
        })();
        return () => { cancelled = true; };
    }, []);

    const [crews, setCrews] = useState(() => JSON.parse(JSON.stringify(saved)));
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [selectedId, setSelectedId] = useState(saved[0]?.id || null);
    const [showAddMember, setShowAddMember] = useState(false);
    const [showAdd, setShowAdd] = useState(false);
    const [newCrew, setNewCrew] = useState({ name: '', area: '', color: '#3a5a7a', defaultVehicle: '' });

    const selectedCrew = crews.find(c => c.id === selectedId);

    const handleSave = async () => {
        setSaving(true);
        setSettings(prev => ({ ...prev, dispatchCrews: crews }));
        try {
            await putSettings({ dispatchCrews: crews });
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

    const CREW_COLORS = ['#3a5a7a','#4d6b3d','#b87333','#9c3a2e','#7a6a48','#8a8378','#2a2622'];

    const addCrew = () => {
        if (!newCrew.name.trim()) return;
        const id = 'crew_' + crypto.randomUUID();
        setCrews(prev => [...prev, { id, ...newCrew, members: [], lead: null, activeJobs: 0, hoursWeek: 0 }]);
        setSelectedId(id);
        setNewCrew({ name: '', area: '', color: '#3a5a7a', defaultVehicle: '' });
        setShowAdd(false); setDirty(true);
    };

    const updateCrew = (field, val) => {
        setCrews(prev => prev.map(c => c.id === selectedId ? { ...c, [field]: val } : c));
        setDirty(true);
    };

    const toggleMember = (userId) => {
        setCrews(prev => prev.map(c => {
            if (c.id !== selectedId) return c;
            const members = c.members || [];
            const next = members.includes(userId) ? members.filter(m => m !== userId) : [...members, userId];
            return { ...c, members: next };
        }));
        setDirty(true);
    };

    return (
        <CategoryDetailChrome error={saveError} crumb="Crews" category="Dispatch" title="Crews"
            subtitle="Named groups of techs who work together in the field. Distinct from CRM Sales teams (which structure reps for reporting)."
            onBack={onBack} dirty={dirty}
            onCancel={() => { setCrews(JSON.parse(JSON.stringify(saved))); setDirty(false); }}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
            extraActions={
                <>
                    <button style={{ padding:'7px 14px', background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:500, color:T.inkMid, cursor:'pointer', fontFamily:T.sans }}>Import preset</button>
                    <button onClick={()=>setShowAdd(true)} style={{ padding:'7px 14px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>+ New crew</button>
                </>
            }>

            {/* Disambiguation banner */}
            <div style={{ background: `${T.info}0e`, border: `1px solid ${T.info}30`, borderRadius: T.r, padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: T.inkMid, fontFamily: T.sans }}>
                <strong style={{ color: T.ink }}>Crews ≠ Sales teams.</strong> A crew is an operational group of techs who share vehicles and coverage. Sales teams group reps for reporting and live under People & Teams. A user can belong to both.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
                {/* Left — crew list */}
                <div>
                    <div style={{ fontFamily: T.sans }}>
                        {crews.map(crew => (
                            <div key={crew.id} onClick={() => setSelectedId(crew.id)}
                                style={{ padding: '12px 14px', marginBottom: 6, borderRadius: T.r, cursor: 'pointer',
                                    background: T.surface, border: `1.5px solid ${selectedId === crew.id ? T.goldInk : T.border}`,
                                    borderLeft: `4px solid ${crew.color || T.inkMuted}`,
                                    boxShadow: selectedId === crew.id ? '0 2px 8px rgba(42,38,34,0.08)' : 'none' }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 3 }}>{crew.name}</div>
                                <div style={{ fontSize: 11, color: T.inkMuted, marginBottom: 6 }}>{crew.area || 'No area set'}</div>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    {(crew.members || []).slice(0, 4).map(uid => {
                                        const u = users.find(u => u.id === uid || u.name === uid);
                                        return u ? (
                                            <div key={uid} style={{ width: 22, height: 22, borderRadius: '50%', background: T.ink, color: '#fbf8f3', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {(u.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2)}
                                            </div>
                                        ) : null;
                                    })}
                                    {(crew.members || []).length > 4 && <span style={{ fontSize: 10, color: T.inkMuted }}>+{crew.members.length - 4}</span>}
                                </div>
                                <div style={{ fontSize: 10.5, color: T.inkMuted, marginTop: 6 }}>
                                    {crew.activeJobs || 0} jobs · {crew.hoursWeek || 0}h
                                </div>
                            </div>
                        ))}
                        {showAdd ? (
                            <div style={{ padding: '10px 12px', background: T.surface, border: `1px solid ${T.borderStrong}`, borderRadius: T.r }}>
                                <input value={newCrew.name} onChange={e => setNewCrew(p => ({...p, name: e.target.value}))} placeholder="Crew name" autoFocus
                                    style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.borderStrong}`, borderRadius: T.r, fontSize: 13, fontFamily: T.sans, outline: 'none', marginBottom: 6, boxSizing: 'border-box' }}/>
                                <input value={newCrew.area} onChange={e => setNewCrew(p => ({...p, area: e.target.value}))} placeholder="Coverage area"
                                    style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.borderStrong}`, borderRadius: T.r, fontSize: 12, fontFamily: T.sans, outline: 'none', marginBottom: 8, boxSizing: 'border-box' }}/>
                                <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                                    {CREW_COLORS.map(c => <div key={c} onClick={() => setNewCrew(p=>({...p,color:c}))}
                                        style={{ width: 18, height: 18, borderRadius: 3, background: c, cursor: 'pointer', outline: newCrew.color===c?`2px solid ${T.ink}`:'none', outlineOffset: 1 }}/>)}
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button onClick={addCrew} style={{ flex: 1, padding: '5px 0', background: T.ink, color: '#fbf8f3', border: 'none', borderRadius: T.r, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>Add</button>
                                    <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: '5px 0', background: 'transparent', color: T.inkMid, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12, cursor: 'pointer', fontFamily: T.sans }}>Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <button onClick={() => setShowAdd(true)}
                                style={{ width: '100%', padding: '8px 0', background: 'transparent', border: `1px dashed ${T.borderStrong}`, borderRadius: T.r, fontSize: 12.5, color: T.inkMid, cursor: 'pointer', fontFamily: T.sans }}>
                                + New crew
                            </button>
                        )}
                    </div>
                </div>

                {/* Right — crew detail */}
                {selectedCrew ? (
                    <div>
                        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+2, padding: '16px 18px', marginBottom: 14 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                                <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, fontFamily: T.sans }}>{selectedCrew.name}</div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button onClick={() => { const clone = {...selectedCrew, id:'crew_'+Date.now(), name:selectedCrew.name+' (copy)', members:[]}; setCrews(p=>[...p,clone]); setSelectedId(clone.id); setDirty(true); }}
                                        style={{ padding: '5px 12px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12, cursor: 'pointer', fontFamily: T.sans, color: T.ink }}>Duplicate</button>
                                    <button onClick={() => { setCrews(p=>p.filter(c=>c.id!==selectedId)); setSelectedId(crews.find(c=>c.id!==selectedId)?.id||null); setDirty(true); }}
                                        style={{ padding: '5px 12px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12, cursor: 'pointer', fontFamily: T.sans, color: T.danger }}>Archive</button>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5, fontFamily: T.sans }}>Crew name</div>
                                    <input value={selectedCrew.name} onChange={e => updateCrew('name', e.target.value)}
                                        style={{ width: '100%', padding: '7px 10px', border: `1px solid ${T.borderStrong}`, borderRadius: T.r, fontSize: 13, fontFamily: T.sans, outline: 'none', boxSizing: 'border-box', background: T.surface }}/>
                                </div>
                                <div>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5, fontFamily: T.sans }}>Color</div>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        {CREW_COLORS.map(c => <div key={c} onClick={() => updateCrew('color', c)}
                                            style={{ width: 22, height: 22, borderRadius: 3, background: c, cursor: 'pointer', outline: selectedCrew.color===c?`2px solid ${T.ink}`:'none', outlineOffset: 1 }}/>)}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5, fontFamily: T.sans }}>Default coverage area</div>
                                    <input value={selectedCrew.area || ''} onChange={e => updateCrew('area', e.target.value)}
                                        placeholder="e.g. Berkeley · Oakland · Alameda"
                                        style={{ width: '100%', padding: '7px 10px', border: `1px solid ${T.borderStrong}`, borderRadius: T.r, fontSize: 13, fontFamily: T.sans, outline: 'none', boxSizing: 'border-box', background: T.surface }}/>
                                </div>
                                <div>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5, fontFamily: T.sans }}>Default vehicle</div>
                                    <select value={selectedCrew.defaultVehicle || ''} onChange={e => updateCrew('defaultVehicle', e.target.value)}
                                        style={{ width: '100%', padding: '7px 10px', border: `1px solid ${T.borderStrong}`, borderRadius: T.r, fontSize: 13, fontFamily: T.sans, outline: 'none', background: T.surface, boxSizing: 'border-box' }}>
                                        <option value="">— None —</option>
                                        {vehicles.map(v => <option key={v.id} value={v.id}>{v.name} ({v.type})</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Members card — matching design spec */}
                        {(() => {
                            const memberIds = selectedCrew.members || [];
                            const memberUsers = memberIds.map(id => users.find(u => (u.id||u.name) === id)).filter(Boolean);
                            const nonMembers = users.filter(u => !memberIds.includes(u.id||u.name));

                            return (
                                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+2, padding: '16px 18px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, fontFamily: T.sans }}>Members</div>
                                            <div style={{ fontSize: 11.5, color: T.inkMuted, fontFamily: T.sans }}>Techs assigned to this crew. Crew lead is starred.</div>
                                        </div>
                                        <button onClick={() => setShowAddMember(p => !p)}
                                            style={{ padding: '5px 12px', background: T.surface2, border: `1px solid ${T.borderStrong}`, borderRadius: T.r, fontSize: 12.5, fontWeight: 600, color: T.ink, cursor: 'pointer', fontFamily: T.sans }}>
                                            + Add member
                                        </button>
                                    </div>

                                    {memberUsers.length === 0 ? (
                                        <div style={{ padding: '1.5rem', textAlign: 'center', color: T.inkMuted, fontSize: 12.5, fontStyle: 'italic', fontFamily: T.sans, border: `1px dashed ${T.borderStrong}`, borderRadius: T.r }}>
                                            No members yet. Click "+ Add member" to assign techs to this crew.
                                        </div>
                                    ) : (
                                        <div style={{ border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden' }}>
                                            {/* Header */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 110px 100px 1.2fr 80px 28px', gap: 10, padding: '8px 12px', background: T.surface2, fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: T.sans }}>
                                                <div>Tech</div><div>Role</div><div>License</div><div>Top skills</div><div>Hours</div><div/>
                                            </div>
                                            {/* Member rows */}
                                            {memberUsers.map((u, i) => {
                                                const uid = u.id || u.name;
                                                const isLead = selectedCrew.lead === uid;
                                                const userSkills = (u.dispatchSkills || []).slice(0, 3).map(id => skills.find(s => s.id === id)).filter(Boolean);
                                                const hoursUsed = u.hoursThisWeek || 0;
                                                const hoursCap  = u.hoursCap || 40;
                                                const over = hoursUsed > hoursCap;
                                                return (
                                                    <div key={uid} style={{ display: 'grid', gridTemplateColumns: '1.4fr 110px 100px 1.2fr 80px 28px', gap: 10, padding: '11px 12px', alignItems: 'center', fontSize: 12.5, fontFamily: T.sans, borderTop: i > 0 ? `1px solid ${T.border}` : 'none', background: T.surface }}>
                                                        {/* Tech name + avatar */}
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <div style={{ width: 30, height: 30, borderRadius: '50%', background: T.ink, color: '#fbf8f3', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                                {(u.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2)}
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: 600, color: T.ink }}>
                                                                    {u.name} {isLead && <span style={{ color: T.goldInk, fontSize: 13 }}>★</span>}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {/* Role / make lead */}
                                                        <div>
                                                            <button onClick={() => updateCrew('lead', isLead ? null : uid)}
                                                                style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3,
                                                                    border: `1px solid ${isLead ? T.goldInk : T.border}`,
                                                                    background: isLead ? `${T.goldInk}14` : 'transparent',
                                                                    color: isLead ? T.goldInk : T.inkMid, cursor: 'pointer', fontFamily: T.sans }}>
                                                                {isLead ? 'Crew lead' : 'Tech'}
                                                            </button>
                                                        </div>
                                                        {/* License */}
                                                        <div>
                                                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, background: `${T.info}14`, color: T.info, fontWeight: 600 }}>
                                                                {u.dispatchLicense || '—'}
                                                            </span>
                                                        </div>
                                                        {/* Skills */}
                                                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                                                            {userSkills.map(s => (
                                                                <span key={s.id} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: `${s.color}14`, color: s.color, fontWeight: 600, border: `1px solid ${s.color}30` }}>{s.name}</span>
                                                            ))}
                                                            {(u.dispatchSkills||[]).length > 3 && <span style={{ fontSize: 10, color: T.inkMuted }}>+{(u.dispatchSkills||[]).length - 3}</span>}
                                                        </div>
                                                        {/* Hours bar */}
                                                        <div>
                                                            <div style={{ fontSize: 10.5, fontFamily: 'ui-monospace,Menlo,monospace', color: over ? T.danger : T.inkMid, marginBottom: 2 }}>
                                                                {hoursUsed}/{hoursCap}h
                                                            </div>
                                                            <div style={{ height: 3, background: T.surface2, borderRadius: 2, overflow: 'hidden' }}>
                                                                <div style={{ height: '100%', width: `${Math.min(hoursUsed/hoursCap,1)*100}%`, background: over ? T.danger : hoursUsed >= hoursCap*0.9 ? T.warn : T.ok }}/>
                                                            </div>
                                                        </div>
                                                        {/* Kebab — remove from crew */}
                                                        <button onClick={() => toggleMember(uid)}
                                                            title="Remove from crew"
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkMuted, fontSize: 13, padding: 0, fontFamily: T.sans }}
                                                            onMouseEnter={e=>e.currentTarget.style.color=T.danger}
                                                            onMouseLeave={e=>e.currentTarget.style.color=T.inkMuted}>×</button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Add member picker — inline expandable */}
                                    {showAddMember && (
                                        <div style={{ marginTop: 12 }}>
                                            {nonMembers.length === 0 ? (
                                                <div style={{ fontSize: 12.5, color: T.inkMuted, fontStyle: 'italic', fontFamily: T.sans, padding: '8px 0' }}>All dispatch-enabled techs are already in this crew.</div>
                                            ) : (
                                                <div style={{ border: `1px solid ${T.borderStrong}`, borderRadius: T.r, overflow: 'hidden', background: T.surface }}>
                                                    <div style={{ padding: '8px 12px', background: T.surface2, fontSize: 11, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: T.sans }}>
                                                        Available techs — click to add
                                                    </div>
                                                    {nonMembers.map((u, i) => {
                                                        const userSkills = (u.dispatchSkills || []).slice(0, 2).map(id => skills.find(s => s.id === id)).filter(Boolean);
                                                        return (
                                                            <div key={u.id||u.name}
                                                                onClick={() => { toggleMember(u.id||u.name); }}
                                                                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: i > 0 ? `1px solid ${T.border}` : 'none', cursor: 'pointer', transition: 'background 80ms' }}
                                                                onMouseEnter={e=>e.currentTarget.style.background=T.surface2}
                                                                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                                                                <div style={{ width: 30, height: 30, borderRadius: '50%', background: T.ink, color: '#fbf8f3', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                                    {(u.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2)}
                                                                </div>
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: T.sans }}>{u.name}</div>
                                                                    <div style={{ display: 'flex', gap: 5, marginTop: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                                                                        <span style={{ fontSize: 10.5, color: T.inkMuted, fontFamily: T.sans }}>{u.dispatchLicense || '—'}</span>
                                                                        {userSkills.map(s => (
                                                                            <span key={s.id} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: `${s.color}14`, color: s.color, fontWeight: 600, border: `1px solid ${s.color}30` }}>{s.name}</span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                                <span style={{ fontSize: 12, color: T.ok, fontWeight: 700, fontFamily: T.sans, flexShrink: 0 }}>+ Add</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+2, color: T.inkMuted, fontSize: 13, fontStyle: 'italic', fontFamily: T.sans }}>
                        Select a crew to edit its members and settings.
                    </div>
                )}
            </div>
        </CategoryDetailChrome>
    );
};
