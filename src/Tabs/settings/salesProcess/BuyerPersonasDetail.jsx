// settings/salesProcess/BuyerPersonasDetail.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../../AppContext';
import { dbFetch } from '../../../utils/storage';
import { putSettings } from '../shared/saveSettings.js';
import { T, eb } from '../shared/tokens.js';
import { CSectionCard } from '../shared/form.jsx';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';

// Small status pill (restored — was a dropped local helper during the SettingsTab split).
const QPill = ({ tone = 'neutral', children }) => {
    const tones = {
        rep:     { bg: 'rgba(77,107,61,0.14)',   fg: T.ok },      // active / positive
        neutral: { bg: 'rgba(138,131,120,0.15)', fg: T.inkMid },  // archived / muted
        admin:   { bg: 'rgba(200,185,154,0.22)', fg: T.goldInk },
        warn:    { bg: 'rgba(184,115,51,0.15)',  fg: T.warn },
        danger:  { bg: 'rgba(156,58,46,0.12)',   fg: T.danger },
    };
    const c = tones[tone] || tones.neutral;
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 9px', background: c.bg, color: c.fg, borderRadius: 999, fontSize: 11, fontWeight: 600, letterSpacing: 0.2, whiteSpace: 'nowrap', fontFamily: T.sans }}>
            {children}
        </span>
    );
};

const DEFAULT_PERSONAS = [
    { id: 'champion',   name: 'Champion',          color: '#4d6b3d', icon: '★', desc: 'Internal advocate who sells the deal on your behalf.',   titles: ['Director of Operations', 'VP Sales', 'Head of RevOps'], cares: ['Quick wins for the team', 'Looking great to leadership'], objections: ["My team won't adopt another tool"],  active: true },
    { id: 'eb',         name: 'Economic Buyer',    color: '#7a5a3c', icon: '$',      desc: 'Controls the budget and signs the order. Final yes/no.', titles: ['CFO', 'VP Finance', 'COO'],                             cares: ['ROI', 'Total cost of ownership', 'Risk of vendor lock-in'], objections: ["What's the payback period?"],   active: true },
    { id: 'dm',         name: 'Decision Maker',    color: '#b87333', icon: '✓', desc: 'Owns the business outcome the purchase solves.',          titles: ['VP Sales', 'Chief Revenue Officer', 'Head of GTM'],    cares: ['Hitting the number', 'Forecast accuracy'],              objections: ["Will it move the metric they're accountable for?"], active: true },
    { id: 'influencer', name: 'Influencer',        color: '#3a5a7a', icon: '~',      desc: "Provides input but doesn't hold the decision.",           titles: ['Sales Manager', 'RevOps Manager', 'Senior AE'],        cares: ['Daily UX', 'Reports and dashboards', 'Field credibility'], objections: ["How does this fit with our existing stack?"], active: true },
    { id: 'end-user',   name: 'End User',          color: '#9c3a2e', icon: '▣', desc: 'Will live in the product day-to-day. Vetoes happen here.',titles: ['Account Executive', 'SDR', 'Customer Success Manager'], cares: ['Speed of common tasks', 'Mobile experience'],           objections: ["This is going to slow me down"],                 active: true },
    { id: 'gatekeeper', name: 'Gatekeeper',        color: '#8a8378', icon: '⌗', desc: "Procurement, legal, security. Doesn't say yes — says no.", titles: ['IT Security', 'Procurement', 'General Counsel'],       cares: ['SOC 2', 'MSA terms', 'Data residency'],                objections: ["We need vendor security review first"],          active: true },
    { id: 'tech',       name: 'Technical Evaluator', color: '#5a544c', icon: '◧', desc: 'Vets the technical fit and integration risk.',           titles: ['VP Engineering', 'Solutions Architect', 'IT Director'],cares: ['API quality', 'Existing system fit', 'Migration cost'], objections: ["How does the data sync work?"],                  active: true },
];

const PersonaSwatch = ({ p, size = 26 }) => (
    <span style={{
        width: size, height: size, borderRadius: 4,
        background: `${p.color}22`, border: `1px solid ${p.color}55`,
        color: p.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: size * 0.52, flexShrink: 0, userSelect: 'none',
    }}>{p.icon || '?'}</span>
);

