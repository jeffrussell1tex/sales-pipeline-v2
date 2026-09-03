// settings/salesProcess/AccountSegmentsDetail.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { putSettings } from '../shared/saveSettings.js';
import { CSectionCard } from '../shared/form.jsx';
import { StatusChip } from '../shared/ui.jsx';
import { SPDrag } from './shared.jsx';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';
import { useApp } from '../../../AppContext';

const DEFAULT_ACCT_SEGMENTS = [
    { tier:'SMB',        hex:'#8a9a7a', range:'< $10M',       sla:'24h', owner:'SMB teams',   count:312 },
    { tier:'Mid-Market', hex:'#b87333', range:'$10M–$250M',   sla:'8h',  owner:'Mid-Market',  count:148 },
    { tier:'Enterprise', hex:'#7a5a3c', range:'$250M–$1B',    sla:'2h',  owner:'Enterprise',  count:42  },
    { tier:'Strategic',  hex:'#4d6b3d', range:'$1B+',         sla:'30m', owner:'Strategic',   count:11  },
    { tier:'Partner',    hex:'#3a5a7a', range:'n/a',          sla:'4h',  owner:'Channel',     count:18  },
];

const AUTO_CLASS_RULES = [
    { when:'Annual revenue < $10M',      then:'SMB' },
    { when:'Annual revenue $10M–$250M',  then:'Mid-Market' },
    { when:'Annual revenue $250M–$1B',   then:'Enterprise' },
    { when:'Annual revenue ≥ $1B',       then:'Strategic' },
    { when:'Account type = Partner',     then:'Partner' },
];

