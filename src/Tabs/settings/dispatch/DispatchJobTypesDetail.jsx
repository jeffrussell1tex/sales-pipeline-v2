// settings/dispatch/DispatchJobTypesDetail.jsx
//
// Job Category maps to dispatch_jobs.trade; Job Type maps to dispatch_jobs.jobType.
// Both columns already existed but were hardcoded ('hvac' / 'repair') with no way
// to configure them. Nothing branches on either value, so admin-defined lists are
// safe to introduce.
//
// Types are SCOPED to a category: a type carries a categoryId, and the job form
// filters the Type dropdown by the selected Category. A type with no categoryId
// shows under every category, so the lists degrade gracefully — you can add types
// without categorising them and tighten later without breaking existing jobs.
import React, { useState } from 'react';
import { T } from '../shared/tokens.js';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';
import { dbFetch } from '../../../utils/storage';

const uid = (p) => p + '_' + crypto.randomUUID();

const SEED_CATEGORIES = [
    { id: 'cat_hvac',     name: 'HVAC' },
    { id: 'cat_electric', name: 'Electrical' },
    { id: 'cat_plumbing', name: 'Plumbing' },
    { id: 'cat_solar',    name: 'Solar' },
];

const SEED_TYPES = [
    { id: 'jt_compressor',  name: 'Compressor change',     categoryId: 'cat_hvac' },
    { id: 'jt_filter',      name: 'Filter replacement',    categoryId: 'cat_hvac' },
    { id: 'jt_refrigerant', name: 'Refrigerant charge',    categoryId: 'cat_hvac' },
    { id: 'jt_ductwork',    name: 'Ductwork repair',       categoryId: 'cat_hvac' },
    { id: 'jt_thermostat',  name: 'Thermostat install',    categoryId: 'cat_hvac' },
    { id: 'jt_panel',       name: 'Panel upgrade',         categoryId: 'cat_electric' },
    { id: 'jt_outlet',      name: 'Outlet / switch repair', categoryId: 'cat_electric' },
    { id: 'jt_lighting',    name: 'Lighting install',      categoryId: 'cat_electric' },
    { id: 'jt_leak',        name: 'Leak repair',           categoryId: 'cat_plumbing' },
    { id: 'jt_waterheater', name: 'Water heater install',  categoryId: 'cat_plumbing' },
    { id: 'jt_drain',       name: 'Drain clearing',        categoryId: 'cat_plumbing' },
    { id: 'jt_panelinstall', name: 'Panel install',        categoryId: 'cat_solar' },
    { id: 'jt_inverter',    name: 'Inverter service',      categoryId: 'cat_solar' },
    { id: 'jt_inspection',  name: 'Inspection',            categoryId: null },
    { id: 'jt_estimate',    name: 'Estimate',              categoryId: null },
    { id: 'jt_callback',    name: 'Callback',              categoryId: null },
];

const inp = {
    width: '100%', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: T.r,
    fontSize: 13, color: T.ink, fontFamily: T.sans, background: T.bg, boxSizing: 'border-box', outline: 'none',
};

