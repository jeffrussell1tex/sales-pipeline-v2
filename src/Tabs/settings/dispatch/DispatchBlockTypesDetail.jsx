// settings/dispatch/DispatchBlockTypesDetail.jsx
//
// Reasons a technician is unavailable — PTO, sick, training, jury duty. Stored in
// settings.extra.dispatchBlockTypes and referenced by dispatch_schedule_blocks.
// Admin-managed like job categories, skills and licence levels, so an org can use
// its own vocabulary rather than a hardcoded list.
import React, { useState } from 'react';
import { T } from '../shared/tokens.js';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';
import { dbFetch } from '../../../utils/storage';

const SWATCHES = ['#4d6b3d', '#9c3a2e', '#3a5a7a', '#b87333', '#7a6a48', '#5a544c', '#8a8378'];

const inp = {
    width: '100%', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: T.r,
    fontSize: 13, color: T.ink, fontFamily: T.sans, background: T.bg, boxSizing: 'border-box', outline: 'none',
};

export const DispatchBlockTypesDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {
    const [types,  setTypes]  = useState(() => JSON.parse(JSON.stringify(settings?.dispatchBlockTypes || [])));
    const [newName, setNewName] = useState('');
    const [dirty,  setDirty]  = useState(false);
    const [saving, setSaving] = useState(false);
    const [error,  setError]  = useState('');

    const touch = () => { setDirty(true); setSettingsDirty && setSettingsDirty(true); };

    const add = () => {
        const n = newName.trim();
        if (!n) return;
        if (types.some(t => t.name.toLowerCase() === n.toLowerCase())) { setError('That type already exists.'); return; }
        setTypes(p => [...p, { id: 'bt_' + crypto.randomUUID(), name: n, color: SWATCHES[p.length % SWATCHES.length] }]);
        setNewName(''); setError(''); touch();
    };

    const handleSave = async () => {
        setSaving(true); setError('');
        try {
            const payload = { dispatchBlockTypes: types };
            const res = await dbFetch('/.netlify/functions/settings', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                if (res.status === 403) throw new Error('You need the Admin role to change these types.');
                let msg = 'HTTP ' + res.status;
                try { const d = await res.json(); if (d?.error) msg = d.error; } catch (_) {}
                throw new Error(msg);
            }
            setSettings(prev => ({ ...prev, ...payload }));
            setDirty(false);
            setSettingsDirty && setSettingsDirty(false);
        } catch (e) {
            // Surfaced, never swallowed — a failed PUT must not look like a save.
            setError('Could not save: ' + e.message);
            // Rethrow for the navigation guard. `finally` still clears the
            // spinner, so no extra cleanup is needed here.
            throw e;
        } finally {
            setSaving(false);
        }
    };

    if (settingsSaveRef) settingsSaveRef.current = handleSave;

    return (
        <CategoryDetailChrome
            crumb="Time off & availability"
            category="Dispatch"
            title="Time off & availability types"
            subtitle="Reasons a technician is unavailable. These appear when marking someone out on the Schedule tab."
            onBack={onBack}
            dirty={dirty}
            onCancel={() => {
                setTypes(JSON.parse(JSON.stringify(settings?.dispatchBlockTypes || [])));
                setDirty(false); setError('');
            }}
            primaryAction={handleSave}
            primaryLabel={saving ? 'Saving…' : 'Save changes'}
        >
            {error && (
                <div style={{ padding: '8px 12px', marginBottom: 12, borderRadius: T.r,
                    background: `${T.danger}12`, color: T.danger, fontSize: 12.5, fontWeight: 600, fontFamily: T.sans }}>
                    {error}
                </div>
            )}

            <div style={{ maxWidth: 520 }}>
                {types.length === 0 && (
                    <div style={{ fontSize: 12.5, color: T.inkMuted, fontFamily: T.sans, padding: '8px 0' }}>
                        No types defined — technicians cannot be marked unavailable until you add at least one.
                    </div>
                )}

                {types.map(t => (
                    <div key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 0',
                        borderBottom: `1px solid ${T.border}` }}>
                        <input value={t.name}
                            onChange={e => { setTypes(p => p.map(x => x.id === t.id ? { ...x, name: e.target.value } : x)); touch(); }}
                            style={{ ...inp, padding: '6px 8px' }}/>
                        <div style={{ display: 'flex', gap: 3 }}>
                            {SWATCHES.map(c => (
                                <span key={c}
                                    onClick={() => { setTypes(p => p.map(x => x.id === t.id ? { ...x, color: c } : x)); touch(); }}
                                    title={c}
                                    style={{ width: 16, height: 16, borderRadius: 3, background: c, cursor: 'pointer',
                                        border: t.color === c ? `2px solid ${T.ink}` : `1px solid ${T.border}`,
                                        boxSizing: 'border-box' }}/>
                            ))}
                        </div>
                        <button onClick={() => { setTypes(p => p.filter(x => x.id !== t.id)); touch(); }}
                            style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer',
                                fontSize: 15, lineHeight: 1, padding: '0 4px' }}>×</button>
                    </div>
                ))}

                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <input value={newName} onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') add(); }}
                        placeholder="e.g. Parental leave" style={{ ...inp, padding: '6px 8px' }}/>
                    <button onClick={add}
                        style={{ padding: '6px 14px', background: T.ink, color: T.surface, border: 'none',
                            borderRadius: T.r, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                        Add
                    </button>
                </div>

                <div style={{ marginTop: 10, fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>
                    Removing a type does not delete existing time-off entries — they keep their recorded reason.
                </div>

                {dirty && (
                    <div style={{ marginTop: 14, fontSize: 11.5, color: T.warn, fontWeight: 600, fontFamily: T.sans }}>
                        Unsaved changes — click Save changes to persist.
                    </div>
                )}
            </div>
        </CategoryDetailChrome>
    );
};

export default DispatchBlockTypesDetail;
