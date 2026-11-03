// settings/people/TeamsDetail.jsx
import React, { useState, useEffect } from 'react';
import { useApp } from '../../../AppContext';
import { dbWrite, requestOrg, stillOrg } from '../../../utils/storage';
import { putSettings, writeSettings, takeLatestSettings } from '../shared/saveSettings.js';
// A teams save names the token its list was read with, and a stale refusal takes the latest (state §0.225).
import { revsAfter, listChanged } from '../../../utils/settingsRevs.js';
import { T } from '../shared/tokens.js';
import { UserAvatar } from '../shared/ui.jsx';
// A team is one record (state §0.222): a list's entries read as the members they name, a save sends only what it
// changes, and no new team takes a name another has.
import { holdsMember, namesMember, withoutMember, teamNameRefused, teamSaveMembers, rosterAfterTeamSave } from '../../../utils/teamMembership.js';
// Assign lists a member once, by app id, on the team picked and on no other (state §0.225 — JB2-8).
import { teamsWithMemberOn } from '../../../utils/teamMembership.js';

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

const TEAM_COLORS = ['#2a2622','#4d6b3d','#3a5a7a','#7a6a48','#9c5a3a','#5e4e7a','#3a6a6a','#6b2a22','#3a5530','#7a4a6a'];

const TeamModal = ({ team, settings, setSettings, onSave, onStale, onClose }) => {
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
    // The list and its token as the window opened (state §0.225 — J-B8): a save sends this list with this token, never a
    // newer copy's; it is re-based on the list it landed, or on the latest when a new team was refused as stale.
    const [base, setBase] = useState(() => ({ list: settings.teams || [], rev: settings.revs?.teams ?? null }));
    const teams       = base.list;

    const isEdit = !!team;
    const [name,       setName]       = useState(team?.name       || '');
    const [territory,  setTerritory]  = useState(team?.territory  || '');
    const [vertical,   setVertical]   = useState(team?.vertical   || '');
    const [managerId,  setManagerId]  = useState(team?.managerId  || '');
    const [repIds,     setRepIds]     = useState(team?.repIds     || []);
    const [color,      setColor]      = useState(team?.color      || TEAM_COLORS[0]);
    const [saving,     setSaving]     = useState(false);
    const [err,        setErr]        = useState('');

    // A tick adds the member's app id; an untick takes them off by either id (state §0.222 — a list may hold a member by
    // the Clerk id it held before members had app ids; it is never written so).
    const toggleRep = (u) => setRepIds(prev => holdsMember(prev, u) ? withoutMember(prev, u) : [...prev, u.id]);

    const handleSave = async () => {
        if (!name.trim()) { setErr('Team name is required.'); return; }
        const id = isEdit ? team.id : `team_${Date.now()}`;
        const saved = { id, name: name.trim(), territory, vertical, managerId, repIds, color };
        const updatedTeams = isEdit ? teams.map(t => t.id === id ? saved : t) : [...teams, saved];
        // No new team of a name another has (state §0.222 — Q8): the server's rule and words, checked here first.
        const nameRefused = teamNameRefused(updatedTeams, teams);
        if (nameRefused) { setErr(nameRefused.error); return; }
        setSaving(true); setErr('');
        try {
            // The member saves this save sends (state §0.222 — teamMembership.js teamSaveMembers): a member the list now
            // holds who is on another team joins; one the Admin took off, on this team, leaves; a changed territory or
            // vertical goes to the team's members. A holder of the team the list does not hold is left as they are — before
            // §0.222 every holder the list did not hold by app id was cleared — and a rename is the server's: it renames
            // every holder by id, an inactive one too.
            const sends = teamSaveMembers({ opened: isEdit ? team : null, saved, users: allUsers });

            // Persist to settings (teams + users). The list goes with the token the window opened with (state §0.225): a
            // save another landed first is refused — nothing written, no one renamed.
            const askedOrg = requestOrg();   // cut by an org switch, it stops (state §0.175)
            const w = await writeSettings({ teams: updatedTeams }, { teams: base.rev });
            if (!stillOrg(askedOrg)) return;
            if (w.stale) {
                // The page takes the latest and says so (J-B8), and no member is sent anything: an edit closes, its words
                // on the page; a new team stays open on the latest list, so Save again sends it with that list's token.
                const latest = await takeLatestSettings(setSettings);
                const words = latest ? listChanged('team') : w.error;
                if (isEdit) { onStale(words); onClose(); return; }
                if (latest) setBase({ list: latest.teams || [], rev: latest.revs?.teams ?? null });
                setErr(words);
                return;
            }
            if (!w.ok) throw new Error(w.error || 'Save failed');
            // The list landed: the window holds it with its new token, so a Save after a member's failure sends both.
            setBase({ list: updatedTeams, rev: w.revs.teams ?? null });

            // A member whose row did not update is reported by name; one that did is kept as the server answered it.
            const failed = [];
            const answered = new Map();
            for (const { u, body } of sends) {
                if (!stillOrg(askedOrg)) return;   // the next PUT would carry the new org's token
                const r = await dbWrite(`/.netlify/functions/users`, { method:'PUT', body: JSON.stringify(body) });
                if (!r.ok) failed.push(`${u.name || u.id}: ${r.error}`);
                else answered.set(u.id, r.data?.user || { ...u, ...body });
            }
            if (!stillOrg(askedOrg)) return;

            const renamed = isEdit && team.name !== saved.name ? { id, name: saved.name } : null;
            setSettings(prev => ({ ...prev, teams: updatedTeams, revs: revsAfter(prev.revs, w.revs), users: rosterAfterTeamSave(prev.users, answered, renamed) }));
            if (failed.length) {
                setErr(`Team saved, but ${failed.length} member record(s) did not update: ${failed.join('; ')}`);
                return;                                  // stay open so the message is read
            }
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
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, width:520, maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 8px 32px rgba(42,38,34,0.18)', fontFamily:T.sans }}
                onClick={e=>e.stopPropagation()}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:`1px solid ${T.border}`, flexShrink:0, background:T.surface }}>
                    <div style={{ fontSize:15, fontWeight:700, color:T.ink }}>{isEdit ? 'Edit team' : 'New team'}</div>
                    <button onClick={onClose} style={{ background:'none', border:'none', fontSize:18, color:T.inkMuted, cursor:'pointer', lineHeight:1 }}>×</button>
                </div>
                {/* The box clips and only the body scrolls, so the scrollbar keeps the rounded corners (state §0.213). */}
                <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:14, flex:'1 1 auto', minHeight:0, overflowY:'auto' }}>
                    <div>
                        <label style={lbl}>Team name *</label>
                        <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. SMB West" style={inp} autoFocus/>
                    </div>
                    <div>
                        <label style={lbl}>Manager</label>
                        <select value={managers.find(u => namesMember(managerId, u))?.id ?? managerId} onChange={e=>setManagerId(e.target.value)} style={sel}>
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
                        <label style={lbl}>Sales Reps ({reps.filter(u => holdsMember(repIds, u)).length} selected)</label>
                        {reps.length === 0 ? (
                            <div style={{ fontSize:12, color:T.inkMuted }}>No Sales Rep users found.</div>
                        ) : (
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, maxHeight:180, overflowY:'auto', padding:8, border:`1px solid ${T.border}`, borderRadius:T.r, background:T.surface }}>
                                {reps.map(u => {
                                    const selected   = holdsMember(repIds, u);
                                    const otherTeam  = (settings.teams||[]).find(t => t.id !== team?.id && holdsMember(t.repIds, u));
                                    return (
                                        <div key={u.id} onClick={() => toggleRep(u)}
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
                <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'14px 20px', borderTop:`1px solid ${T.border}`, flexShrink:0, background:T.surface }}>
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
                    const manager = allUsers.find(u => namesMember(team.managerId, u) && u.active !== false);
                    // Reps = repIds excluding the manager (prevent double-display); an entry by app or Clerk id (state §0.222)
                    const reps = allUsers.filter(u =>
                        holdsMember(team.repIds, u) &&
                        !namesMember(team.managerId, u) &&
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
    // The assign popover had no error surface at all: its settings PUT was checked
    // with `if (res.ok)` and simply did nothing on failure, and the /users cascade
    // was a bare await. Both are now reported here.
    const [assignErr,    setAssignErr]    = useState('');
    // A refused delete had no surface at all: its settings PUT was checked with
    // `if (res.ok)` and did nothing on failure, and the member cascade was only
    // console.error'd (state §0.109). Both are reported here, above the table.
    const [deleteErr,    setDeleteErr]    = useState('');
    // A team window's save refused because another landed first, said on the page once the window has closed (state
    // §0.225 — J-B8); opening a window or a Delete clears it.
    const [listNote,     setListNote]     = useState('');
    // An Assign in flight: the team buttons wait for its answer, so a second click never sends the same token again.
    const [assigning,    setAssigning]    = useState(false);

    React.useEffect(() => {
        if (openKebab === null) return;
        const h = () => setOpenKebab(null);
        document.addEventListener('click', h);
        return () => document.removeEventListener('click', h);
    }, [openKebab]);

    // Unassigned: active users with no teamId
    const unassigned = allUsers.filter(u => !u.teamId && u.active !== false && u.userType !== 'Admin');

    // Member count from repIds — the active members the list holds, by app or Clerk id (state §0.222), and its manager
    const activeUsers = allUsers.filter(u => u.active !== false);
    const memberCount = (team) => {
        const activeReps = activeUsers.filter(u => holdsMember(team.repIds, u)).length;
        const hasActiveManager = activeUsers.some(u => namesMember(team.managerId, u));
        return activeReps + (hasActiveManager ? 1 : 0);
    };

    const handleTeamSaved = (updatedTeams) => { /* setSettings already called inside TeamModal */ };
    const openTeam = (t) => { setListNote(''); setEditingTeam(t); };

    const handleDelete = (team) => {
        setOpenKebab(null);
        showConfirm(`Delete team "${team.name}"? Members will become unassigned.`, async () => {
            const askedOrg = requestOrg();   // cut by an org switch, it stops (state §0.175)
            const updatedTeams = teams.filter(t => t.id !== team.id);
            const teamsRev = settings.revs?.teams ?? null;   // the token of the list this delete is built from (state §0.225)
            const members = allUsers.filter(u => u.teamId === team.id);
            setDeleteErr(''); setListNote('');
            let answer;
            try {
                answer = await putSettings({ teams: updatedTeams }, { teams: teamsRev });   // throws on non-2xx
            } catch (e) {
                // Another save landed first (state §0.225): nothing was deleted; the page takes the latest and says so.
                // When the latest cannot be read, the refusal's own words.
                if (e.stale) {
                    const latest = await takeLatestSettings(setSettings);
                    if (latest) { setDeleteErr(listChanged('team')); return; }
                }
                setDeleteErr(`Team not deleted — ${e.message}`);
                return;
            }
            // The list landed: the copy takes it and its token now, before the member rows — a save made while they go
            // out sends the list as it stands, with its token.
            setSettings(prev => ({ ...prev, teams: updatedTeams, revs: revsAfter(prev.revs, answer?.revs) }));
            // The team is gone; now the member rows. One that did not update is
            // reported by name, not logged — it still points at a team the
            // roster no longer has.
            const cleared = new Set(), failed = [];
            for (const u of members) {
                if (!stillOrg(askedOrg)) return;
                const r = await dbWrite('/.netlify/functions/users', { method:'PUT', body: JSON.stringify({ id: u.id, team:'', teamId:'', territory:'', vertical:'' }) });
                if (r.ok) cleared.add(u.id); else failed.push(`${u.name || u.id}: ${r.error}`);
            }
            if (!stillOrg(askedOrg)) return;
            setSettings(prev => ({
                ...prev,
                users: (prev.users || []).map(u => cleared.has(u.id) ? { ...u, team:'', teamId:'', territory:'', vertical:'' } : u),
            }));
            if (failed.length) setDeleteErr(`Team deleted, but ${failed.length} member record(s) did not update: ${failed.join('; ')}`);
        });
    };

    // Assign a member to a team (state §0.225 — JB2-5, JB2-7, JB2-8). The member is listed once: on the team picked and
    // off any other list that holds them by app id (teamsWithMemberOn — a list holding them by a Clerk id is N13, filed);
    // a list that already has it so is not sent. The list goes with the token of the render that built it; a stale
    // refusal takes the latest and says so, the window staying open on it, and the member is sent nothing. The landed
    // list and its token reach the copy before the member's save, so a member save that fails leaves no old token
    // behind; the roster keeps every member, the one assigned as the server answered it.
    const assignTo = async (t) => {
        if (assigning) return;
        const teamsRev = settings.revs?.teams ?? null;
        const { teams: updatedTeams, changed } = teamsWithMemberOn(teams, assigningUser.id, t.id);
        setAssignErr('');
        try {
            setAssigning(true);
            const askedOrg = requestOrg();   // cut by an org switch, it stops (state §0.175)
            if (changed) {
                const rt = await writeSettings({ teams: updatedTeams }, { teams: teamsRev });
                if (!stillOrg(askedOrg)) return;
                if (rt.stale) {
                    const latest = await takeLatestSettings(setSettings);
                    if (latest) { setAssignErr(listChanged('team')); return; }
                }
                if (!rt.ok) { setAssignErr(`Not assigned — ${rt.error}`); return; }
                setSettings(prev => ({ ...prev, teams: updatedTeams, revs: revsAfter(prev.revs, rt.revs) }));
            }
            const ru = await dbWrite('/.netlify/functions/users', { method:'PUT', body: JSON.stringify({ id: assigningUser.id, team: t.name, teamId: t.id, territory: t.territory||'', vertical: t.vertical||'' }) });
            if (!stillOrg(askedOrg)) return;
            if (!ru.ok) { setAssignErr(`Team updated, but ${assigningUser.name || 'the user'} was not — ${ru.error}`); return; }
            setSettings(prev => ({ ...prev, users: (prev.users || []).map(u => u.id === assigningUser.id ? { ...u, ...(ru.data?.user || { team: t.name, teamId: t.id, territory: t.territory || '', vertical: t.vertical || '' }) } : u) }));
            setAssigningUser(null);
        } finally {
            setAssigning(false);
        }
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
                onStale={setListNote}
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
                        {assignErr && (
                            <div style={{ padding:'8px 12px', marginBottom:10, background:'rgba(156,58,46,0.08)',
                                border:`1px solid ${T.danger}`, borderRadius:T.r, color:T.danger, fontSize:12 }}>
                                {assignErr}
                            </div>
                        )}
                        {teams.length === 0 ? (
                            <div style={{ fontSize:13, color:T.inkMuted }}>No teams exist yet. Create a team first.</div>
                        ) : (
                            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                                {teams.map(t => (
                                    <button key={t.id} onClick={() => assignTo(t)} disabled={assigning} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, cursor:'pointer', fontFamily:T.sans, textAlign:'left', opacity:assigning?0.7:1 }}
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
                <button onClick={() => openTeam('new')}
                    style={{ padding:'7px 16px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:T.sans }}>
                    New team
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
                const manager = allUsers.find(u => namesMember(team.managerId, u) && u.active !== false);
                const count   = memberCount(team);
                return (
                <div key={team.id}
                    style={{ display:'grid', gridTemplateColumns:'24px 1fr 200px 80px 130px 90px 120px 80px 32px', gap:8, padding:'11px 16px', borderBottom: i<teams.length-1 ? `1px solid ${T.border}` : 'none', alignItems:'center', cursor:'pointer', transition:'background 80ms' }}
                    onMouseEnter={e=>e.currentTarget.style.background=T.surface2}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                    onClick={() => openTeam(team)}>
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
                                    { label:'Edit team',   action: () => { setOpenKebab(null); openTeam(team); } },
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
