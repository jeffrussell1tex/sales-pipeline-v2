import React, { useState } from 'react';
import { useApp } from '../AppContext';
import { dbFetch } from '../utils/storage';

export default function TerritoriesSettings({ onBack, onSave, onCancel }) {
    const { settings, setSettings } = useApp();
    const territories = settings.territories || [];
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [editingName, setEditingName] = useState('');

    const addTerritory = () => {
        const trimmed = newName.trim();
        if (!trimmed) return;
        if (territories.some(t => t.name.toLowerCase() === trimmed.toLowerCase())) return;
        const entry = { id: 'terr_' + Date.now(), name: trimmed };
        setSettings(prev => ({ ...prev, territories: [...(prev.territories || []), entry] }));
        setNewName('');
    };

    const saveEdit = (id) => {
        const trimmed = editingName.trim();
        if (!trimmed) return;
        const oldName = territories.find(t => t.id === id)?.name;
        const updatedTerritories = territories.map(t => t.id === id ? { ...t, name: trimmed } : t);
        // Sync rename onto users and teams
        const updatedUsers = (settings.users || []).map(u => u.territory === oldName ? { ...u, territory: trimmed } : u);
        const updatedTeams = (settings.teams || []).map(t => t.territory === oldName ? { ...t, territory: trimmed } : t);
        setSettings(prev => ({ ...prev, territories: updatedTerritories, users: updatedUsers, teams: updatedTeams }));
        setEditingId(null);
    };

    const deleteTerritory = (id) => {
        const name = territories.find(t => t.id === id)?.name;
        const updatedTerritories = territories.filter(t => t.id !== id);
        // Clear territory from users and teams that used it
        const updatedUsers = (settings.users || []).map(u => u.territory === name ? { ...u, territory: '' } : u);
        const updatedTeams = (settings.teams || []).map(t => t.territory === name ? { ...t, territory: '' } : t);
        setSettings(prev => ({ ...prev, territories: updatedTerritories, users: updatedUsers, teams: updatedTeams }));
    };

    const inputStyle = { padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none' };

    return (
        <div className="table-container">
            <div className="table-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button className="btn btn-secondary" onClick={onBack}>← Back</button>
                <div>
                    <h2>Territories</h2>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>Define sales territories for assignment to teams and reps</p>
                </div>
            </div>
            <div style={{ padding: '1.5rem', maxWidth: '520px' }}>
                {/* Add new */}
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <input
                        style={{ ...inputStyle, flex: 1 }}
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addTerritory()}
                        placeholder="e.g. Northeast, Gulf Coast, EMEA…"
                    />
                    <button className="btn" onClick={addTerritory} disabled={!newName.trim()}>+ Add</button>
                </div>

                {territories.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8', border: '1px dashed #e2e8f0', borderRadius: '8px' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📍</div>
                        <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>No territories defined</div>
                        <div style={{ fontSize: '0.875rem' }}>Add territories above to get started.</div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {territories.map(t => {
                            const usersInTerritory = (settings.users || []).filter(u => u.territory === t.name).length;
                            const teamsInTerritory = (settings.teams || []).filter(tm => tm.territory === t.name).length;
                            return (
                                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                                    {editingId === t.id ? (
                                        <>
                                            <input style={{ ...inputStyle, flex: 1 }} value={editingName} onChange={e => setEditingName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(t.id); if (e.key === 'Escape') setEditingId(null); }} autoFocus />
                                            <button onClick={() => saveEdit(t.id)} style={{ padding: '4px 10px', borderRadius: '999px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
                                            <button onClick={() => setEditingId(null)} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #94a3b8', background: 'transparent', color: '#475569', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                                        </>
                                    ) : (
                                        <>
                                            <div style={{ flex: 1 }}>
                                                <span style={{ fontWeight: '600', fontSize: '0.9375rem', color: '#1e293b' }}>📍 {t.name}</span>
                                                <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '0.75rem' }}>
                                                    {usersInTerritory > 0 && `${usersInTerritory} rep${usersInTerritory > 1 ? 's' : ''}`}
                                                    {usersInTerritory > 0 && teamsInTerritory > 0 && ' · '}
                                                    {teamsInTerritory > 0 && `${teamsInTerritory} team${teamsInTerritory > 1 ? 's' : ''}`}
                                                </span>
                                            </div>
                                            <button onClick={() => { setEditingId(t.id); setEditingName(t.name); }} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #94a3b8', background: 'transparent', color: '#475569', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                                            <button onClick={() => deleteTerritory(t.id)} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #fca5a5', background: 'transparent', color: '#dc2626', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            <div style={{ display:'flex', gap:'0.75rem', padding:'1rem 1.5rem', borderTop:'1px solid #e2e8f0', background:'#f8fafc', marginTop:'1rem' }}>
                <button onClick={onSave}
                    style={{ padding:'0.5rem 1.5rem', background:'#2563eb', color:'#fff', border:'none', borderRadius:'7px', fontSize:'0.875rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>
                    Save changes
                </button>
                <button onClick={onCancel}
                    style={{ padding:'0.5rem 1.25rem', background:'transparent', color:'#64748b', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'0.875rem', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' }}>
                    Cancel
                </button>
            </div>
        </div>
    );
}
