// settings/quoting/ProductTypesDetail.jsx
//
// Product & service types (state §0.149 — Jeff: "leave it definable by admin.
// They can create the types of products and services to be associated with
// line items in the price book"). The org's own vocabulary for what a price-book
// item IS, and the job line kind — labor, part, material, fee or discount — each
// becomes when an accepted quote turns into a dispatch job. Stored in
// settings.extra.productTypes; read by the Quotes → Price Book Type select and by
// quote-to-job.mjs. The three built-ins stay (the quote maths and the PDF branch
// on their ids); their kinds are the Admin's to change.
import React, { useState } from 'react';
import { T } from '../shared/tokens.js';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';
import { putSettings } from '../shared/saveSettings.js';
import { cleanProductTypes, BUILTIN_PRODUCT_TYPES, JOB_LINE_TYPES } from '../../../utils/invoices.js';

const KIND_LABELS = { labor: 'Labor', part: 'Part', material: 'Material', fee: 'Fee', discount: 'Discount' };
const BUILTIN_IDS = BUILTIN_PRODUCT_TYPES.map(t => t.id);

const inp = {
    width: '100%', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: T.r,
    fontSize: 13, color: T.ink, fontFamily: T.sans, background: T.bg, boxSizing: 'border-box', outline: 'none',
};

const newId = () => 'pt_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);

export const ProductTypesDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {
    const [types,   setTypes]   = useState(() => cleanProductTypes(settings?.productTypes));
    const [newName, setNewName] = useState('');
    const [newKind, setNewKind] = useState('part');
    const [dirty,   setDirty]   = useState(false);
    const [saving,  setSaving]  = useState(false);
    const [error,   setError]   = useState('');

    const touch = () => { setDirty(true); setSettingsDirty && setSettingsDirty(true); };

    const add = () => {
        const n = newName.trim();
        if (!n) return;
        if (types.some(t => t.name.toLowerCase() === n.toLowerCase())) { setError('That type already exists.'); return; }
        setTypes(p => [...p, { id: newId(), name: n, lineKind: newKind }]);
        setNewName(''); setError(''); touch();
    };
    const setKind = (id, lineKind) => { setTypes(p => p.map(t => t.id === id ? { ...t, lineKind } : t)); touch(); };
    const setName = (id, name)     => { setTypes(p => p.map(t => t.id === id ? { ...t, name } : t)); touch(); };
    const remove  = (id)           => { setTypes(p => p.filter(t => t.id !== id)); touch(); };

    const handleSave = async () => {
        setSaving(true); setError('');
        try {
            const payload = { productTypes: cleanProductTypes(types) };
            await putSettings(payload);
            setSettings(prev => ({ ...prev, ...payload }));
            setTypes(payload.productTypes);
            setDirty(false);
            setSettingsDirty && setSettingsDirty(false);
        } catch (e) {
            // Surfaced, never swallowed — a failed PUT must not look like a save.
            setError('Could not save: ' + e.message);
            throw e;
        } finally {
            setSaving(false);
        }
    };

    if (settingsSaveRef) settingsSaveRef.current = handleSave;

    return (
        <CategoryDetailChrome
            crumb="Product & service types"
            category="Quoting"
            title="Product & service types"
            subtitle="What a price-book item is, and the kind of line it becomes on a job made from an accepted quote."
            onBack={onBack}
            dirty={dirty}
            onCancel={() => { setTypes(cleanProductTypes(settings?.productTypes)); setDirty(false); setError(''); }}
            primaryAction={handleSave}
            primaryLabel={saving ? 'Saving…' : 'Save changes'}
        >
            {error && (
                <div role="alert" style={{ padding: '8px 12px', marginBottom: 12, borderRadius: T.r,
                    background: `${T.danger}12`, color: T.danger, fontSize: 12.5, fontWeight: 600, fontFamily: T.sans }}>
                    {error}
                </div>
            )}

            <div style={{ maxWidth: 560 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 28px', gap: 8, marginBottom: 4, fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: T.sans }}>
                    <span>Type</span><span>Job line kind</span><span/>
                </div>
                {types.map(t => {
                    const builtin = BUILTIN_IDS.includes(t.id);
                    return (
                        <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '1fr 150px 28px', gap: 8, alignItems: 'center', padding: '7px 0',
                            borderBottom: `1px solid ${T.border}` }}>
                            {builtin ? (
                                <div style={{ ...inp, padding: '6px 8px', background: T.surface2, color: T.inkMid }} title="A built-in type — the quote maths depend on it">{t.name}</div>
                            ) : (
                                <input value={t.name} onChange={e => setName(t.id, e.target.value)} style={{ ...inp, padding: '6px 8px' }} aria-label={`${t.name || 'Type'} name`}/>
                            )}
                            <select value={t.lineKind} onChange={e => setKind(t.id, e.target.value)} style={{ ...inp, padding: '6px 8px' }} aria-label={`${t.name || 'Type'} line kind`}>
                                {JOB_LINE_TYPES.map(k => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
                            </select>
                            {builtin ? <span/> : (
                                <button onClick={() => remove(t.id)} aria-label={`Remove ${t.name}`}
                                    style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 4px' }}>×</button>
                            )}
                        </div>
                    );
                })}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px auto', gap: 8, marginTop: 12 }}>
                    <input value={newName} onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') add(); }}
                        placeholder="e.g. Equipment, Permit, Consumables" style={{ ...inp, padding: '6px 8px' }} aria-label="New type name"/>
                    <select value={newKind} onChange={e => setNewKind(e.target.value)} style={{ ...inp, padding: '6px 8px' }} aria-label="New type line kind">
                        {JOB_LINE_TYPES.map(k => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
                    </select>
                    <button onClick={add}
                        style={{ padding: '6px 14px', background: T.ink, color: T.surface, border: 'none',
                            borderRadius: T.r, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                        Add
                    </button>
                </div>

                <div style={{ marginTop: 10, fontSize: 11, color: T.inkMuted, fontFamily: T.sans, lineHeight: 1.5 }}>
                    Each product in Quotes → Price Book carries one of these types. When a quote is accepted and becomes a job, every line takes its
                    type's kind. Recurring, One-time and Service are built in — a recurring product's monthly price is annualised on the quote — and
                    stay; their kinds are yours to change. Removing a type leaves existing products as they are; their lines become parts until retyped.
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

export default ProductTypesDetail;
