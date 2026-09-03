// CoachingNoteDialog — the house dialog for a coaching note addressed to people
// or to a team (state §0.82). Module scope, data as props: a component defined
// inside its parent would remount and lose the draft on every render.
//
// Replaces the "Rep name: note" text prompt (§0.79): the audience is picked,
// never typed, so a note always reaches a real roster row or a real team.
import React, { useState, useMemo } from 'react';
import { useApp } from '../../AppContext';
import { newNotePayload } from '../../utils/coachingNotes';

const T = {
    bg: '#f0ece4', surface: '#fbf8f3', surface2: '#f5efe3', border: '#e6ddd0', borderStrong: '#d4c8b4',
    ink: '#2a2622', inkMid: '#5a544c', inkMuted: '#8a8378', gold: '#c8b99a', goldInk: '#7a6a48', danger: '#9c3a2e',
    sans: '"Plus Jakarta Sans", system-ui, sans-serif', r: 3,
};

const avatarBg = (name) => {
    const p = ['#9c6b4a', '#7a5a3c', '#5a6e5a', '#6b5a7a', '#8a5a5a', '#5a7a8a', '#7a6b5a', '#4a6b5a'];
    let h = 0; for (let i = 0; i < (name || '').length; i++) h = (h * 31 + (name || '').charCodeAt(i)) | 0;
    return p[Math.abs(h) % p.length];
};
const Av = ({ name, size = 22 }) => (
    <div style={{ width: size, height: size, borderRadius: '50%', background: avatarBg(name), color: '#fef4e6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700, flexShrink: 0 }}>
        {(name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
    </div>
);

const seg = (active) => ({
    padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans, border: 'none',
    background: active ? T.ink : 'transparent', color: active ? '#fbf8f3' : T.inkMid, borderRadius: T.r - 1,
});

/**
 * props:
 *   reps     — [{ id, name, team }] the caller may address (Admin: every rep; Manager: their team's)
 *   teams    — [{ id, name }] the caller may address (Admin: every team; Manager: the teams they manage)
 *   onSave   — async ({ recipientIds, teamId, text }) => { ok, error? }
 *   onClose  — () => void
 */
export default function CoachingNoteDialog({ reps = [], teams = [], onSave, onClose, isMobile = false }) {
    const [mode, setMode] = useState(teams.length && !reps.length ? 'team' : 'people');
    const [picked, setPicked] = useState(() => new Set());
    const [teamId, setTeamId] = useState(teams[0]?.id || '');
    const [query, setQuery] = useState('');
    const [text, setText] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const q = query.trim().toLowerCase();
    const shown = useMemo(() => (q ? reps.filter(r => (r.name || '').toLowerCase().includes(q)) : reps), [reps, q]);
    const toggle = (id) => setPicked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const ready = text.trim() && (mode === 'team' ? !!teamId : picked.size > 0);

    const submit = async () => {
        if (!ready || saving) return;
        setSaving(true); setError('');
        const result = await onSave(mode === 'team'
            ? { recipientIds: [], teamId, text: text.trim() }
            : { recipientIds: [...picked], teamId: null, text: text.trim() });
        setSaving(false);
        if (result?.ok) onClose();
        else setError(result?.error || 'Not saved — the server refused the note.');
    };

    const teamName = teams.find(t => t.id === teamId)?.name;

    return (
        <div className="modal-overlay" onClick={saving ? undefined : onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}
                style={{ maxWidth: isMobile ? 'calc(100vw - 2rem)' : '520px', width: '100%', padding: isMobile ? '1.25rem' : '1.75rem 2rem', fontFamily: T.sans, background: T.surface }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: T.ink, marginBottom: 4 }}>Coaching note</div>
                <div style={{ fontSize: 12.5, color: T.inkMid, lineHeight: 1.5, marginBottom: 14 }}>
                    Seen by the people you address, by you, and by Admins. A team note is seen by the team and its manager; someone who joins the team later sees it only if it is dated on or after their first day.
                </div>

                {/* Audience */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: T.inkMuted }}>To</span>
                    <div style={{ display: 'inline-flex', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.r, padding: 2 }}>
                        <button type="button" style={seg(mode === 'people')} onClick={() => setMode('people')}>People</button>
                        <button type="button" style={seg(mode === 'team')} onClick={() => setMode('team')} disabled={!teams.length} title={teams.length ? '' : 'No teams to address'}>Team</button>
                    </div>
                    {mode === 'people' && picked.size > 0 && <span style={{ fontSize: 11.5, color: T.goldInk, fontWeight: 600 }}>{picked.size} selected</span>}
                </div>

                {mode === 'people' ? (
                    <div style={{ border: `1px solid ${T.border}`, borderRadius: T.r, background: T.bg, marginBottom: 12 }}>
                        <div style={{ padding: '8px 10px', borderBottom: `1px solid ${T.border}` }}>
                            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a rep…" autoFocus
                                style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: T.r, padding: '5px 8px', fontSize: 12, fontFamily: T.sans, background: T.surface, color: T.ink, outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                            {shown.length === 0 ? (
                                <div style={{ padding: '12px 10px', fontSize: 12, color: T.inkMuted, fontStyle: 'italic' }}>{reps.length ? 'No reps match.' : 'No reps you can address.'}</div>
                            ) : shown.map(r => (
                                <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer', background: picked.has(r.id) ? 'rgba(200,185,154,0.18)' : 'transparent' }}>
                                    <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} />
                                    <Av name={r.name} />
                                    <span style={{ fontSize: 12.5, color: T.ink, fontWeight: 500 }}>{r.name}</span>
                                    {r.team && <span style={{ fontSize: 10.5, color: T.inkMuted, marginLeft: 'auto' }}>{r.team}</span>}
                                </label>
                            ))}
                        </div>
                    </div>
                ) : (
                    <select value={teamId} onChange={e => setTeamId(e.target.value)}
                        style={{ width: '100%', padding: '7px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12.5, fontFamily: T.sans, background: T.bg, color: T.ink, marginBottom: 12 }}>
                        {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                )}

                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: T.inkMuted, marginBottom: 6 }}>Note</label>
                <textarea value={text} onChange={e => setText(e.target.value)} rows={4} autoFocus={mode === 'team'}
                    placeholder={mode === 'team' && teamName ? `Something the whole ${teamName} team should hear…` : 'Strong discovery call on Beacon Metals — keep leading with the cost-tracker story.'}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, fontFamily: T.sans, background: T.bg, color: T.ink, resize: 'vertical', outline: 'none' }} />

                {error && <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: T.danger }}>{error}</div>}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                    <button type="button" onClick={onClose} disabled={saving}
                        style={{ padding: '8px 16px', border: `1px solid ${T.borderStrong}`, borderRadius: T.r, background: T.surface, color: T.inkMid, fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: T.sans }}>Cancel</button>
                    <button type="button" onClick={submit} disabled={!ready || saving}
                        style={{ padding: '8px 16px', border: 'none', borderRadius: T.r, background: ready && !saving ? T.ink : T.borderStrong, color: '#fbf8f3', fontWeight: 600, fontSize: 12.5, cursor: ready && !saving ? 'pointer' : 'default', fontFamily: T.sans }}>
                        {saving ? 'Saving…' : 'Send note'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// The host: reads the app context, decides whom this caller may address, and
// renders the dialog while `coachingNoteModal` is set. Lives here so ModalLayer
// renders one tag and never grows a second useApp() destructure for it.
//   Admin   — every active rep, every team.
//   Manager — the reps of the teams they manage (team.managerId) or belong to
//             (their own teamId), and those teams.
export function CoachingNoteDialogHost() {
    const { coachingNoteModal, setCoachingNoteModal, addCoachingNote, settings, currentUserId, userRole, isMobile } = useApp();
    if (!coachingNoteModal) return null;
    const users = settings?.users || [];
    const teams = (settings?.teams || []).filter(t => t && t.id && t.name);
    const myTeamId = users.find(u => u.id === currentUserId)?.teamId || null;
    const addressableTeams = userRole === 'Admin' ? teams : teams.filter(t => t.managerId === currentUserId || t.id === myTeamId);
    const teamIds = new Set(addressableTeams.map(t => t.id));
    const reps = users
        .filter(u => u.id && u.name && u.userType === 'User' && u.active !== false)
        .filter(u => userRole === 'Admin' || (u.teamId && teamIds.has(u.teamId)))
        .map(u => ({ id: u.id, name: u.name, team: u.team || '' }));
    const onSave = async ({ recipientIds, teamId, text }) => {
        const payload = newNotePayload({ text, recipientIds, teamId });
        if (!payload) return { ok: false, error: 'Address the note and write something.' };
        return addCoachingNote(payload);
    };
    return <CoachingNoteDialog reps={reps} teams={addressableTeams} onSave={onSave} onClose={() => setCoachingNoteModal(null)} isMobile={isMobile} />;
}
