// settings/people/TeamsDetail.jsx
import React, { useState, useEffect } from 'react';
import { useApp } from '../../../AppContext';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { UserAvatar } from '../shared/ui.jsx';

const AttainBar = ({ pct }) => {
    const color = pct >= 100 ? T.ok : pct >= 60 ? T.warn : T.danger;
    return (
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:60, height:5, background:T.border, borderRadius:3, overflow:'hidden', flexShrink:0 }}>
                <div style={{ width:`${Math.min(pct,100)}%`, height:'100%', background:color, borderRadius:3 }}/>
            </div>
            <span style={{ fontSize:11.5, fontWeight:700, color, fontFamily:'ui-monospace,Menlo,monospace', minWidth:28 }}>{pct}%</span>
        </div>
    );
};

const PT_TEAMS = [
    { id:'tm1', name:'Leadership',      color:'#2a2622', manager:'Morgan Reyes',  managerInit:'MR', members:1,  pipeline:'—',           quotaQ:null,  attainPct:null, region:'—' },
    { id:'tm2', name:'RevOps',          color:'#5e4e7a', manager:'Priya Sharma',  managerInit:'PS', members:1,  pipeline:'—',           quotaQ:null,  attainPct:null, region:'—' },
    { id:'tm3', name:'SMB West',        color:'#4d6b3d', manager:'Jeff Hammond',  managerInit:'JH', members:4,  pipeline:'New business', quotaQ:'$1.2M', attainPct:78, region:'NAM-West' },
    { id:'tm4', name:'SMB East',        color:'#3a5a7a', manager:'Devon Park',    managerInit:'DP', members:4,  pipeline:'New business', quotaQ:'$1.2M', attainPct:92, region:'NAM-East' },
    { id:'tm5', name:'Mid-Market',      color:'#7a6a48', manager:'Naomi Tran',    managerInit:'NT', members:4,  pipeline:'New business', quotaQ:'$2.4M', attainPct:104,region:'NAM-Strategic' },
    { id:'tm6', name:'EMEA',            color:'#9c5a3a', manager:'Ben Whitaker',  managerInit:'BW', members:3,  pipeline:'New business', quotaQ:'$1.6M', attainPct:66, region:'EMEA' },
    { id:'tm7', name:'Customer Success',color:'#3a6a6a', manager:'Alia Karim',    managerInit:'AK', members:3,  pipeline:'Renewals',     quotaQ:'$2.1M', attainPct:95, region:'Global' },
    { id:'tm8', name:'Finance',         color:'#6b2a22', manager:'Theo Mensah',   managerInit:'TM', members:1,  pipeline:'—',           quotaQ:null,  attainPct:null, region:'—' },
];

const TEAM_COLORS = ['#2a2622','#4d6b3d','#3a5a7a','#7a6a48','#9c5a3a','#5e4e7a','#3a6a6a','#6b2a22','#3a5530','#7a4a6a'];

