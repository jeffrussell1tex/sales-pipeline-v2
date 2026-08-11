// settings/dispatch/DispatchPropertyTypesDetail.jsx
//
// The premises segment for a service customer — Commercial, Residential and so
// on. Previously a hardcoded four-value array in DispatchTab.
//
// NOT the same thing as Settings → Sales process → Customer types, which is the
// CRM account-tier vocabulary (SMB / Mid-Market / Enterprise / Partner). A job
// template ties to that one; a dispatch customer carries this one. They answer
// different questions and are deliberately separate lists.
//
// Ids are load-bearing: `dispatch_customers.customer_type` stores the id, so the
// four seeded ids MUST stay 'commercial' | 'residential' | 'industrial' |
// 'government' or every existing row stops resolving. Labels are free to change.
import React, { useState, useEffect, useCallback } from 'react';
import { dbFetch } from '../../../utils/storage';
import { putSettings } from '../shared/saveSettings.js';
import { T } from '../shared/tokens.js';
import { CSectionCard } from '../shared/form.jsx';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';

// The glyph set DispatchTab can actually draw. A type whose icon is not in this
// list falls back to 'building' rather than rendering nothing.
export const PROPERTY_ICONS = ['building', 'home', 'factory', 'gov'];

const ICON_LABEL = { building: 'Building', home: 'House', factory: 'Factory', gov: 'Civic' };

// Seeded on first open. Ids match the values already written to
// dispatch_customers.customer_type by the previous hardcoded list.
export const DEFAULT_PROPERTY_TYPES = [
    { id: 'commercial',  label: 'Commercial',  icon: 'building' },
    { id: 'residential', label: 'Residential', icon: 'home' },
    { id: 'industrial',  label: 'Industrial',  icon: 'factory' },
    { id: 'government',  label: 'Government',  icon: 'gov' },
];

const slugify = (s) => String(s || '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);

const PIcon = ({ name, size = 14, color = 'currentColor' }) => {
    const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color,
        strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };
    switch (name) {
        case 'home':    return <svg {...p}><path d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1z"/></svg>;
        case 'factory': return <svg {...p}><path d="M3 21V10l5 3V10l5 3V8l6 3v10z"/><path d="M7 17h1M12 17h1M17 17h1"/></svg>;
        case 'gov':     return <svg {...p}><path d="M3 21h18M4 21V10M20 21V10M12 3l9 5H3z"/><path d="M8 21v-7M12 21v-7M16 21v-7"/></svg>;
        default:        return <svg {...p}><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/></svg>;
    }
};

const inputSt = {
    width: '100%', padding: '7px 10px', border: `1px solid ${T.borderStrong}`,
    borderRadius: T.r, fontSize: 13, fontFamily: T.sans, outline: 'none',
    boxSizing: 'border-box', background: T.surface,
};

const btnGhost = {
    padding: '7px 14px', background: T.surface, border: `1px solid ${T.borderStrong}`,
    borderRadius: T.r, fontSize: 12.5, fontWeight: 600, color: T.inkMid, cursor: 'pointer', fontFamily: T.sans,
};

// Module scope: a row component declared inside the panel would remount on every
// keystroke and lose focus.
const TypeRow = ({ type, count, onChange, onRemove, canRemove }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px',
        border: `1px solid ${T.border}`, borderRadius: T.r, marginBottom: 6, background: T.surface }}>
        <PIcon name={type.icon} size={16} color={T.inkMid}/>
        <input value={type.label} onChange={e => onChange({ ...type, label: e.target.value })}
            style={{ ...inputSt, flex: 1, padding: '5px 8px' }}/>
        <select value={type.icon || 'building'} onChange={e => onChange({ ...type, icon: e.target.value })}
            style={{ ...inputSt, width: 110, padding: '5px 8px', fontSize: 12 }}>
            {PROPERTY_ICONS.map(i => <option key={i} value={i}>{ICON_LABEL[i]}</option>)}
        </select>
        <span style={{ fontSize: 11, color: T.inkMuted, fontFamily: 'ui-monospace,Menlo,monospace',
            minWidth: 70, textAlign: 'right' }}>
            {count} in use
        </span>
        <span style={{ fontSize: 10.5, color: T.inkMuted, fontFamily: 'ui-monospace,Menlo,monospace',
            minWidth: 90, textAlign: 'right' }} title="Stored on the customer record — cannot change">
            {type.id}
        </span>
        <button onClick={onRemove} disabled={!canRemove}
            title={canRemove ? 'Remove' : 'In use by customers — reassign them first'}
            style={{ background: 'none', border: 'none', cursor: canRemove ? 'pointer' : 'default',
                color: canRemove ? T.danger : T.borderStrong, fontSize: 15, fontWeight: 700, padding: '0 2px' }}>×</button>
    </div>
);

