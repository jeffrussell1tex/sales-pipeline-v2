import React, { useState } from 'react';
import { useApp } from '../AppContext';
import { dbFetch } from '../utils/storage';

export default function TeamBuilder({ onBack }) {
    const { settings, setSettings } = useApp();
    const allUsers = (settings.users || []).filter(u => u.name);
    const managers = allUsers.filter(u => u.role === 'Manager' || u.role === 'Admin' || u.userType === 'Manager' || u.userType === 'Admin');
    const reps = allUsers.filter(u => u.role === 'User' || u.userType === 'User' || (!u.role && !u.userType));
    const teams = settings.teams || [];

    const [editingTeam, setEditingTeam] = useState(null);
    const [showTeamForm, setShowTeamForm] = useState(false);
    const [teamForm, setTeamForm] = useState({ name: '', territory: '', vertical: '', managerId: '', repIds: [] });

    const openNew = () => { setTeamForm({ name: '', territory: '', vertical: '', managerId: '', repIds: [] }); setEditingTeam(null); setShowTeamForm(true); };
    const openEdit = (team) => {
        setShowTeamForm(false);
        setTimeout(() => {
            setTeamForm({ name: team.name, territory: team.territory || '', vertical: team.vertical || '', managerId: team.managerId || '', repIds: team.repIds || [] });
            setEditingTeam(team);
            setShowTeamForm(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 50);
    };
    const closeForm = () => { setShowTeamForm(false); setEditingTeam(null); };

    const saveTeam = () => {
        if (!teamForm.name.trim()) return;
        const id = editingTeam ? editingTeam.id : 'team_' + Date.now();
        const saved = { id, name: teamForm.name.trim(), territory: teamForm.territory.trim(), vertical: teamForm.vertical.trim(), managerId: teamForm.managerId, repIds: teamForm.repIds };
        const updatedTeams = editingTeam ? teams.map(t => t.id === editingTeam.id ? saved : t) : [...teams, saved];
        const updatedUsers = (settings.users || []).map(u => {
            const wasInThisTeam = (u.teamId === id);
            const isNowRep = saved.repIds.includes(u.id);
            const isNowManager = saved.managerId === u.id;
            if (isNowRep || isNowManager) return { ...u, team: saved.name, territory: saved.territory, vertical: saved.vertical, teamId: id };
            if (wasInThisTeam) return { ...u, team: '', territory: '', vertical: '', teamId: '' };
            return u;
        });
        setSettings(prev => ({ ...prev, teams: updatedTeams, users: updatedUsers }));
        closeForm();
    };

    const deleteTeam = (teamId) => {
        const updatedTeams = teams.filter(t => t.id !== teamId);
        const updatedUsers = (settings.users || []).map(u => u.teamId === teamId ? { ...u, team: '', territory: '', vertical: '', teamId: '' } : u);
        setSettings(prev => ({ ...prev, teams: updatedTeams, users: updatedUsers }));
    };

    const toggleRep = (repId) => {
        setTeamForm(prev => ({
            ...prev,
            repIds: prev.repIds.includes(repId) ? prev.repIds.filter(id => id !== repId) : [...prev.repIds, repId]
        }));
    };

    const inputStyle = { width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' };
    const labelSt = { display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#374151', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.04em' };

    return (
        <div className="table-container">
            <div className="table-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button className="btn btn-secondary" onClick={onBack}>← Back</button>
                    <div>
                        <h2>Team Builder</h2>
                        <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>Define sales teams, assign managers, territories, verticals, and reps</p>
                    </div>
                </div>
                <button className="btn" onClick={openNew}>+ New Team</button>
            </div>
            <div style={{ padding: '1.5rem' }}>
                {showTeamForm && (
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.5rem', marginBottom: '1.5rem' }}>
                        <h3 style={{ margin: '0 0 1.25rem 0', fontSize: '1rem', fontWeight: '700' }}>{editingTeam ? 'Edit Team' : 'New Team'}</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                            <div>
                                <label style={labelSt}>Team Name *</label>
                                <input style={inputStyle} value={teamForm.name} onChange={e => setTeamForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. East Coast Team" />
                            </div>
                            <div>
                                <label style={labelSt}>Territory</label>
                                <select style={inputStyle} value={teamForm.territory} onChange={e => setTeamForm(p => ({ ...p, territory: e.target.value }))}>
                                    <option value="">— Select territory —</option>
                                    {(settings.territories || []).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                                </select>
                                {(settings.territories || []).length === 0 && <p style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: '0.375rem' }}>No territories defined. Add territories in the Territories settings first.</p>}
                            </div>
                            <div>
                                <label style={labelSt}>Vertical</label>
                                <select style={inputStyle} value={teamForm.vertical} onChange={e => setTeamForm(p => ({ ...p, vertical: e.target.value }))}>
                                    <option value="">— Select vertical —</option>
                                    {(settings.verticals || []).map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                                </select>
                                {(settings.verticals || []).length === 0 && <p style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: '0.375rem' }}>No verticals defined. Add verticals in the Verticals settings first.</p>}
                            </div>
                        </div>
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={labelSt}>Sales Manager</label>
                            <select style={inputStyle} value={teamForm.managerId} onChange={e => setTeamForm(p => ({ ...p, managerId: e.target.value }))}>
                                <option value="">— Select a manager —</option>
                                {managers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.userType})</option>)}
                            </select>
                            {managers.length === 0 && <p style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: '0.375rem' }}>No Manager-role users found. Add users with the Manager role in Manage Users first.</p>}
                        </div>
                        <div style={{ marginBottom: '1.25rem' }}>
                            <label style={labelSt}>Sales Reps ({teamForm.repIds.length} selected)</label>
                            {reps.length === 0 ? (
                                <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>No Sales Rep users found. Add users with the User role in Manage Users first.</p>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto', padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff' }}>
                                    {reps.map(u => {
                                        const selected = teamForm.repIds.includes(u.id);
                                        const inOtherTeam = teams.find(t => t.id !== editingTeam?.id && t.repIds?.includes(u.id));
                                        return (
                                            <div key={u.id} onClick={() => toggleRep(u.id)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.625rem', borderRadius: '6px', cursor: 'pointer', background: selected ? '#eff6ff' : '#f8fafc', border: selected ? '1px solid #bfdbfe' : '1px solid #e2e8f0', userSelect: 'none' }}>
                                                <div style={{ width: '16px', height: '16px', borderRadius: '3px', border: selected ? 'none' : '1.5px solid #94a3b8', background: selected ? '#2563eb' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    {selected && <span style={{ color: '#fff', fontSize: '10px', fontWeight: '700', lineHeight: 1 }}>✓</span>}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b' }}>{u.name}</div>
                                                    {inOtherTeam && <div style={{ fontSize: '0.6875rem', color: '#f59e0b' }}>In: {inOtherTeam.name}</div>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button className="btn" onClick={saveTeam} disabled={!teamForm.name.trim()}>Save Team</button>
                            <button className="btn btn-secondary" onClick={closeForm}>Cancel</button>
                        </div>
                    </div>
                )}
                {teams.length === 0 && !showTeamForm ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🏗️</div>
                        <div style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem' }}>No teams yet</div>
                        <div style={{ fontSize: '0.875rem', marginBottom: '1.25rem' }}>Create your first team to define your sales org structure.</div>
                        <button className="btn" onClick={openNew}>+ New Team</button>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        {teams.map(team => {
                            const manager = allUsers.find(u => u.id === team.managerId);
                            const teamReps = reps.filter(u => (team.repIds || []).includes(u.id));
                            return (
                                <div key={team.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.25rem 1.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                        <div>
                                            <div style={{ fontSize: '1rem', fontWeight: '700', color: '#1e293b', marginBottom: '0.25rem' }}>{team.name}</div>
                                            {team.territory && <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', background: '#eff6ff', color: '#2563eb', padding: '0.2rem 0.625rem', borderRadius: '999px', fontWeight: '600' }}>📍 {team.territory}</div>}
                                            {team.vertical && <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', background: '#f0fdf4', color: '#16a34a', padding: '0.2rem 0.625rem', borderRadius: '999px', fontWeight: '600', marginLeft: team.territory ? '0.375rem' : 0 }}>🏭 {team.vertical}</div>}
                                        </div>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <button onClick={() => openEdit(team)} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #94a3b8', background: 'transparent', color: '#475569', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                                            <button onClick={() => deleteTeam(team.id)} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #fca5a5', background: 'transparent', color: '#dc2626', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '1rem', alignItems: 'start' }}>
                                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.75rem 1rem' }}>
                                            <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.375rem' }}>Manager</div>
                                            {manager ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.75rem', fontWeight: '700', flexShrink: 0 }}>{manager.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</div>
                                                    <div>
                                                        <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1e293b' }}>{manager.name}</div>
                                                        <div style={{ fontSize: '0.6875rem', color: '#059669' }}>{manager.userType}</div>
                                                    </div>
                                                </div>
                                            ) : <div style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>No manager assigned</div>}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Sales Reps ({teamReps.length})</div>
                                            {teamReps.length === 0 ? (
                                                <div style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>No reps assigned</div>
                                            ) : (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                    {teamReps.map(u => (
                                                        <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '999px', padding: '0.25rem 0.625rem 0.25rem 0.375rem' }}>
                                                            <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.625rem', fontWeight: '700', flexShrink: 0 }}>{u.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</div>
                                                            <span style={{ fontSize: '0.8125rem', fontWeight: '500', color: '#1e293b' }}>{u.name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