const TeamModal = ({ team, settings, setSettings, onSave, onClose }) => {
    const allUsers  = (settings.users || []).filter(u => u.name && u.active !== false);
    const managers  = allUsers.filter(u => {
        const r = (u.userType || u.role || '').toLowerCase();
        return r.includes('manager') || r.includes('admin');
    });
    const reps = allUsers.filter(u => {
        const r = (u.userType || u.role || '').toLowerCase();
        return !r.includes('manager') && !r.includes('admin');
    });
    const territories = (settings.territories || []).map(t => t.name || t).filter(Boolean);
    const verticals   = (settings.verticalMarkets || settings.verticals || []).map(v => v.name || v).filter(Boolean);
    const teams       = settings.teams || [];

    const isEdit = !!team;
    const [name,       setName]       = useState(team?.name       || '');
    const [territory,  setTerritory]  = useState(team?.territory  || '');
    const [vertical,   setVertical]   = useState(team?.vertical   || '');
    const [managerId,  setManagerId]  = useState(team?.managerId  || '');
    const [repIds,     setRepIds]     = useState(team?.repIds     || []);
    const [color,      setColor]      = useState(team?.color      || TEAM_COLORS[0]);
    const [saving,     setSaving]     = useState(false);
    const [err,        setErr]        = useState('');

    const toggleRep = (id) => setRepIds(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);

    const handleSave = async () => {
        if (!name.trim()) { setErr('Team name is required.'); return; }
        setSaving(true); setErr('');
        try {
            const id = isEdit ? team.id : `team_${Date.now()}`;
            const saved = { id, name: name.trim(), territory, vertical, managerId, repIds, color };
            const updatedTeams = isEdit ? teams.map(t => t.id === id ? saved : t) : [...teams, saved];

            // Update user team/territory/vertical fields to match — mirrors TeamBuilder.saveTeam
            const updatedUsers = allUsers.map(u => {
                const wasInThisTeam = u.teamId === id;
                const isNowRep      = repIds.includes(u.id);
                const isNowManager  = managerId === u.id;
                if (isNowRep || isNowManager) return { ...u, team: saved.name, territory: saved.territory, vertical: saved.vertical, teamId: id };
                if (wasInThisTeam)            return { ...u, team: '', territory: '', vertical: '', teamId: '' };
                return u;
            });

            // Persist to settings (teams + users)
            const res  = await dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ teams: updatedTeams }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Save failed');

            // Persist changed user rows to /users
            const changedUsers = updatedUsers.filter((u, i) => {
                const orig = allUsers[i];
                return orig && (u.team !== orig.team || u.teamId !== orig.teamId);
            });
            for (const u of changedUsers) {
                try {
                    await dbFetch(`/.netlify/functions/users`, { method:'PUT', body: JSON.stringify({ id: u.id, team: u.team, territory: u.territory, vertical: u.vertical, teamId: u.teamId }) });
                } catch(e) { console.error('Failed to persist user team', u.name, e); }
            }

            setSettings(prev => ({ ...prev, teams: updatedTeams, users: updatedUsers }));
            onSave(updatedTeams);
            onClose();
        } catch(e) {
            setErr(e.message || 'Save failed.');
        } finally {
            setSaving(false);
        }
    };

    const inp = { width:'100%', padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, background:T.surface, fontFamily:T.sans, outline:'none', boxSizing:'border-box' };
    const sel = { ...inp, cursor:'pointer' };
    const lbl = { display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 };

    return (
        <div style={{ position:'fixed', inset:0, background:'rgba(42,38,34,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
            onClick={onClose}>
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, width:520, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 8px 32px rgba(42,38,34,0.18)', fontFamily:T.sans }}
                onClick={e=>e.stopPropagation()}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:`1px solid ${T.border}`, position:'sticky', top:0, background:T.surface, zIndex:1 }}>
                    <div style={{ fontSize:15, fontWeight:700, color:T.ink }}>{isEdit ? 'Edit team' : 'New team'}</div>
                    <button onClick={onClose} style={{ background:'none', border:'none', fontSize:18, color:T.inkMuted, cursor:'pointer', lineHeight:1 }}>×</button>
                </div>
                <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:14 }}>
                    <div>
                        <label style={lbl}>Team name *</label>
                        <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. SMB West" style={inp} autoFocus/>
                    </div>
                    <div>
                        <label style={lbl}>Manager</label>
                        <select value={managerId} onChange={e=>setManagerId(e.target.value)} style={sel}>
                            <option value="">— Select manager —</option>
                            {managers.map(u => <option key={u.id} value={u.id}>{u.name} · {u.userType || u.role}</option>)}
                        </select>
                        {managers.length === 0 && <div style={{ fontSize:11.5, color:T.warn, marginTop:4 }}>No Manager/Admin users found.</div>}
                    </div>
                    <div>
                        <label style={lbl}>Territory</label>
                        {territories.length > 0 ? (
                            <select value={territory} onChange={e=>setTerritory(e.target.value)} style={sel}>
                                <option value="">— None —</option>
                                {territories.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        ) : (
                            <input value={territory} onChange={e=>setTerritory(e.target.value)} placeholder="e.g. NAM-West" style={inp}/>
                        )}
                    </div>
                    <div>
                        <label style={lbl}>Vertical</label>
                        {verticals.length > 0 ? (
                            <select value={vertical} onChange={e=>setVertical(e.target.value)} style={sel}>
                                <option value="">— None —</option>
                                {verticals.map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                        ) : (
                            <input value={vertical} onChange={e=>setVertical(e.target.value)} placeholder="e.g. Healthcare" style={inp}/>
                        )}
                    </div>
                    <div>
                        <label style={lbl}>Team color</label>
                        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                            {TEAM_COLORS.map(c => (
                                <button key={c} onClick={()=>setColor(c)} style={{ width:24, height:24, borderRadius:'50%', background:c, border: color===c ? `3px solid ${T.ink}` : '2px solid transparent', cursor:'pointer', outline:'none', boxSizing:'border-box' }}/>
                            ))}
                            <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:4 }}>
                                <span style={{ width:4, height:18, borderRadius:2, background:color }}/>
                                <span style={{ fontSize:12, fontWeight:700, color:T.ink }}>{name || 'Preview'}</span>
                            </div>
                        </div>
                    </div>
                    <div>
                        <label style={lbl}>Sales Reps ({repIds.length} selected)</label>
                        {reps.length === 0 ? (
                            <div style={{ fontSize:12, color:T.inkMuted }}>No Sales Rep users found.</div>
                        ) : (
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, maxHeight:180, overflowY:'auto', padding:8, border:`1px solid ${T.border}`, borderRadius:T.r, background:T.surface }}>
                                {reps.map(u => {
                                    const selected   = repIds.includes(u.id);
                                    const otherTeam  = (settings.teams||[]).find(t => t.id !== team?.id && (t.repIds||[]).includes(u.id));
                                    return (
                                        <div key={u.id} onClick={() => toggleRep(u.id)}
                                            style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 8px', borderRadius:4, cursor:'pointer', background: selected ? 'rgba(58,90,122,0.08)' : T.surface2, border: selected ? `1px solid rgba(58,90,122,0.25)` : `1px solid ${T.border}`, userSelect:'none' }}>
                                            <span style={{ width:14, height:14, borderRadius:3, border: selected ? 'none' : `1.5px solid ${T.border}`, background: selected ? T.info : 'transparent', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                                                {selected && <span style={{ color:'#fff', fontSize:9, fontWeight:700 }}>✓</span>}
                                            </span>
                                            <div>
                                                <div style={{ fontSize:12.5, fontWeight:600, color:T.ink }}>{u.name}</div>
                                                {otherTeam && <div style={{ fontSize:10.5, color:T.warn }}>In: {otherTeam.name}</div>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    {err && <div style={{ fontSize:12, color:T.danger, fontWeight:600 }}>{err}</div>}
                </div>
                <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'14px 20px', borderTop:`1px solid ${T.border}`, position:'sticky', bottom:0, background:T.surface }}>
                    <button onClick={onClose} style={{ padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={{ padding:'7px 16px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:T.sans, opacity:saving?0.7:1 }}>
                        {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create team'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const OrgChartView = ({ teams, allUsers }) => {
    const connector = (
        <div style={{ width:2, height:20, background:T.border, margin:'0 auto' }}/>
    );
    const hLine = (count) => count <= 1 ? null : (
        <div style={{ position:'relative', height:20, display:'flex', alignItems:'flex-start', justifyContent:'center' }}>
            <div style={{ position:'absolute', top:0, left:'10%', right:'10%', height:2, background:T.border }}/>
        </div>
    );

    return (
        <div style={{ overflowX:'auto', paddingBottom:8 }}>
            {teams.length === 0
                ? <div style={{ color:T.inkMuted, fontSize:13, padding:16 }}>No teams yet.</div>
                : teams.map(team => {
                    const manager = allUsers.find(u => u.id === team.managerId && u.active !== false);
                    // Reps = repIds excluding the manager (prevent double-display)
                    const reps = allUsers.filter(u =>
                        (team.repIds||[]).includes(u.id) &&
                        u.id !== team.managerId &&
                        u.active !== false
                    );

                    return (
                        <div key={team.id} style={{ display:'flex', flexDirection:'column', alignItems:'center', marginBottom:40 }}>

                            {/* Level 1 — Team node */}
                            <div style={{
                                background:T.surface, border:`1px solid ${T.border}`,
                                borderLeft:`4px solid ${team.color||T.inkMuted}`,
                                borderRadius:6, padding:'10px 20px', textAlign:'left', minWidth:220,
                            }}>
                                <div style={{ fontSize:14, fontWeight:700, color:T.ink }}>{team.name}</div>
                                {(team.territory || team.vertical) && (
                                    <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>
                                        {team.territory && `📍 ${team.territory}`}
                                        {team.territory && team.vertical && ' · '}
                                        {team.vertical && `🏭 ${team.vertical}`}
                                    </div>
                                )}
                                <div style={{ fontSize:11.5, color:T.inkMid, marginTop:4 }}>
                                    {reps.length} rep{reps.length !== 1 ? 's' : ''}
                                    {manager ? ` · mgr: ${manager.name}` : ''}
                                </div>
                            </div>

                            {/* Connector: Team → Manager */}
                            {manager && connector}

                            {/* Level 2 — Manager node */}
                            {manager && (
                                <>
                                    <div style={{
                                        background:T.surface, border:`1px solid ${T.border}`,
                                        borderTop:`3px solid ${team.color||T.inkMuted}`,
                                        borderRadius:6, padding:'10px 16px', textAlign:'center', minWidth:140,
                                    }}>
                                        <UserAvatar name={manager.name} size={32}/>
                                        <div style={{ fontSize:12.5, fontWeight:700, color:T.ink, marginTop:6 }}>{manager.name}</div>
                                        <div style={{ fontSize:10.5, color:T.inkMuted, marginTop:2 }}>Manager</div>
                                    </div>

                                    {/* Connector: Manager → Reps */}
                                    {reps.length > 0 && connector}

                                    {/* Horizontal bar spanning reps */}
                                    {reps.length > 1 && (
                                        <div style={{ width: `${Math.min(reps.length * 130, 700)}px`, height:2, background:T.border }}/>
                                    )}

                                    {/* Level 3 — Rep nodes */}
                                    {reps.length > 0 && (
                                        <div style={{ display:'flex', gap:12, flexWrap:'wrap', justifyContent:'center', marginTop: reps.length > 1 ? 0 : 0 }}>
                                            {reps.map(u => (
                                                <div key={u.id} style={{
                                                    background:T.surface2, border:`1px solid ${T.border}`,
                                                    borderRadius:6, padding:'10px 14px', textAlign:'center', minWidth:110,
                                                    display:'flex', flexDirection:'column', alignItems:'center',
                                                }}>
                                                    {reps.length > 1 && (
                                                        <div style={{ width:2, height:12, background:T.border, marginBottom:6 }}/>
                                                    )}
                                                    <UserAvatar name={u.name} size={26}/>
                                                    <div style={{ fontSize:11.5, fontWeight:600, color:T.ink, marginTop:5 }}>{u.name}</div>
                                                    <div style={{ fontSize:10, color:T.inkMuted, marginTop:2 }}>{u.userType||'Rep'}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}

                            {/* If no manager but has reps — show reps directly under team */}
                            {!manager && reps.length > 0 && (
                                <>
                                    {connector}
                                    <div style={{ display:'flex', gap:12, flexWrap:'wrap', justifyContent:'center' }}>
                                        {reps.map(u => (
                                            <div key={u.id} style={{
                                                background:T.surface2, border:`1px solid ${T.border}`,
                                                borderRadius:6, padding:'10px 14px', textAlign:'center', minWidth:110,
                                                display:'flex', flexDirection:'column', alignItems:'center',
                                            }}>
                                                <UserAvatar name={u.name} size={26}/>
                                                <div style={{ fontSize:11.5, fontWeight:600, color:T.ink, marginTop:5 }}>{u.name}</div>
                                                <div style={{ fontSize:10, color:T.inkMuted, marginTop:2 }}>{u.userType||'Rep'}</div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })
            }
        </div>
    );
};

export const TeamsDetail = ({ settings, setSettings, onBack }) => {
    const { showConfirm } = useApp();

    const allUsers = (settings.users || []).filter(u => u.name);
    const teams    = settings.teams || [];

    const [openKebab,    setOpenKebab]    = useState(null);
    const [editingTeam,  setEditingTeam]  = useState(null); // null | 'new' | team obj
    const [viewMode,     setViewMode]     = useState('table');
    const [assigningUser,setAssigningUser]= useState(null); // user obj being assigned to a team

    React.useEffect(() => {
        if (openKebab === null) return;
        const h = () => setOpenKebab(null);
        document.addEventListener('click', h);
        return () => document.removeEventListener('click', h);
    }, [openKebab]);

    // Unassigned: active users with no teamId
    const unassigned = allUsers.filter(u => !u.teamId && u.active !== false && u.userType !== 'Admin');

    // Member count from repIds
    const activeUserIds = new Set(allUsers.filter(u => u.active !== false).map(u => u.id));
    const memberCount = (team) => {
        const activeReps = (team.repIds || []).filter(id => activeUserIds.has(id)).length;
        const hasActiveManager = team.managerId && activeUserIds.has(team.managerId);
        return activeReps + (hasActiveManager ? 1 : 0);
    };

    const handleTeamSaved = (updatedTeams) => { /* setSettings already called inside TeamModal */ };

    const handleDelete = (team) => {
        setOpenKebab(null);
        showConfirm(`Delete team "${team.name}"? Members will become unassigned.`, async () => {
            const updatedTeams = teams.filter(t => t.id !== team.id);
            const updatedUsers = allUsers.map(u => u.teamId === team.id ? { ...u, team:'', teamId:'', territory:'', vertical:'' } : u);
            try {
                const res = await dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ teams: updatedTeams }) });
                if (res.ok) {
                    setSettings(prev => ({ ...prev, teams: updatedTeams, users: updatedUsers }));
                    // Clear team on affected users in DB
                    for (const u of allUsers.filter(u => u.teamId === team.id)) {
                        try { await dbFetch(`/.netlify/functions/users`, { method:'PUT', body: JSON.stringify({ id: u.id, team:'', teamId:'', territory:'', vertical:'' }) }); } catch(e) {}
                    }
                }
            } catch(e) { console.error('Delete team failed', e); }
        });
    };

    const teamCount  = teams.length;
    const managerSet = new Set(teams.map(t => t.managerId).filter(Boolean));
    const inpSt = { padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans };

    return (
    <div style={{ fontFamily:T.sans }}>
        {editingTeam && (
            <TeamModal
                team={editingTeam === 'new' ? null : editingTeam}
                settings={settings}
                setSettings={setSettings}
                onSave={handleTeamSaved}
                onClose={() => setEditingTeam(null)}/>
        )}

        {/* Assign user to existing team modal */}
        {assigningUser && (
            <div style={{ position:'fixed', inset:0, background:'rgba(42,38,34,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
                onClick={() => setAssigningUser(null)}>
                <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, width:400, boxShadow:'0 8px 32px rgba(42,38,34,0.18)', fontFamily:T.sans }}
                    onClick={e=>e.stopPropagation()}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:`1px solid ${T.border}` }}>
                        <div style={{ fontSize:15, fontWeight:700, color:T.ink }}>Assign to team</div>
                        <button onClick={() => setAssigningUser(null)} style={{ background:'none', border:'none', fontSize:18, color:T.inkMuted, cursor:'pointer' }}>×</button>
                    </div>
                    <div style={{ padding:'16px 20px' }}>
                        <div style={{ fontSize:12.5, color:T.inkMid, marginBottom:12 }}>
                            Assigning <b>{assigningUser.name}</b> to a team will update their team and territory.
                        </div>
                        {teams.length === 0 ? (
                            <div style={{ fontSize:13, color:T.inkMuted }}>No teams exist yet. Create a team first.</div>
                        ) : (
                            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                                {teams.map(t => (
                                    <button key={t.id} onClick={async () => {
                                        const updatedTeams = teams.map(tm => tm.id === t.id
                                            ? { ...tm, repIds: [...(tm.repIds||[]), assigningUser.id] }
                                            : tm);
                                        const updatedUsers = allUsers.map(u => u.id === assigningUser.id
                                            ? { ...u, team: t.name, teamId: t.id, territory: t.territory||'', vertical: t.vertical||'' }
                                            : u);
                                        try {
                                            const res = await dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ teams: updatedTeams }) });
                                            if (res.ok) {
                                                await dbFetch('/.netlify/functions/users', { method:'PUT', body: JSON.stringify({ id: assigningUser.id, team: t.name, teamId: t.id, territory: t.territory||'', vertical: t.vertical||'' }) });
                                                setSettings(prev => ({ ...prev, teams: updatedTeams, users: updatedUsers }));
                                            }
                                        } catch(e) { console.error('Assign failed', e); }
                                        setAssigningUser(null);
                                    }} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, cursor:'pointer', fontFamily:T.sans, textAlign:'left' }}
                                        onMouseEnter={e=>e.currentTarget.style.background='rgba(58,90,122,0.08)'}
                                        onMouseLeave={e=>e.currentTarget.style.background=T.surface2}>
                                        <span style={{ width:4, height:20, borderRadius:2, background:t.color||T.inkMuted, flexShrink:0 }}/>
                                        <div>
                                            <div style={{ fontSize:13, fontWeight:700, color:T.ink }}>{t.name}</div>
                                            {t.territory && <div style={{ fontSize:11, color:T.inkMuted }}>{t.territory}</div>}
                                        </div>
                                        <span style={{ marginLeft:'auto', fontSize:11.5, color:T.inkMuted }}>{memberCount(t)} members</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div style={{ padding:'12px 20px', borderTop:`1px solid ${T.border}`, display:'flex', justifyContent:'flex-end' }}>
                        <button onClick={() => setAssigningUser(null)} style={{ padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                    </div>
                </div>
            </div>
        )}

        {/* Breadcrumb */}
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:T.inkMuted, marginBottom:10 }}>
            <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>Settings</button>
            <span>/</span>
            <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>People & Teams</button>
            <span>/</span>
            <span style={{ color:T.ink, fontWeight:600 }}>Teams</span>
        </div>

        {/* Title band */}
        <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', paddingBottom:16, borderBottom:`1px solid ${T.border}`, marginBottom:20 }}>
            <div style={{ borderLeft:`3px solid ${T.goldInk}`, paddingLeft:10 }}>
                <div style={{ fontSize:22, fontWeight:700, color:T.ink, letterSpacing:-0.3 }}>Teams & managers</div>
                <div style={{ fontSize:13, color:T.inkMid, marginTop:3, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    <span>Team structure, managers, and reporting hierarchy</span>
                    <span style={{ color:T.inkMuted }}>•</span>
                    <span style={{ color:T.ok, fontWeight:600 }}>✓</span>
                    <span>{teamCount} team{teamCount!==1?'s':''} · {managerSet.size} manager{managerSet.size!==1?'s':''}</span>
                    {unassigned.length > 0 && <>
                        <span style={{ color:T.inkMuted }}>•</span>
                        <span style={{ color:T.warn, fontWeight:600 }}>{unassigned.length} unassigned</span>
                    </>}
                </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
                <button style={inpSt}
                    onClick={() => setViewMode(v => v === 'table' ? 'org' : 'table')}
                    onMouseEnter={e=>e.currentTarget.style.background=T.surface2}
                    onMouseLeave={e=>e.currentTarget.style.background=T.surface}>
                    {viewMode === 'table' ? 'Switch to org chart' : 'Switch to table'}
                </button>
                <button onClick={() => setEditingTeam('new')}
                    style={{ padding:'7px 16px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:T.sans }}>
                    New team
                </button>
            </div>
        </div>

        {/* Org chart view */}
        {viewMode === 'org' && (
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:24, marginBottom:14 }}>
                <div style={{ fontSize:13.5, fontWeight:700, color:T.ink, marginBottom:16 }}>Org chart</div>
                <OrgChartView teams={teams} allUsers={allUsers}/>
            </div>
        )}

        {/* Table view */}
        {viewMode === 'table' && (
        <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, marginBottom:14 }}>
            <div style={{ padding:'12px 16px 8px', borderBottom:`1px solid ${T.border}` }}>
                <div style={{ fontSize:13.5, fontWeight:700, color:T.ink }}>All teams</div>
                <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:2 }}>Click any team to edit its members, manager, and quotas.</div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'24px 1fr 200px 80px 130px 90px 120px 80px 32px', gap:8, padding:'8px 16px', background:T.surface2, borderBottom:`1px solid ${T.border}` }}>
                {['','TEAM','MANAGER','MEMBERS','PIPELINE','QUOTA Q','ATTAIN','REGION',''].map((h,i) => (
                    <div key={i} style={{ fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', fontFamily:T.sans }}>{h}</div>
                ))}
            </div>
            {teams.length === 0 ? (
                <div style={{ padding:'32px 16px', textAlign:'center', color:T.inkMuted, fontSize:13 }}>
                    No teams yet. Click <b>New team</b> to create your first team.
                </div>
            ) : teams.map((team, i) => {
                const manager = allUsers.find(u => u.id === team.managerId && u.active !== false);
                const count   = memberCount(team);
                return (
                <div key={team.id}
                    style={{ display:'grid', gridTemplateColumns:'24px 1fr 200px 80px 130px 90px 120px 80px 32px', gap:8, padding:'11px 16px', borderBottom: i<teams.length-1 ? `1px solid ${T.border}` : 'none', alignItems:'center', cursor:'pointer', transition:'background 80ms' }}
                    onMouseEnter={e=>e.currentTarget.style.background=T.surface2}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                    onClick={() => setEditingTeam(team)}>
                    <span style={{ color:T.border, fontSize:14, cursor:'grab' }} onClick={e=>e.stopPropagation()}>⠿</span>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ width:4, height:16, borderRadius:2, background:team.color||T.inkMuted, flexShrink:0 }}/>
                        <span style={{ fontSize:13.5, fontWeight:700, color:T.ink }}>{team.name}</span>
                        {team.territory && <span style={{ fontSize:11, color:T.inkMuted }}>· {team.territory}</span>}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        {manager
                            ? <><UserAvatar name={manager.name} size={20}/><span style={{ fontSize:12.5, color:T.inkMid }}>{manager.name}</span></>
                            : <span style={{ fontSize:12, color:T.border }}>—</span>}
                    </div>
                    <div style={{ fontSize:13, color:T.ink }}>{count}</div>
                    <div style={{ fontSize:12, color:T.inkMid }}>{team.pipeline || '—'}</div>
                    <div style={{ fontSize:13, fontWeight:600, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace' }}>{team.quotaQ || '—'}</div>
                    <div>{team.attainPct != null ? <AttainBar pct={team.attainPct}/> : <span style={{ color:T.border }}>—</span>}</div>
                    <div style={{ fontSize:11.5, color:T.inkMuted }}>{team.territory || '—'}</div>
                    <div style={{ position:'relative' }} onClick={e=>e.stopPropagation()}>
                        <button onClick={e => { e.stopPropagation(); setOpenKebab(openKebab === team.id ? null : team.id); }}
                            style={{ background:'none', border:'none', color:T.inkMuted, fontSize:16, cursor:'pointer', padding:'2px 4px', lineHeight:1, borderRadius:T.r }}
                            onMouseEnter={e=>e.currentTarget.style.background=T.surface2}
                            onMouseLeave={e=>e.currentTarget.style.background='none'}>⋯</button>
                        {openKebab === team.id && (
                            <div onClick={e=>e.stopPropagation()}
                                style={{ position:'absolute', right:0, bottom:'100%', marginBottom:4, zIndex:400, background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2, boxShadow:'0 4px 16px rgba(42,38,34,0.12)', minWidth:160 }}>
                                {[
                                    { label:'Edit team',   action: () => { setOpenKebab(null); setEditingTeam(team); } },
                                    { label:'Delete team', action: () => handleDelete(team), danger: true },
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
        )}

        {/* Unassigned users — live from settings.users, filtered by teamId */}
        <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:16 }}>
            <div style={{ fontSize:13.5, fontWeight:700, color:T.ink, marginBottom:3 }}>Unassigned users</div>
            <div style={{ fontSize:12, color:T.inkMuted, marginBottom:10 }}>Active users not currently in a team.</div>
            {unassigned.length === 0 ? (
                <div style={{ fontSize:12.5, color:T.ok }}>None — every active user is in a team. ✓</div>
            ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {unassigned.map(u => (
                        <div key={u.id||u.name} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', background:T.surface2, borderRadius:6, border:`1px solid ${T.border}` }}>
                            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                <UserAvatar name={u.name} size={28}/>
                                <div>
                                    <div style={{ fontSize:13, fontWeight:600, color:T.ink }}>{u.name}</div>
                                    <div style={{ fontSize:11.5, color:T.inkMuted }}>{u.email || ''}{u.userType ? ` · ${u.userType}` : ''}</div>
                                </div>
                            </div>
                            <button onClick={() => setAssigningUser(u)}
                                style={{ fontSize:11.5, fontWeight:600, color:T.info, background:'none', border:`1px solid ${T.border}`, borderRadius:T.r, padding:'4px 10px', cursor:'pointer', fontFamily:T.sans }}>
                                Assign to team
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    </div>
    );
};