export const DispatchPropertyTypesDetail = ({ settings, setSettings, onBack, setSettingsDirty }) => {
    const saved = settings?.dispatchPropertyTypes;
    const seeded = (saved && saved.length) ? saved : DEFAULT_PROPERTY_TYPES;

    const [types,  setTypes]  = useState(() => JSON.parse(JSON.stringify(seeded)));
    const [dirty,  setDirty]  = useState(false);
    const [saving, setSaving] = useState(false);
    const [error,  setError]  = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [customers, setCustomers] = useState([]);

    // Usage counts come from the customer records, so a type cannot be removed
    // out from under rows that still reference it.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await dbFetch('/.netlify/functions/dispatch-customers');
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled) setCustomers(data.customers || []);
            } catch (e) { /* counts stay at zero; removal guard falls back to safe */ }
        })();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => { if (setSettingsDirty) setSettingsDirty(dirty); return () => { if (setSettingsDirty) setSettingsDirty(false); }; }, [dirty, setSettingsDirty]);

    const countOf = (id) => customers.filter(c => (c.customerType || 'commercial') === id).length;

    // Types written to customer records but missing from the list — a row that
    // would otherwise render as an unresolvable value in Dispatch.
    const orphans = [...new Set(customers.map(c => c.customerType || 'commercial'))]
        .filter(id => !types.some(t => t.id === id));

    const update = (i, next) => { setTypes(p => p.map((t, j) => j === i ? next : t)); setDirty(true); };
    const remove = (i) => { setTypes(p => p.filter((_, j) => j !== i)); setDirty(true); };

    const add = (label, id) => {
        const text = (label || '').trim();
        if (!text) return;
        const newId = id || slugify(text);
        if (!newId) { setError('That name has no letters or numbers to build an id from.'); return; }
        if (types.some(t => t.id === newId)) { setError(`"${text}" already exists.`); return; }
        setTypes(p => [...p, { id: newId, label: text, icon: 'building' }]);
        setNewLabel('');
        setError('');
        setDirty(true);
    };

    const handleSave = useCallback(async () => {
        const clean = types
            .map(t => ({ id: t.id, label: (t.label || '').trim() || t.id, icon: PROPERTY_ICONS.includes(t.icon) ? t.icon : 'building' }))
            .filter(t => t.id);
        if (!clean.length) { setError('Keep at least one property type.'); return; }
        setSaving(true); setError('');
        setTypes(clean);
        if (setSettings) setSettings(s => ({ ...s, dispatchPropertyTypes: clean }));
        try {
            await putSettings({ dispatchPropertyTypes: clean });
            setDirty(false);
        } catch (err) {
            setError(err.message || 'Save failed.');
        }
        setSaving(false);
    }, [types, setSettings]);

    return (
        <CategoryDetailChrome error={error} crumb="Property types" category="Dispatch" title="Property types"
            subtitle="What kind of premises a service customer is — used to filter the Dispatch customer list and shown on the customer record."
            onBack={onBack} dirty={dirty}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'} disablePrimary={saving}
            onCancel={() => { setTypes(JSON.parse(JSON.stringify(seeded))); setDirty(false); setError(''); }}>

            <CSectionCard title="Property types"
                desc="Rename freely. The id is stored on every customer record, so it is fixed once created.">
                {types.map((t, i) => (
                    <TypeRow key={t.id} type={t} count={countOf(t.id)}
                        onChange={next => update(i, next)}
                        onRemove={() => remove(i)}
                        canRemove={countOf(t.id) === 0 && types.length > 1}/>
                ))}

                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') add(newLabel); }}
                        placeholder="e.g. Retail" style={{ ...inputSt, flex: 1 }}/>
                    <button onClick={() => add(newLabel)} style={{ ...btnGhost, color: T.ink }}>+ Add type</button>
                </div>
                {newLabel.trim() && (
                    <div style={{ marginTop: 5, fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>
                        Will be stored as <strong style={{ color: T.inkMid, fontFamily: 'ui-monospace,Menlo,monospace' }}>{slugify(newLabel) || '—'}</strong>
                    </div>
                )}
            </CSectionCard>

            {orphans.length > 0 && (
                <CSectionCard title="Types in use but not listed"
                    desc="These values exist on customer records but are missing from the list above, so those customers show an unresolved type in Dispatch.">
                    {orphans.map(id => (
                        <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px',
                            border: `1px solid ${T.warn}`, borderLeft: `3px solid ${T.warn}`, borderRadius: T.r,
                            marginBottom: 6, background: `${T.warn}0f`, fontSize: 12.5, fontFamily: T.sans, color: T.ink }}>
                            <span style={{ fontFamily: 'ui-monospace,Menlo,monospace' }}>{id}</span>
                            <span style={{ color: T.inkMuted }}>· {countOf(id)} customer{countOf(id) === 1 ? '' : 's'}</span>
                            <div style={{ flex: 1 }}/>
                            <button onClick={() => add(id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), id)}
                                style={{ ...btnGhost, padding: '5px 10px', fontSize: 12 }}>Add it back</button>
                        </div>
                    ))}
                </CSectionCard>
            )}
        </CategoryDetailChrome>
    );
};

export default DispatchPropertyTypesDetail;
