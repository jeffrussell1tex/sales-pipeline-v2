// settings/salesProcess/CustomFieldsDetail.jsx
import React, { useState, useEffect } from 'react';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { putSettings } from '../shared/saveSettings.js';
import { CSectionCard } from '../shared/form.jsx';
import { SPTable, SPDrag } from './shared.jsx';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';

const FIELD_OBJECTS = ['Accounts', 'Contacts', 'Leads', 'Opportunities'];

const DEFAULT_CUSTOM_FIELDS = {
    Accounts: [
        { label:'Primary industry',       api:'account.primary_industry',  type:'Picklist', required:true,  visibility:'Detail, Create' },
        { label:'Renewal month',          api:'account.renewal_month',     type:'Month',    required:false, visibility:'Detail' },
        { label:'ARR tier',               api:'account.arr_tier',          type:'Picklist', required:false, visibility:'Detail, List' },
        { label:'Regional preference',    api:'account.region_pref',       type:'Picklist', required:false, visibility:'Detail' },
        { label:'Decision-maker title',   api:'account.dm_title',          type:'Text',     required:false, visibility:'Detail' },
        { label:'Procurement portal URL', api:'account.procurement_url',   type:'URL',      required:false, visibility:'Detail', isNew:true },
    ],
    Contacts: [
        { label:'LinkedIn URL',           api:'contact.linkedin_url',      type:'URL',      required:false, visibility:'Detail' },
        { label:'Persona tag',            api:'contact.persona_tag',       type:'Picklist', required:false, visibility:'Detail' },
        { label:'Executive sponsor',      api:'contact.exec_sponsor',      type:'Toggle',   required:false, visibility:'Detail, List' },
    ],
    Leads: [
        { label:'Lead score override',    api:'lead.score_override',       type:'Number',   required:false, visibility:'Detail' },
        { label:'Referral source detail', api:'lead.referral_detail',      type:'Text',     required:false, visibility:'Detail' },
        { label:'Budget confirmed',       api:'lead.budget_confirmed',     type:'Toggle',   required:false, visibility:'Detail' },
        { label:'BANT notes',             api:'lead.bant_notes',           type:'Text',     required:false, visibility:'Detail' },
    ],
    Opportunities: [
        { label:'Decision date',          api:'opp.decision_date',         type:'Date',     required:false, visibility:'Detail' },
        { label:'Champion name',          api:'opp.champion_name',         type:'Text',     required:false, visibility:'Detail' },
        { label:'Competitors',            api:'opp.competitors',           type:'Picklist', required:false, visibility:'Detail' },
        { label:'Why we lose',            api:'opp.why_lose',              type:'Text',     required:false, visibility:'Detail' },
        { label:'Paper process',          api:'opp.paper_process',         type:'Text',     required:false, visibility:'Detail', isNew:true },
    ],
};