export const DispatchJobTypesDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {
    const [cats,  setCats]  = useState(() => JSON.parse(JSON.stringify(settings?.dispatchTrades   || [])));
    const [types, setTypes] = useState(() => JSON.parse(JSON.stringify(settings?.dispatchJobTypes || [])));
    const [dirty, setDirty] = useState(false);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const [newCat,  setNewCat]  = useState('');
    const [newType, setNewType] = useState({ name: '', categoryId: '' });

    const touch = () => { setDirty(true); setSettingsDirty && setSettingsDirty(true); };

    const addCat = () => {
        const n = newCat.trim();
        if (!n) return;
        if (cats.some(c => c.name.toLowerCase() === n.toLowerCase())) { setError('That category already exists.'); return; }
        setCats(p => [...p, { id: uid('cat'), name: n }]);
        setNewCat(''); setError(''); touch();
    };

    const addType = () => {
        const n = newType.name.trim();
        if (!n) return;
        setTypes(p => [...p, { id: uid('jt'), name: n, categoryId: newType.categoryId || null }]);
        setNewType({ name: '', categoryId: newType.categoryId });
        setError(''); touch();
    };

    const removeCat = (id) => {
        setCats(p => p.filter(c => c.id !== id));
        // Orphaned types become uncategorised rather than disappearing.
        setTypes(p => p.map(t => t.categoryId === id ? { ...t, categoryId: null } : t));
        touch();
    };

    const seed = () => {
        setCats(SEED_CATEGORIES.map(c => ({ ...c })));
        setTypes(SEED_TYPES.map(t => ({ ...t })));
        setError(''); touch();
    };

    const handleSave = async () => {
        setSaving(true); setError('');
        try {
            const payload = { dispatchTrades: cats, dispatchJobTypes: types };
            const res = await dbFetch('/.netlify/functions/settings', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                if (res.status === 403) throw new Error('You need the Admin role to change these lists.');
                let msg = 'HTTP ' + res.status;
                try { const d = await res.json(); if (d?.error) msg = d.error; } catch (_) {}
                throw new Error(msg);
            }
            setSettings(prev => ({ ...prev, ...payload }));
            setDirty(false);
            setSettingsDirty && setSettingsDirty(false);
        } catch (e) {
            // Surfaced, not swallowed — a failed PUT must not look like a save.
            setError('Could not save: ' + e.message);
            // Rethrow for the navigation guard. `finally` still clears the
            // spinner, so no extra cleanup is needed here.
            throw e;
        } finally {
            setSaving(false);
        }
    };

    if (settingsSaveRef) settingsSaveRef.current = handleSave;

    const catName = (id) => cats.find(c => c.id === id)?.name || null;

    return (
        <CategoryDetailChrome
            crumb="Job categories & types"
            category="Dispatch"
            title="Job categories & types"
            subtitle="The trade a job belongs to, and the specific work within it. Types are filtered by the selected category on the job form."
            onBack={onBack}
            dirty={dirty}
            onCancel={() => {
                setCats(JSON.parse(JSON.stringify(settings?.dispatchTrades || [])));
                setTypes(JSON.parse(JSON.stringify(settings?.dispatchJobTypes || [])));
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

            {cats.length === 0 && types.length === 0 && (
                <div style={{ padding: 14, marginBottom: 16, border: `1px dashed ${T.borderStrong}`, borderRadius: T.r }}>
                    <div style={{ fontSize: 13, color: T.inkMid, fontFamily: T.sans, marginBottom: 8 }}>
                        Nothing defined yet. Start from a standard trades list, then edit to fit.
                    </div>
                    <button onClick={seed}
                        style={{ padding: '6px 14px', background: T.ink, color: T.surface, border: 'none',
                            borderRadius: T.r, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                        Load starter list
                    </button>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 20, alignItems: 'start' }}>
                {/* Categories */}
                <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, fontFamily: T.sans, marginBottom: 8 }}>
                        Job categories
                    </div>
                    {cats.map(c => (
                        <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0',
                            borderBottom: `1px solid ${T.border}` }}>
                            <input value={c.name}
                                onChange={e => { setCats(p => p.map(x => x.id === c.id ? { ...x, name: e.target.value } : x)); touch(); }}
                                style={{ ...inp, padding: '6px 8px' }}/>
                            <span style={{ fontSize: 10.5, color: T.inkMuted, fontFamily: T.mono, whiteSpace: 'nowrap' }}>
                                {types.filter(t => t.categoryId === c.id).length} types
                            </span>
                            <button onClick={() => removeCat(c.id)}
                                style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer',
                                    fontSize: 15, lineHeight: 1, padding: '0 4px' }}>×</button>
                        </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <input value={newCat} onChange={e => setNewCat(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') addCat(); }}
                            placeholder="e.g. Refrigeration" style={{ ...inp, padding: '6px 8px' }}/>
                        <button onClick={addCat}
                            style={{ padding: '6px 12px', background: T.ink, color: T.surface, border: 'none',
                                borderRadius: T.r, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                            Add
                        </button>
                    </div>
                </div>

                {/* Types */}
                <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, fontFamily: T.sans, marginBottom: 8 }}>
                        Job types
                    </div>
                    {types.map(t => (
                        <div key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0',
                            borderBottom: `1px solid ${T.border}` }}>
                            <input value={t.name}
                                onChange={e => { setTypes(p => p.map(x => x.id === t.id ? { ...x, name: e.target.value } : x)); touch(); }}
                                style={{ ...inp, padding: '6px 8px', flex: 2 }}/>
                            <select value={t.categoryId || ''}
                                onChange={e => { setTypes(p => p.map(x => x.id === t.id ? { ...x, categoryId: e.target.value || null } : x)); touch(); }}
                                style={{ ...inp, padding: '6px 8px', flex: 1 }}>
                                <option value="">All categories</option>
                                {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <button onClick={() => { setTypes(p => p.filter(x => x.id !== t.id)); touch(); }}
                                style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer',
                                    fontSize: 15, lineHeight: 1, padding: '0 4px' }}>×</button>
                        </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <input value={newType.name}
                            onChange={e => setNewType(p => ({ ...p, name: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') addType(); }}
                            placeholder="e.g. Compressor change" style={{ ...inp, padding: '6px 8px', flex: 2 }}/>
                        <select value={newType.categoryId}
                            onChange={e => setNewType(p => ({ ...p, categoryId: e.target.value }))}
                            style={{ ...inp, padding: '6px 8px', flex: 1 }}>
                            <option value="">All categories</option>
                            {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <button onClick={addType}
                            style={{ padding: '6px 12px', background: T.ink, color: T.surface, border: 'none',
                                borderRadius: T.r, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                            Add
                        </button>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>
                        A type set to “All categories” appears whichever category is selected on the job form.
                    </div>
                </div>
            </div>

            {dirty && (
                <div style={{ marginTop: 16, fontSize: 11.5, color: T.warn, fontWeight: 600, fontFamily: T.sans }}>
                    Unsaved changes — click Save changes to persist.
                </div>
            )}
        </CategoryDetailChrome>
    );
};

export default DispatchJobTypesDetail;