// TagsField — defined at module scope so React sees a stable reference.
// Fully controlled: parent owns the comma-string value.
const TagsField = ({ label, value, onChange }) => (
    <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: T.inkMid, display: 'block', marginBottom: 3, fontFamily: T.sans }}>{label}</label>
        <input
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="Comma-separated…"
            style={{ width: '100%', padding: '6px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12.5, color: T.ink, fontFamily: T.sans, outline: 'none', boxSizing: 'border-box' }}
        />
    </div>
);

export const BuyerPersonasDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {
    const { contacts } = useApp();

    const saved = React.useMemo(() => {
        const raw = settings?.buyerPersonas;
        if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_PERSONAS;
        // Support both legacy string array and new rich object array
        if (typeof raw[0] === 'string') return raw.map((name, i) => ({
            id: 'p_' + i, name, color: '#8a8378', icon: '●', desc: '', titles: [], cares: [], objections: [], active: true,
        }));
        return raw;
    }, [settings?.buyerPersonas]);

    const [personas, setPersonas] = React.useState(() => JSON.parse(JSON.stringify(saved)));
    const [dirty,   setDirty]    = React.useState(false);
    const [saveError, setSaveError] = React.useState('');
    const [saving,  setSaving]   = React.useState(false);

    // ── Kebab menu state ──
    const [openKebab, setOpenKebab] = React.useState(null);
    React.useEffect(() => {
        if (openKebab === null) return;
        const handler = (e) => {
            const el = document.getElementById('persona-menu-' + openKebab);
            if (el && el.contains(e.target)) return;
            setOpenKebab(null);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [openKebab]);

    // ── Edit modal state ──
    const BLANK_PERSONA = { id: '', name: '', color: '#7a6a48', icon: '●', desc: '', titles: [], cares: [], objections: [], active: true };
    const [editModal, setEditModal] = React.useState(null); // null | { isNew, data }
    const [editErr,   setEditErr]   = React.useState('');

    // ── Contact counts per persona name ──
    const contactCounts = React.useMemo(() => {
        const map = {};
        (contacts || []).forEach(c => {
            if (c.buyerPersona) map[c.buyerPersona] = (map[c.buyerPersona] || 0) + 1;
        });
        return map;
    }, [contacts]);

    const totalContacts = Object.values(contactCounts).reduce((a, b) => a + b, 0);

    // ── Handlers ──
    const handleSave = async () => {
        setSaving(true);
        setSettings(prev => ({ ...prev, buyerPersonas: personas }));
        try {
            // Was a bare dbFetch with no res.ok check, then setDirty(false) OUTSIDE
            // the try — a failed save reported success.
            await putSettings({ buyerPersonas: personas });
            setSaveError('');
            setDirty(false);
        } catch (e) {
            setSaveError(e.message);
            setSaving(false);
            throw e;
        }
        setSaving(false);
    };
    // Sync dirty state to app-level nav guard
    React.useEffect(() => { if (setSettingsDirty) setSettingsDirty(dirty); return () => { if (setSettingsDirty) setSettingsDirty(false); }; }, [dirty]);
    React.useEffect(() => {
        if (!settingsSaveRef) return;
        settingsSaveRef.current = dirty ? handleSave : null;
        return () => { if (settingsSaveRef) settingsSaveRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dirty]);

    const handleCancel = () => { setPersonas(JSON.parse(JSON.stringify(saved))); setDirty(false); };

    const mutate = (fn) => { setPersonas(prev => { const next = fn([...prev]); return next; }); setDirty(true); };

    const handleDelete = (id, count) => {
        if (count > 0) return;
        mutate(list => list.filter(p => p.id !== id));
        setOpenKebab(null);
    };

    const handleDuplicate = (p) => {
        const clone = { ...p, id: 'p_' + Date.now(), name: p.name + ' (copy)' };
        mutate(list => [...list, clone]);
        setOpenKebab(null);
    };

    const handleArchive = (id) => {
        mutate(list => list.map(p => p.id === id ? { ...p, active: !p.active } : p));
        setOpenKebab(null);
    };

    const openEdit = (p) => {
        setEditModal({ isNew: false, data: {
            ...p,
            titles:     (p.titles     || []).join(', '),
            cares:      (p.cares      || []).join(', '),
            objections: (p.objections || []).join(', '),
        }});
        setEditErr('');
        setOpenKebab(null);
    };

    const openNew = () => {
        setEditModal({ isNew: true, data: { ...BLANK_PERSONA, id: 'p_' + Date.now(), titles: '', cares: '', objections: '' } });
        setEditErr('');
    };

    const saveEdit = () => {
        if (!editModal.data.name.trim()) { setEditErr('Name is required.'); return; }
        const toArr = (str) => (str || '').split(',').map(s => s.trim()).filter(Boolean);
        const finalData = {
            ...editModal.data,
            titles:     toArr(editModal.data.titles),
            cares:      toArr(editModal.data.cares),
            objections: toArr(editModal.data.objections),
        };
        if (editModal.isNew) {
            mutate(list => [...list, finalData]);
        } else {
            mutate(list => list.map(p => p.id === finalData.id ? finalData : p));
        }
        setEditModal(null);
    };

    // ── Tags field helper (comma-split inline) ──
    const COLS = '24px 1.6fr 2fr 80px 90px 28px';

    return (
        <CategoryDetailChrome
            error={saveError}
            crumb="Buyer personas" title="Buyer personas"
            subtitle="Contact persona tags used in the contact form"
            statusDetail={`${personas.filter(p => p.active !== false).length} active personas`}
            updatedBy="Admin" updatedAt="now"
            onBack={onBack} dirty={dirty} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
            rightActions={
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleCancel} disabled={!dirty} style={{ padding: '7px 14px', background: T.surface, color: dirty ? T.ink : T.inkMuted, border: `1px solid ${T.borderStrong}`, borderRadius: T.r, fontSize: 12.5, fontWeight: 600, cursor: dirty ? 'pointer' : 'default', fontFamily: T.sans }}>Cancel</button>
                    <button onClick={openNew} style={{ padding: '7px 14px', background: T.surface, color: T.ink, border: `1px solid ${T.borderStrong}`, borderRadius: T.r, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>+ New persona</button>
                    <button onClick={handleSave} disabled={!dirty || saving} style={{ padding: '7px 14px', background: dirty ? T.ink : T.borderStrong, color: '#fbf8f3', border: 'none', borderRadius: T.r, fontSize: 12.5, fontWeight: 600, cursor: dirty && !saving ? 'pointer' : 'default', fontFamily: T.sans }}>{saving ? 'Saving…' : 'Save changes'}</button>
                </div>
            }
        >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>

                {/* ── LEFT ── */}
                <div>
                    <CSectionCard title="Personas" description="Drag to reorder. Order here is shown in the type-ahead on the Contact form.">
                        {/* Table header */}
                        <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 10, padding: '7px 12px', background: T.surface2, borderRadius: T.r, marginBottom: 4, fontSize: 10, fontWeight: 700, color: T.inkMuted, letterSpacing: 0.6, textTransform: 'uppercase', fontFamily: T.sans }}>
                            <div/>
                            <div>Persona</div>
                            <div>Description</div>
                            <div style={{ textAlign: 'right' }}>Contacts</div>
                            <div>Status</div>
                            <div/>
                        </div>

                        {/* Rows */}
                        {personas.map((p, personaIdx) => {
                            const count = contactCounts[p.name] || 0;
                            const isOpen = openKebab === p.id;
                            const isArchived = p.active === false;
                            return (
                                <div key={p.id} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 10, padding: '10px 12px', alignItems: 'center', borderBottom: `1px solid ${T.border}`, background: isOpen ? 'rgba(200,185,154,0.10)' : 'transparent', position: 'relative', opacity: isArchived ? 0.5 : 1 }}>
                                    {/* Drag handle */}
                                    <div style={{ color: T.border, fontSize: 14, cursor: 'grab', textAlign: 'center', userSelect: 'none' }}>⠿</div>
                                    {/* Name + swatch */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <PersonaSwatch p={p} size={24}/>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: T.sans }}>{p.name}</span>
                                    </div>
                                    {/* Desc */}
                                    <div style={{ fontSize: 12, color: T.inkMid, fontFamily: T.sans, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.desc || '—'}</div>
                                    {/* Count */}
                                    <div style={{ fontSize: 12, color: count > 0 ? T.ink : T.inkMuted, textAlign: 'right', fontFamily: 'ui-monospace, Menlo, monospace' }}>{count}</div>
                                    {/* Status */}
                                    <QPill tone={isArchived ? 'neutral' : 'rep'}>{isArchived ? 'Archived' : 'Active'}</QPill>
                                    {/* Kebab */}
                                    <div style={{ position: 'relative' }}>
                                        <button onClick={e => { e.stopPropagation(); setOpenKebab(isOpen ? null : p.id); }}
                                            style={{ background: isOpen ? 'rgba(200,185,154,0.25)' : 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 3, fontSize: 15, color: isOpen ? T.goldInk : T.inkMuted, lineHeight: 1 }}>⋯</button>
                                        {isOpen && (
                                            <div id={'persona-menu-' + p.id} onClick={e => e.stopPropagation()} style={{ position: 'absolute', right: 0, zIndex: 200, ...(personaIdx >= personas.length - 3 ? { bottom: '100%', marginBottom: 4, top: 'auto' } : { top: '100%', marginTop: 4 }), width: 210, background: T.surface, border: `1px solid ${T.borderStrong}`, borderRadius: 5, padding: 4, boxShadow: '0 8px 24px rgba(42,38,34,0.13)', fontFamily: T.sans }}>
                                                <div style={{ position: 'absolute', top: -6, right: 8, width: 12, height: 12, background: T.surface, border: `1px solid ${T.borderStrong}`, borderRight: 'none', borderBottom: 'none', transform: 'rotate(45deg)' }}/>
                                                {[
                                                    { icon: '✎', label: 'Edit persona',     sub: 'Name, description, color, icon', fn: () => openEdit(p) },
                                                    { icon: '⊕', label: 'Duplicate',        sub: 'Clone with a new name', fn: () => handleDuplicate(p) },
                                                    null,
                                                    { icon: '◑', label: isArchived ? 'Unarchive' : 'Archive', sub: isArchived ? 'Show in type-ahead' : 'Hide from type-ahead', fn: () => handleArchive(p.id) },
                                                    { icon: '🗑', label: 'Delete', danger: true, disabled: count > 0, sub: count > 0 ? `${count} contact${count !== 1 ? 's' : ''} still use this` : 'No contacts use this persona', fn: () => handleDelete(p.id, count) },
                                                ].map((item, idx) => item === null ? (
                                                    <div key={idx} style={{ height: 1, background: T.border, margin: '3px 8px' }}/>
                                                ) : (
                                                    <div key={idx} onClick={item.disabled ? undefined : item.fn}
                                                        style={{ padding: '7px 10px', borderRadius: 3, cursor: item.disabled ? 'default' : 'pointer', opacity: item.disabled ? 0.4 : 1 }}
                                                        onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = 'rgba(200,185,154,0.10)'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <span style={{ width: 14, textAlign: 'center', fontSize: 12 }}>{item.icon}</span>
                                                            <span style={{ fontSize: 12.5, fontWeight: 600, color: item.danger ? T.danger : T.ink }}>{item.label}</span>
                                                        </div>
                                                        {item.sub && <div style={{ fontSize: 11, color: T.inkMuted, marginLeft: 22, marginTop: 1 }}>{item.sub}</div>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        {personas.length === 0 && (
                            <div style={{ padding: '24px', textAlign: 'center', color: T.inkMuted, fontSize: 13, fontStyle: 'italic', fontFamily: T.sans }}>No personas yet. Click + New persona to add one.</div>
                        )}
                    </CSectionCard>
                </div>

                {/* ── RIGHT RAIL ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {/* Contact form preview */}
                    <CSectionCard title="Preview — Contact form" description="What reps see when they assign a persona.">
                        <div style={{ padding: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.r+1 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: T.inkMid, marginBottom: 5, fontFamily: T.sans }}>Persona</div>
                            <div style={{ padding: '6px 8px', background: T.surface, border: `1px solid ${T.borderStrong}`, borderRadius: T.r, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
                                {personas.filter(p => p.active !== false).slice(0, 2).map(p => (
                                    <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px 2px 6px', borderRadius: 10, fontSize: 11.5, background: `${p.color}14`, border: `1px solid ${p.color}40`, color: p.color, fontWeight: 600 }}>
                                        <span style={{ fontSize: 10 }}>{p.icon}</span>{p.name}
                                    </span>
                                ))}
                                <span style={{ fontSize: 12, color: T.inkMuted, fontStyle: 'italic', fontFamily: T.sans }}>Type to search…</span>
                            </div>
                            <div style={{ padding: '5px 8px', background: T.surface, border: `1px solid ${T.borderStrong}`, borderRadius: T.r }}>
                                <div style={{ fontSize: 9.5, fontWeight: 700, color: T.inkMuted, letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 5, fontFamily: T.sans }}>Suggestions</div>
                                {personas.filter(p => p.active !== false).slice(0, 4).map(p => (
                                    <div key={p.id} style={{ padding: '4px 3px', display: 'flex', alignItems: 'center', gap: 7 }}>
                                        <PersonaSwatch p={p} size={17}/>
                                        <span style={{ fontSize: 12, color: T.ink, flex: 1, fontFamily: T.sans }}>{p.name}</span>
                                        <span style={{ fontSize: 10.5, color: T.inkMuted, fontFamily: 'ui-monospace, Menlo, monospace' }}>{contactCounts[p.name] || 0}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CSectionCard>

                    {/* Distribution */}
                    {totalContacts > 0 && (
                        <CSectionCard title="Distribution" description="Contacts assigned to each persona.">
                            <div style={{ display: 'flex', gap: 2, height: 10, borderRadius: 2, overflow: 'hidden', border: `1px solid ${T.border}`, marginBottom: 10 }}>
                                {personas.filter(p => (contactCounts[p.name] || 0) > 0).map(p => (
                                    <div key={p.id} style={{ flex: contactCounts[p.name] || 0, background: p.color }} title={`${p.name} · ${contactCounts[p.name] || 0}`}/>
                                ))}
                            </div>
                            {personas.map(p => {
                                const count = contactCounts[p.name] || 0;
                                if (count === 0) return null;
                                const pct = Math.round((count / totalContacts) * 100);
                                return (
                                    <div key={p.id} style={{ padding: '4px 0', display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontFamily: T.sans }}>
                                        <span style={{ width: 8, height: 8, background: p.color, borderRadius: 2, flexShrink: 0 }}/>
                                        <span style={{ flex: 1, color: T.ink }}>{p.name}</span>
                                        <span style={{ color: T.inkMid, fontFamily: 'ui-monospace, Menlo, monospace' }}>{count}</span>
                                        <span style={{ width: 32, textAlign: 'right', fontSize: 11, color: T.inkMuted }}>{pct}%</span>
                                    </div>
                                );
                            })}
                        </CSectionCard>
                    )}
                </div>
            </div>

            {/* ── Edit / New Persona Modal ── */}
            {editModal && (
                <div onClick={() => setEditModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 8, width: 480, maxWidth: '95vw', boxShadow: '0 16px 48px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
                        {/* Header */}
                        <div style={{ background: '#1c1917', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#f5f1eb', fontFamily: T.sans }}>{editModal.isNew ? 'New persona' : 'Edit persona'}</div>
                            <button onClick={() => setEditModal(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#f5f1eb', cursor: 'pointer', borderRadius: 4, width: 26, height: 26, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                        </div>
                        {/* Body */}
                        <div style={{ padding: 20 }}>
                            {/* Name + Icon + Color row */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 12, marginBottom: 12 }}>
                                <div>
                                    <label style={{ fontSize: 11, fontWeight: 600, color: T.inkMid, display: 'block', marginBottom: 3, fontFamily: T.sans }}>Name *</label>
                                    <input value={editModal.data.name} onChange={e => setEditModal(m => ({ ...m, data: { ...m.data, name: e.target.value } }))}
                                        placeholder="e.g. Champion"
                                        style={{ width: '100%', padding: '7px 10px', border: `1px solid ${editErr ? T.danger : T.border}`, borderRadius: T.r, fontSize: 13, color: T.ink, fontFamily: T.sans, outline: 'none', boxSizing: 'border-box' }}/>
                                </div>
                                <div>
                                    <label style={{ fontSize: 11, fontWeight: 600, color: T.inkMid, display: 'block', marginBottom: 3, fontFamily: T.sans }}>Icon</label>
                                    <input value={editModal.data.icon} onChange={e => setEditModal(m => ({ ...m, data: { ...m.data, icon: e.target.value.slice(0,2) } }))}
                                        placeholder="★"
                                        style={{ width: '100%', padding: '7px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 18, color: T.ink, fontFamily: T.sans, outline: 'none', textAlign: 'center', boxSizing: 'border-box' }}/>
                                </div>
                                <div>
                                    <label style={{ fontSize: 11, fontWeight: 600, color: T.inkMid, display: 'block', marginBottom: 3, fontFamily: T.sans }}>Color</label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, background: T.surface, cursor: 'pointer' }}>
                                        <input type="color" value={editModal.data.color}
                                            onChange={e => setEditModal(m => ({ ...m, data: { ...m.data, color: e.target.value } }))}
                                            style={{ width: 32, height: 28, border: 'none', padding: 0, cursor: 'pointer', background: 'none', flexShrink: 0 }}/>
                                        <PersonaSwatch p={editModal.data} size={20}/>
                                        <span style={{ fontSize: 11, color: T.inkMuted, fontFamily: 'ui-monospace,Menlo,monospace' }}>{editModal.data.color}</span>
                                    </label>
                                </div>
                            </div>
                            {/* Description */}
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ fontSize: 11, fontWeight: 600, color: T.inkMid, display: 'block', marginBottom: 3, fontFamily: T.sans }}>Description</label>
                                <input value={editModal.data.desc || ''} onChange={e => setEditModal(m => ({ ...m, data: { ...m.data, desc: e.target.value } }))}
                                    placeholder="One-line description shown in the type-ahead…"
                                    style={{ width: '100%', padding: '7px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, color: T.ink, fontFamily: T.sans, outline: 'none', boxSizing: 'border-box' }}/>
                            </div>
                            {/* Coaching attributes */}
                            <TagsField label="Typical titles (comma-separated)"
                                value={editModal.data.titles || ''}
                                onChange={v => setEditModal(m => ({ ...m, data: { ...m.data, titles: v } }))}/>
                            <TagsField label="Cares about (comma-separated)"
                                value={editModal.data.cares || ''}
                                onChange={v => setEditModal(m => ({ ...m, data: { ...m.data, cares: v } }))}/>
                            <TagsField label="Common objections (comma-separated)"
                                value={editModal.data.objections || ''}
                                onChange={v => setEditModal(m => ({ ...m, data: { ...m.data, objections: v } }))}/>
                            {editErr && <div style={{ fontSize: 12, color: T.danger, marginTop: 4, fontFamily: T.sans }}>{editErr}</div>}
                        </div>
                        {/* Footer */}
                        <div style={{ padding: '12px 20px', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8, background: T.surface2 }}>
                            <button onClick={() => setEditModal(null)} style={{ padding: '7px 16px', background: T.surface, color: T.ink, border: `1px solid ${T.borderStrong}`, borderRadius: T.r, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>Cancel</button>
                            <button onClick={saveEdit} style={{ padding: '7px 16px', background: T.ink, color: '#fbf8f3', border: 'none', borderRadius: T.r, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>{editModal.isNew ? 'Add persona' : 'Save changes'}</button>
                        </div>
                    </div>
                </div>
            )}
        </CategoryDetailChrome>
    );
};