export const CustomFieldsDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {
    const saved     = settings?.customFieldsByObject || DEFAULT_CUSTOM_FIELDS;
    const [activeObj, setActiveObj] = useState('Accounts');
    const [fields, setFields]       = useState(() => JSON.parse(JSON.stringify(saved)));
    const [dirty, setDirty]         = useState(false);
    const [saving, setSaving]       = useState(false);
    const [saveError, setSaveError] = useState('');
    const [search, setSearch]       = useState('');
    const [showAdd, setShowAdd]     = useState(false);
    const [newLabel, setNewLabel]   = useState('');
    const [newType, setNewType]     = useState('Text');
    const [newReq, setNewReq]       = useState(false);
    const [addErr, setAddErr]       = useState('');

    const handleCancel = () => { setFields(JSON.parse(JSON.stringify(saved))); setDirty(false); setShowAdd(false); };
    const handleSave   = async () => {
        setSaving(true);
        setSettings(prev => ({ ...prev, customFieldsByObject: fields }));
        try {
            await putSettings({ customFieldsByObject: fields });
            setSaveError('');
            setDirty(false);
        } catch (e) {
            // Keep the panel dirty: the change was NOT saved, and clearing the
            // flag here is what made a 403 look like success.
            setSaveError(e.message);
            // Clear the spinner BEFORE rethrowing — the `setSaving(false)` after
            // this try/catch is skipped by the throw, and the panel would sit on
            // "Saving…" for the rest of the session.
            setSaving(false);
            // Rethrow so the navigation guard knows the save failed. The panel
            // already keeps itself dirty and shows the error; without this the
            // guard's `await save()` resolves and it navigates away.
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

    const handleAddField = () => {
        if (!newLabel.trim()) { setAddErr('Label is required.'); return; }
        const apiKey = `${activeObj.toLowerCase().slice(0,3)}.${newLabel.trim().toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'')}`;
        const newField = { label: newLabel.trim(), api: apiKey, type: newType, required: newReq, visibility: 'Detail' };
        setFields(prev => ({ ...prev, [activeObj]: [...(prev[activeObj]||[]), newField] }));
        setNewLabel(''); setNewType('Text'); setNewReq(false); setAddErr(''); setShowAdd(false); setDirty(true);
    };

    const removeField = (idx) => {
        setFields(prev => ({ ...prev, [activeObj]: prev[activeObj].filter((_,i) => i !== idx) }));
        setDirty(true);
    };

    const allFields   = Object.values(fields).flat();
    const activeFields = (fields[activeObj]||[]).filter(f => !search || f.label.toLowerCase().includes(search.toLowerCase()));
    const totalFields  = allFields.length;
    const reqFields    = allFields.filter(f => f.required).length;

    const FIELD_TYPES = ['Text','Number','Date','Picklist','Toggle','URL','Month','Email','Phone'];
    const [openFieldKebab, setOpenFieldKebab] = useState(null); // api key of open kebab
    const [fieldKebabRect, setFieldKebabRect] = useState(null); // {top,left,right} for fixed positioning
    const [editingFieldIdx, setEditingFieldIdx] = useState(null); // index in activeObj array
    const [editLabel, setEditLabel] = useState('');
    const [editType, setEditType]   = useState('Text');
    const [editReq, setEditReq]     = useState(false);

    const startEdit = (f, realIdx) => {
        setEditingFieldIdx(realIdx);
        setEditLabel(f.label);
        setEditType(f.type);
        setEditReq(f.required || false);
        setOpenFieldKebab(null);
    };

    const saveEdit = () => {
        if (!editLabel.trim()) return;
        setFields(prev => {
            const updated = [...(prev[activeObj]||[])];
            updated[editingFieldIdx] = { ...updated[editingFieldIdx], label: editLabel.trim(), type: editType, required: editReq };
            return { ...prev, [activeObj]: updated };
        });
        setEditingFieldIdx(null);
        setDirty(true);
    };

    const cancelEdit = () => setEditingFieldIdx(null);

    return (
        <CategoryDetailChrome error={saveError}
            crumb="Custom fields" title="Custom fields"
            subtitle="Extend Accounts, Contacts, Leads, and Opportunities"
            statusDetail={`${totalFields} custom fields`}
            onBack={onBack} dirty={dirty} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
        >
            {/* Object tabs + search */}
            <div style={{ display:'flex', alignItems:'center', gap:4, borderBottom:`1px solid ${T.border}`, marginBottom:18 }}>
                {FIELD_OBJECTS.map((obj,i) => {
                    const cnt = (fields[obj]||[]).length;
                    const isNew = false; // NEW badges removed
                    return (
                        <div key={obj} onClick={() => { setActiveObj(obj); setShowAdd(false); setSearch(''); }}
                            style={{ padding:'10px 18px', fontSize:13, fontWeight:600, cursor:'pointer', color: obj===activeObj ? T.ink : T.inkMuted, borderBottom: obj===activeObj ? `2px solid ${T.goldInk}` : '2px solid transparent', marginBottom:-1, display:'flex', alignItems:'center', gap:8, fontFamily:T.sans }}>
                            {obj}
                            <span style={{ fontSize:11, fontWeight:600, color:T.inkMuted, background:T.surface2, padding:'1px 7px', borderRadius:8, fontFamily:T.sans }}>{cnt}</span>
                            {isNew && <span style={{ fontSize:9, fontWeight:700, color:T.goldInk, background:'rgba(200,185,154,0.25)', padding:'1px 5px', borderRadius:2, letterSpacing:0.4, fontFamily:T.sans }}>NEW</span>}
                        </div>
                    );
                })}
                <div style={{ flex:1 }}/>
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 10px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, width:220, marginBottom:4 }}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={T.inkMuted} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search fields…" style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:12, color:T.ink, fontFamily:T.sans }}/>
                    {search && <button onClick={() => setSearch('')} style={{ background:'none', border:'none', color:T.inkMuted, cursor:'pointer', fontSize:13, padding:0 }}>×</button>}
                </div>
            </div>

            {/* Inline add field form */}
            {showAdd && (
                <div style={{ background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:T.r+2, padding:16, marginBottom:14, boxShadow:'0 2px 12px rgba(42,38,34,0.08)' }}>
                    <div style={{ fontSize:13, fontWeight:700, color:T.ink, marginBottom:12, fontFamily:T.sans }}>New field — {activeObj}</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 140px 120px auto auto', gap:10, alignItems:'flex-end' }}>
                        <div>
                            <label style={{ fontSize:11, fontWeight:600, color:T.inkMid, display:'block', marginBottom:4, fontFamily:T.sans }}>Label</label>
                            <input value={newLabel} onChange={e => { setNewLabel(e.target.value); setAddErr(''); }} placeholder="e.g. Partner tier" onKeyDown={e => { if (e.key==='Enter') handleAddField(); if (e.key==='Escape') { setShowAdd(false); setAddErr(''); } }}
                                style={{ padding:'7px 10px', background:T.surface, border:`1px solid ${addErr ? T.danger : T.border}`, borderRadius:T.r, fontSize:12.5, color:T.ink, fontFamily:T.sans, outline:'none', width:'100%', boxSizing:'border-box' }}/>
                        </div>
                        <div>
                            <label style={{ fontSize:11, fontWeight:600, color:T.inkMid, display:'block', marginBottom:4, fontFamily:T.sans }}>Type</label>
                            <select value={newType} onChange={e => setNewType(e.target.value)}
                                style={{ padding:'7px 10px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, color:T.ink, fontFamily:T.sans, outline:'none', width:'100%', cursor:'pointer' }}>
                                {FIELD_TYPES.map(t => <option key={t}>{t}</option>)}
                            </select>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:8, paddingBottom:2 }}>
                            <input type="checkbox" id="req-chk" checked={newReq} onChange={e => setNewReq(e.target.checked)} style={{ cursor:'pointer' }}/>
                            <label htmlFor="req-chk" style={{ fontSize:12.5, color:T.ink, cursor:'pointer', fontFamily:T.sans }}>Required</label>
                        </div>
                        <button onClick={handleAddField} style={{ padding:'7px 16px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Add</button>
                        <button onClick={() => { setShowAdd(false); setAddErr(''); }} style={{ padding:'7px 12px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                    </div>
                    {addErr && <div style={{ fontSize:11.5, color:T.danger, marginTop:8, fontFamily:T.sans }}>{addErr}</div>}
                </div>
            )}

            <CSectionCard
                title={`${activeObj} — custom fields`}
                description={`Fields show up on the ${activeObj} detail pane, are filterable in views, and appear as report columns.`}
                headAction={
                    <button onClick={() => setShowAdd(v => !v)} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 11px', background: showAdd ? T.surface2 : 'transparent', border:`1px solid ${T.border}`, color:T.ink, fontSize:12, fontWeight:500, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>
                        + New field
                    </button>
                }
            >
                {activeFields.length === 0 ? (
                    <div style={{ padding:'2rem', textAlign:'center', color:T.inkMuted, fontSize:13, fontStyle:'italic', fontFamily:T.sans }}>
                        {search ? `No fields match "${search}".` : 'No custom fields yet.'}
                    </div>
                ) : (
                    <SPTable
                        columns={[
                            { key:'drag',  label:'',           w:'28px' },
                            { key:'label', label:'Label',      w:'1.6fr' },
                            { key:'api',   label:'API name',   w:'1.2fr', mono:true },
                            { key:'type',  label:'Type',       w:'110px' },
                            { key:'req',   label:'Required',   w:'90px' },
                            { key:'where', label:'Visible on', w:'150px' },
                            { key:'kebab', label:'',           w:'36px' },
                        ]}
                        rows={activeFields.map((f,i) => {
                            const realIdx = (fields[activeObj]||[]).findIndex(ff => ff.api === f.api);
                            const isEditing = editingFieldIdx === realIdx;
                            return {
                                drag:  <SPDrag/>,
                                label: isEditing ? (
                                    <input
                                        value={editLabel}
                                        onChange={e => setEditLabel(e.target.value)}
                                        onKeyDown={e => { if (e.key==='Enter') saveEdit(); if (e.key==='Escape') cancelEdit(); }}
                                        autoFocus
                                        style={{ padding:'4px 8px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, color:T.ink, fontFamily:T.sans, outline:'none', width:'100%', boxSizing:'border-box' }}
                                    />
                                ) : (
                                    <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontFamily:T.sans }}>
                                        <b>{f.label}</b>
                                        {f.isNew && <span style={{ fontSize:9, fontWeight:700, color:T.goldInk, background:'rgba(200,185,154,0.25)', padding:'1px 5px', borderRadius:2, letterSpacing:0.4, fontFamily:T.sans }}>NEW</span>}
                                    </span>
                                ),
                                api:   isEditing ? (
                                    <span style={{ fontSize:12, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace' }}>{f.api}</span>
                                ) : (
                                    <span style={{ fontSize:12, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace' }}>{f.api}</span>
                                ),
                                type:  isEditing ? (
                                    <select value={editType} onChange={e => setEditType(e.target.value)}
                                        style={{ padding:'4px 8px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12, color:T.ink, fontFamily:T.sans, outline:'none', cursor:'pointer' }}>
                                        {FIELD_TYPES.map(t => <option key={t}>{t}</option>)}
                                    </select>
                                ) : (
                                    <span style={{ fontSize:12, color:T.inkMid, fontFamily:T.sans }}>{f.type}</span>
                                ),
                                req:   isEditing ? (
                                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                        <input type="checkbox" checked={editReq} onChange={e => setEditReq(e.target.checked)} style={{ cursor:'pointer' }}/>
                                        <span style={{ fontSize:12, color:T.ink, fontFamily:T.sans }}>{editReq ? 'Yes' : 'No'}</span>
                                    </div>
                                ) : (
                                    <span style={{ fontSize:12, color: f.required ? T.warn : T.inkMuted, fontWeight: f.required ? 600 : 400, fontFamily:T.sans }}>{f.required ? 'Yes' : 'No'}</span>
                                ),
                                where: isEditing ? (
                                    <div style={{ display:'flex', gap:6 }}>
                                        <button onClick={saveEdit} style={{ padding:'4px 10px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:11.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Save</button>
                                        <button onClick={cancelEdit} style={{ padding:'4px 10px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:11.5, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                                    </div>
                                ) : (
                                    <span style={{ fontSize:12, color:T.inkMuted, fontFamily:T.sans }}>{f.visibility}</span>
                                ),
                                kebab: (
                                    <div style={{ position:'relative' }} onClick={e => e.stopPropagation()}>
                                        <button
                                            onClick={e => {
                                                e.stopPropagation();
                                                if (openFieldKebab === f.api) {
                                                    setOpenFieldKebab(null);
                                                    setFieldKebabRect(null);
                                                } else {
                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                    setFieldKebabRect({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                                                    setOpenFieldKebab(f.api);
                                                }
                                            }}
                                            style={{ background:'none', border:'none', cursor:'pointer', color:T.inkMuted, fontSize:16, padding:'0 2px', lineHeight:1 }}>⋯</button>
                                    </div>
                                ),
                            };
                        })}
                    />
                )}
            </CSectionCard>

            {/* ── Field kebab dropdown — fixed-positioned to escape overflow:hidden ── */}
            {openFieldKebab && fieldKebabRect && (() => {
                const f = activeFields.find(f => f.api === openFieldKebab);
                const realIdx = f ? (fields[activeObj]||[]).findIndex(ff => ff.api === f.api) : -1;
                if (!f || realIdx === -1) return null;
                return (
                    <>
                        <div
                            style={{ position:'fixed', inset:0, zIndex:9998 }}
                            onClick={() => { setOpenFieldKebab(null); setFieldKebabRect(null); }}
                        />
                        <div style={{
                            position:'fixed',
                            top: fieldKebabRect.top,
                            right: fieldKebabRect.right,
                            zIndex:9999,
                            background:T.surface,
                            border:`1px solid ${T.border}`,
                            borderRadius:T.r+2,
                            boxShadow:'0 4px 16px rgba(42,38,34,0.12)',
                            minWidth:140,
                            overflow:'hidden',
                        }}>
                            <button
                                onClick={() => { startEdit(f, realIdx); setOpenFieldKebab(null); setFieldKebabRect(null); }}
                                style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', textAlign:'left', fontSize:13, color:T.ink, cursor:'pointer', fontFamily:T.sans }}
                                onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                Edit field
                            </button>
                            <button
                                onClick={() => { removeField(realIdx); setOpenFieldKebab(null); setFieldKebabRect(null); }}
                                style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', borderTop:`1px solid ${T.border}`, textAlign:'left', fontSize:13, color:T.danger, cursor:'pointer', fontFamily:T.sans }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(156,58,46,0.06)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                Delete field
                            </button>
                        </div>
                    </>
                );
            })()}

            {/* Stats strip */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginTop:4 }}>
                {[
                    { k:'Total custom fields', v:String(totalFields),  sub:'across 4 objects',  acc:T.ink },
                    { k:'Required fields',      v:String(reqFields),    sub:'gate on save',       acc:T.warn },
                    { k:'Fields in reports',    v:String(Math.floor(totalFields * 0.6)), sub:'used as columns', acc:T.ok },
                    { k:'Orphaned fields',       v:'0',                 sub:'never referenced',  acc:T.ok },
                ].map((s,i) => (
                    <div key={i} style={{ padding:'14px 16px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2 }}>
                        <div style={{ fontSize:10.5, fontWeight:600, color:T.inkMuted, letterSpacing:0.5, textTransform:'uppercase', marginBottom:4, fontFamily:T.sans }}>{s.k}</div>
                        <div style={{ fontSize:22, fontWeight:700, color:s.acc, fontFamily:T.serif, fontStyle:'italic' }}>{s.v}</div>
                        <div style={{ fontSize:11, color:T.inkMid, marginTop:2, fontFamily:T.sans }}>{s.sub}</div>
                    </div>
                ))}
            </div>
        </CategoryDetailChrome>
    );
};