export const AccountSegmentsDetail = ({ settings, setSettings, onBack, setActiveTab, setAccountsDeepFilter }) => {
    const saved    = settings?.accountSegmentTiers?.length ? settings.accountSegmentTiers : DEFAULT_ACCT_SEGMENTS;
    const [tiers, setTiers]     = useState(() => JSON.parse(JSON.stringify(saved)));
    const [dirty, setDirty]     = useState(false);
    const [saving, setSaving]   = useState(false);
    const [saveError, setSaveError] = useState('');
    const [showAdd, setShowAdd] = useState(false);
    const [newTier, setNewTier] = useState({ tier:'', hex:'#7a6a48', range:'', sla:'', owner:'', count:0 });
    const [addErr, setAddErr]   = useState('');

    const handleCancel = () => { setTiers(JSON.parse(JSON.stringify(saved))); setDirty(false); setShowAdd(false); };
    const handleSave   = async () => {
        setSaving(true);
        setSettings(prev => ({ ...prev, accountSegmentTiers: tiers }));
        try {
            await putSettings({ accountSegmentTiers: tiers });
            setSaveError('');
            setDirty(false);
        } catch (e) {
            // Keep the panel dirty: the change was NOT saved, and clearing the
            // flag here is what made a 403 look like success.
            setSaveError(e.message);
        }
        setSaving(false);
    };

    const handleAddTier = () => {
        if (!newTier.tier.trim()) { setAddErr('Tier name is required.'); return; }
        setTiers(prev => [...prev, { ...newTier, count:0 }]);
        setNewTier({ tier:'', hex:'#7a6a48', range:'', sla:'', owner:'', count:0 });
        setAddErr(''); setShowAdd(false); setDirty(true);
    };

    // Kebab state
    const [openTierKebab, setOpenTierKebab]   = useState(null); // tier index

    // Close kebab on click-outside
    React.useEffect(() => {
        if (openTierKebab === null) return;
        const handler = () => setOpenTierKebab(null);
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, [openTierKebab]);
    const [editingTierIdx, setEditingTierIdx] = useState(null); // inline edit
    const [editingTierVal, setEditingTierVal] = useState({}); // { tier, range, sla, owner, hex }

    const handleDuplicateTier = (i) => {
        const clone = { ...tiers[i], tier: tiers[i].tier + ' (copy)', count: 0 };
        setTiers(prev => [...prev, clone]); setDirty(true); setOpenTierKebab(null);
    };
    const handleDeleteTier = (i) => {
        setTiers(prev => prev.filter((_,ri) => ri !== i)); setDirty(true); setOpenTierKebab(null);
    };
    const handleEditTierSave = (i) => {
        setTiers(prev => prev.map((t,ri) => ri===i ? { ...t, ...editingTierVal } : t));
        setEditingTierIdx(null); setEditingTierVal({}); setDirty(true);
    };

    const inpSm = { padding:'4px 8px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12, color:T.ink, fontFamily:T.sans, outline:'none', width:'100%', boxSizing:'border-box' };

    const { accounts = [] } = useApp();
    const segCounts = useMemo(() => {
        const byLower = {}; tiers.forEach(t => { byLower[String(t.tier).toLowerCase()] = t.tier; });
        const c = {};
        for (const a of accounts) {
            if (a.parentAccountId) continue;
            const seg = String(a.accountSegment || '').trim().toLowerCase();
            if (!seg) continue;
            const canon = byLower[seg];
            if (canon) c[canon] = (c[canon] || 0) + 1;
        }
        return c;
    }, [accounts, tiers]);
    const cnt = (t) => segCounts[t.tier] || 0;
    const topLevelCount = accounts.filter(a => !a.parentAccountId).length;
    const categorized = tiers.reduce((a, t) => a + cnt(t), 0);
    const total = categorized || 1;

    return (
        <CategoryDetailChrome error={saveError}
            crumb="Account segments" title="Account segments"
            subtitle="Account segment tiers (SMB, Mid-market, Enterprise…)"
            statusDetail={`${tiers.length} tiers`}
            onBack={onBack} dirty={dirty} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
            rightActions={
                <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => setShowAdd(true)} style={{ padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>+ New tier</button>
                    <button onClick={handleCancel} disabled={!dirty} style={{ padding:'7px 14px', background:T.surface, color: dirty ? T.ink : T.inkMuted, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor: dirty ? 'pointer' : 'default', fontFamily:T.sans }}>Cancel</button>
                    <button onClick={handleSave} disabled={!dirty || saving} style={{ padding:'7px 14px', background: dirty ? T.ink : T.borderStrong, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor: dirty && !saving ? 'pointer' : 'default', fontFamily:T.sans }}>{saving ? 'Saving…' : 'Save changes'}</button>
                </div>
            }
        >
            <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:20 }}>
                {/* Left */}
                <div>
                    {/* Add tier form */}
                    {showAdd && (
                        <div style={{ background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:T.r+2, padding:16, marginBottom:14, boxShadow:'0 2px 12px rgba(42,38,34,0.08)' }}>
                            <div style={{ fontSize:13, fontWeight:700, color:T.ink, marginBottom:12, fontFamily:T.sans }}>New tier</div>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 120px 80px 1fr auto auto', gap:10, alignItems:'flex-end' }}>
                                {[
                                    { label:'Tier name', key:'tier', placeholder:'e.g. Enterprise' },
                                    { label:'Revenue', key:'range', placeholder:'$250M+' },
                                    { label:'Owning team', key:'owner', placeholder:'e.g. Enterprise' },
                                    { label:'SLA', key:'sla', placeholder:'2h' },
                                ].map(f => (
                                    <div key={f.key}>
                                        <label style={{ fontSize:11, fontWeight:600, color:T.inkMid, display:'block', marginBottom:4, fontFamily:T.sans }}>{f.label}</label>
                                        <input value={newTier[f.key]} onChange={e => setNewTier(p => ({ ...p, [f.key]:e.target.value }))} placeholder={f.placeholder}
                                            style={{ padding:'6px 10px', border:`1px solid ${f.key==='tier'&&addErr ? T.danger : T.border}`, borderRadius:T.r, fontSize:12.5, color:T.ink, fontFamily:T.sans, outline:'none', width:'100%', boxSizing:'border-box' }}/>
                                    </div>
                                ))}
                                <div>
                                    <label style={{ fontSize:11, fontWeight:600, color:T.inkMid, display:'block', marginBottom:4, fontFamily:T.sans }}>Color</label>
                                    <input type="color" value={newTier.hex} onChange={e => setNewTier(p => ({ ...p, hex:e.target.value }))}
                                        style={{ width:38, height:34, border:`1px solid ${T.border}`, borderRadius:T.r, padding:2, cursor:'pointer' }}/>
                                </div>
                                <button onClick={handleAddTier} style={{ padding:'6px 14px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans, alignSelf:'flex-end' }}>Add</button>
                                <button onClick={() => { setShowAdd(false); setAddErr(''); }} style={{ padding:'6px 10px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, cursor:'pointer', fontFamily:T.sans, alignSelf:'flex-end' }}>Cancel</button>
                            </div>
                            {addErr && <div style={{ fontSize:11.5, color:T.danger, marginTop:8, fontFamily:T.sans }}>{addErr}</div>}
                        </div>
                    )}

                    <CSectionCard title="Tiers" description="Drag to reorder. Classification drives auto-assignment rules, SLA, and dashboard grouping.">
                        <div style={{ border:`1px solid ${T.border}`, borderRadius:T.r+2, overflow:'visible' }}>
                            {/* Header */}
                            <div style={{ display:'grid', gridTemplateColumns:'28px 1.3fr 140px 90px 70px 130px 28px', padding:'9px 14px', borderBottom:`1px solid ${T.border}`, background:T.surface2, gap:10, borderRadius:`${T.r+2}px ${T.r+2}px 0 0` }}>
                                {['','Tier','Revenue','Accounts','SLA','Owning team',''].map((h,i) => (
                                    <div key={i} style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', textAlign: i===3||i===4 ? 'right' : 'left', fontFamily:T.sans }}>{h}</div>
                                ))}
                            </div>
                            {tiers.map((t,i) => (
                                <div key={i} style={{ display:'grid', gridTemplateColumns:'28px 1.3fr 140px 90px 70px 130px 28px', padding:'12px 14px', gap:10, borderBottom: i<tiers.length-1 ? `1px solid ${T.border}` : 'none', alignItems:'center', background:T.surface, fontSize:13, fontFamily:T.sans, position:'relative' }}>
                                    <div><SPDrag/></div>

                                    {/* Tier name — inline edit or display */}
                                    <div>
                                        {editingTierIdx === i ? (
                                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                                <input type="color" value={editingTierVal.hex||t.hex} onChange={e => setEditingTierVal(p => ({ ...p, hex:e.target.value }))}
                                                    style={{ width:24, height:24, border:`1px solid ${T.border}`, borderRadius:T.r, padding:1, cursor:'pointer', flexShrink:0 }}/>
                                                <input value={editingTierVal.tier??t.tier} onChange={e => setEditingTierVal(p => ({ ...p, tier:e.target.value }))}
                                                    autoFocus style={{ ...inpSm }} onKeyDown={e => { if (e.key==='Enter') handleEditTierSave(i); if (e.key==='Escape') { setEditingTierIdx(null); setEditingTierVal({}); } }}/>
                                            </div>
                                        ) : (
                                            <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
                                                <span style={{ width:10, height:10, background:t.hex, borderRadius:2, flexShrink:0 }}/>
                                                <b>{t.tier}</b>
                                            </span>
                                        )}
                                    </div>

                                    {/* Revenue */}
                                    <div style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:12, color:T.inkMid }}>
                                        {editingTierIdx === i
                                            ? <input value={editingTierVal.range??t.range} onChange={e => setEditingTierVal(p => ({ ...p, range:e.target.value }))} style={{ ...inpSm, fontFamily:'ui-monospace,Menlo,monospace' }}/>
                                            : t.range}
                                    </div>

                                    {/* Accounts */}
                                    <div style={{ textAlign:'right', fontFamily:T.serif, fontStyle:'italic', fontWeight:700, fontSize:14, color:T.ink }}>{cnt(t)}</div>

                                    {/* SLA */}
                                    <div style={{ textAlign:'right', fontFamily:'ui-monospace,Menlo,monospace', fontSize:12 }}>
                                        {editingTierIdx === i
                                            ? <input value={editingTierVal.sla??t.sla} onChange={e => setEditingTierVal(p => ({ ...p, sla:e.target.value }))} style={{ ...inpSm, textAlign:'right', fontFamily:'ui-monospace,Menlo,monospace', width:56 }}/>
                                            : t.sla}
                                    </div>

                                    {/* Owning team */}
                                    <div style={{ color:T.inkMid, fontSize:12 }}>
                                        {editingTierIdx === i
                                            ? <input value={editingTierVal.owner??t.owner} onChange={e => setEditingTierVal(p => ({ ...p, owner:e.target.value }))} style={{ ...inpSm }}/>
                                            : t.owner}
                                    </div>

                                    {/* Kebab */}
                                    <div style={{ position:'relative' }}>
                                        {editingTierIdx === i ? (
                                            <button onClick={() => handleEditTierSave(i)}
                                                style={{ background:T.ok, border:'none', color:'#fff', borderRadius:T.r, padding:'3px 8px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:T.sans }}>✓</button>
                                        ) : (
                                            <>
                                                <button onClick={e => { e.stopPropagation(); setOpenTierKebab(openTierKebab===i ? null : i); }}
                                                    style={{ background:'none', border:'none', cursor:'pointer', color:T.inkMuted, fontSize:16, padding:0, lineHeight:1 }}>⋯</button>
                                                {openTierKebab === i && (
                                                    <div onClick={e => e.stopPropagation()}
                                                        style={{ position:'absolute', right:0, bottom:'100%', marginBottom:4, zIndex:400, background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2, boxShadow:'0 4px 16px rgba(42,38,34,0.12)', minWidth:200 }}>
                                                        {[
                                                            { label:'Edit tier', action: () => { setEditingTierIdx(i); setEditingTierVal({}); setOpenTierKebab(null); } },
                                                            { label:'Duplicate',  action: () => handleDuplicateTier(i) },
                                                            { label:'View accounts', note:'Filter Accounts tab by this tier', action: () => {
                                                                setOpenTierKebab(null);
                                                                if (setAccountsDeepFilter && setActiveTab) {
                                                                    setAccountsDeepFilter({ accountSegment: t.tier });
                                                                    setActiveTab('accounts');
                                                                }
                                                            }},
                                                            { label:'Where this is used', note: AUTO_CLASS_RULES.filter(r => r.then === t.tier).length > 0 ? `${AUTO_CLASS_RULES.filter(r => r.then === t.tier).length} auto-classification rule${AUTO_CLASS_RULES.filter(r => r.then === t.tier).length!==1?'s':''}` : 'No rules reference this tier', action: () => setOpenTierKebab(null) },
                                                            { label:'Delete', danger:true, action: () => handleDeleteTier(i) },
                                                        ].map((item, mi) => (
                                                            <button key={mi} onClick={item.action} disabled={item.disabled}
                                                                style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', borderTop: mi>0 ? `1px solid ${T.border}` : 'none', textAlign:'left', fontSize:13, color: item.disabled ? T.inkMuted : item.danger ? T.danger : T.ink, cursor: item.disabled ? 'default' : 'pointer', fontFamily:T.sans, opacity: item.disabled ? 0.5 : 1 }}
                                                                onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = item.danger ? 'rgba(156,58,46,0.06)' : T.surface2; }}
                                                                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                                                <div>{item.label}</div>
                                                                {item.note && <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>{item.note}</div>}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CSectionCard>

                    <CSectionCard title="Auto-classification" description="Rules that assign a tier when an account is created or revenue changes.">
                        {AUTO_CLASS_RULES.map((r,i) => (
                            <div key={i} style={{ padding:'10px 0', borderBottom: i<AUTO_CLASS_RULES.length-1 ? `1px solid ${T.border}` : 'none', display:'flex', gap:14, alignItems:'center' }}>
                                <div style={{ flex:1, fontSize:12.5, color:T.ink, fontFamily:T.sans }}>
                                    <span style={{ color:T.inkMuted }}>When</span> <b>{r.when}</b>
                                    <span style={{ color:T.inkMuted }}> → tag as </span>
                                    <b style={{ color:T.goldInk }}>{r.then}</b>
                                </div>
                                <StatusChip status="ok" detail="Active" small/>
                                <span style={{ fontSize:11, color:T.goldInk, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Edit</span>
                            </div>
                        ))}
                    </CSectionCard>
                </div>

                {/* Right — distribution chart */}
                <div>
                    <div style={{ position:'sticky', top:20 }}>
                        <CSectionCard title="Distribution" description="Accounts by tier.">
                            {/* Stacked bar */}
                            <div style={{ display:'flex', gap:2, height:12, borderRadius:2, overflow:'hidden', border:`1px solid ${T.border}`, marginBottom:14 }}>
                                {tiers.map((t,i) => (
                                    <div key={i} style={{ flex: cnt(t), background:t.hex }} title={`${t.tier} — ${cnt(t)}`}/>
                                ))}
                            </div>
                            {tiers.map((t,i) => (
                                <div key={i} style={{ padding:'6px 0', display:'flex', alignItems:'center', gap:8, fontSize:12, borderBottom: i<tiers.length-1 ? `1px solid ${T.border}` : 'none' }}>
                                    <span style={{ width:8, height:8, background:t.hex, borderRadius:2, flexShrink:0 }}/>
                                    <span style={{ flex:1, color:T.ink, fontFamily:T.sans }}>{t.tier}</span>
                                    <span style={{ fontFamily:'ui-monospace,Menlo,monospace', color:T.inkMid }}>{cnt(t)}</span>
                                    <span style={{ width:44, textAlign:'right', fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>{Math.round(cnt(t)/total*100)}%</span>
                                </div>
                            ))}
                            <div style={{ marginTop:10, paddingTop:8, borderTop:`1px solid ${T.border}`, fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>
                                {categorized} of {topLevelCount} accounts assigned a segment
                            </div>
                        </CSectionCard>
                    </div>
                </div>
            </div>
        </CategoryDetailChrome>
    );
};
