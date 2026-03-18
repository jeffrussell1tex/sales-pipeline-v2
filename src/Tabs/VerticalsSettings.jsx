import React, { useState } from 'react';
import { useApp } from '../AppContext';
import { dbFetch } from '../utils/storage';

export default function VerticalsSettings({ onBack }) {
    const { settings, setSettings } = useApp();
    const verticals = settings.verticals || [];
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [editingName, setEditingName] = useState('');

    const addVertical = () => {
        const trimmed = newName.trim();
        if (!trimmed) return;
        if (verticals.some(v => v.name.toLowerCase() === trimmed.toLowerCase())) return;
        const entry = { id: 'vert_' + Date.now(), name: trimmed };
        setSettings(prev => ({ ...prev, verticals: [...(prev.verticals || []), entry] }));
        setNewName('');
    };

    const saveEdit = (id) => {
        const trimmed = editingName.trim();
        if (!trimmed) return;
        const oldName = verticals.find(v => v.id === id)?.name;
        const updatedVerticals = verticals.map(v => v.id === id ? { ...v, name: trimmed } : v);
        // Sync rename onto users and teams
        const updatedUsers = (settings.users || []).map(u => u.vertical === oldName ? { ...u, vertical: trimmed } : u);
        const updatedTeams = (settings.teams || []).map(t => t.vertical === oldName ? { ...t, vertical: trimmed } : t);
        setSettings(prev => ({ ...prev, verticals: updatedVerticals, users: updatedUsers, teams: updatedTeams }));
        setEditingId(null);
    };

    const deleteVertical = (id) => {
        const name = verticals.find(v => v.id === id)?.name;
        const updatedVerticals = verticals.filter(v => v.id !== id);
        // Clear vertical from users and teams that used it
        const updatedUsers = (settings.users || []).map(u => u.vertical === name ? { ...u, vertical: '' } : u);
        const updatedTeams = (settings.teams || []).map(t => t.vertical === name ? { ...t, vertical: '' } : t);
        setSettings(prev => ({ ...prev, verticals: updatedVerticals, users: updatedUsers, teams: updatedTeams }));
    };

    const inputStyle = { padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none' };

    return (
        <div className="table-container">
            <div className="table-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button className="btn btn-secondary" onClick={onBack}>← Back</button>
                <div>
                    <h2>Verticals</h2>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>Define sales verticals for assignment to teams and reps</p>
                </div>
            </div>
            <div style={{ padding: '1.5rem', maxWidth: '520px' }}>
                {/* Add new */}
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <input
                        style={{ ...inputStyle, flex: 1 }}
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addVertical()}
                        placeholder="e.g. Healthcare, Manufacturing, Energy…"
                    />
                    <button className="btn" onClick={addVertical} disabled={!newName.trim()}>+ Add</button>
                </div>

                {verticals.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8', border: '1px dashed #e2e8f0', borderRadius: '8px' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏭</div>
                        <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>No verticals defined</div>
                        <div style={{ fontSize: '0.875rem' }}>Add verticals above to get started.</div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {verticals.map(v => {
                            const usersInVertical = (settings.users || []).filter(u => u.vertical === v.name).length;
                            const teamsInVertical = (settings.teams || []).filter(tm => tm.vertical === v.name).length;
                            return (
                                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                                    {editingId === v.id ? (
                                        <>
                                            <input style={{ ...inputStyle, flex: 1 }} value={editingName} onChange={e => setEditingName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(v.id); if (e.key === 'Escape') setEditingId(null); }} autoFocus />
                                            <button onClick={() => saveEdit(v.id)} style={{ padding: '4px 10px', borderRadius: '999px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
                                            <button onClick={() => setEditingId(null)} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #94a3b8', background: 'transparent', color: '#475569', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                                        </>
                                    ) : (
                                        <>
                                            <div style={{ flex: 1 }}>
                                                <span style={{ fontWeight: '600', fontSize: '0.9375rem', color: '#1e293b' }}>🏭 {v.name}</span>
                                                <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '0.75rem' }}>
                                                    {usersInVertical > 0 && `${usersInVertical} rep${usersInVertical > 1 ? 's' : ''}`}
                                                    {usersInVertical > 0 && teamsInVertical > 0 && ' · '}
                                                    {teamsInVertical > 0 && `${teamsInVertical} team${teamsInVertical > 1 ? 's' : ''}`}
                                                </span>
                                            </div>
                                            <button onClick={() => { setEditingId(v.id); setEditingName(v.name); }} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #94a3b8', background: 'transparent', color: '#475569', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                                            <button onClick={() => deleteVertical(v.id)} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #fca5a5', background: 'transparent', color: '#dc2626', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
