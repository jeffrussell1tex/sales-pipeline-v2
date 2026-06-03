// settings/salesProcess/IndustriesDetail.jsx
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { CSectionCard } from '../shared/form.jsx';
import { SPDrag } from './shared.jsx';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';

const DEFAULT_INDUSTRIES = [
    { k:'Technology',          subs:['SaaS','Hardware','IT services','Cybersecurity','Fintech'],              n:118 },
    { k:'Manufacturing',       subs:['Industrial','Consumer goods','Automotive','Aerospace'],                 n:74  },
    { k:'Healthcare',          subs:['Providers','Payers','Pharma','Medical devices'],                        n:62  },
    { k:'Financial services',  subs:['Banking','Insurance','Asset mgmt','Capital markets'],                   n:54  },
    { k:'Retail & CPG',        subs:['Apparel','Grocery','E-comm','Luxury'],                                  n:41  },
    { k:'Professional services',subs:['Consulting','Legal','Accounting'],                                     n:38  },
    { k:'Logistics',           subs:['Freight','Warehousing','Last-mile'],                                    n:29  },
    { k:'Energy',              subs:['Oil & gas','Utilities','Renewables'],                                   n:22  },
    { k:'Education',           subs:['K-12','Higher ed','EdTech'],                                            n:18  },
    { k:'Government',          subs:['Federal','State & local','Defense'],                                    n:14  },
    { k:'Real estate',         subs:['Commercial','Residential','PropTech'],                                  n:12  },
    { k:'Media & entertainment',subs:['Publishing','Streaming','Gaming'],                                     n:9   },
    { k:'Agriculture',         subs:['Farming','AgTech'],                                                     n:5   },
    { k:'Non-profit',          subs:['Foundations','NGOs'],                                                   n:4   },
];

export const IndustriesDetail = ({ settings, setSettings, onBack, setActiveTab, setAccountsDeepFilter }) => {
    const saved = settings?.industries?.length ? settings.industries : DEFAULT_INDUSTRIES;
    const [industries, setIndustries] = useState(() => JSON.parse(JSON.stringify(saved)));
    const [dirty, setDirty]     = useState(false);
    const [saving, setSaving]   = useState(false);
    const [expanded, setExpanded] = useState({});
    const [addingSubTo, setAddingSubTo] = useState(null);
    const [newSub, setNewSub]   = useState('');
    const [showAddInd, setShowAddInd] = useState(false);
    const [newInd, setNewInd]   = useState('');
    const [dragIdx, setDragIdx] = useState(null);
    const [overIdx, setOverIdx] = useState(null);

    const handleCancel = () => { setIndustries(JSON.parse(JSON.stringify(saved))); setDirty(false); };
    const handleSave   = async () => {
        setSaving(true);
        setSettings(prev => ({ ...prev, industries }));
        try { await dbFetch('/.netlify/functions/settings', { method:'PUT', body:JSON.stringify({ industries }) }); }
        catch(e) { console.error('save industries', e); }
        setSaving(false); setDirty(false);
    };

    // Industry kebab state
    const [openIndKebab, setOpenIndKebab]     = useState(null); // industry key
    const [kebabPos, setKebabPos]             = useState(null);
    const kebabMenuRef = useRef(null);
    const [renamingInd,  setRenamingInd]      = useState(null); // industry key
    const [renameIndVal, setRenameIndVal]     = useState('');

    // Close kebab on click-outside
    React.useEffect(() => {
        if (openIndKebab === null) return;
        const handler = (e) => {
            if (kebabMenuRef.current && e && e.target && kebabMenuRef.current.contains(e.target)) return;
            setOpenIndKebab(null);
        };
        document.addEventListener('click', handler);
        window.addEventListener('scroll', handler, true);
        window.addEventListener('resize', handler);
        return () => {
            document.removeEventListener('click', handler);
            window.removeEventListener('scroll', handler, true);
            window.removeEventListener('resize', handler);
        };
    }, [openIndKebab]);

    const addSub = (indKey) => {
        if (!newSub.trim()) return;
        setIndustries(prev => prev.map(ind => ind.k === indKey ? { ...ind, subs: [...ind.subs, newSub.trim()] } : ind));
        setNewSub(''); setAddingSubTo(null); setDirty(true);
    };
    const removeSub = (indKey, sub) => {
        setIndustries(prev => prev.map(ind => ind.k === indKey ? { ...ind, subs: ind.subs.filter(s => s !== sub) } : ind));
        setDirty(true);
    };
    const addIndustry = () => {
        if (!newInd.trim()) return;
        setIndustries(prev => [...prev, { k: newInd.trim(), subs:[], n:0 }]);
        setNewInd(''); setShowAddInd(false); setDirty(true);
    };

    // Kebab actions
    const handleRenameInd = (indKey) => {
        if (!renameIndVal.trim() || renameIndVal.trim() === indKey) { setRenamingInd(null); return; }
        setIndustries(prev => prev.map(ind => ind.k === indKey ? { ...ind, k: renameIndVal.trim() } : ind));
        setRenamingInd(null); setRenameIndVal(''); setDirty(true);
    };
    const handleDuplicateInd = (ind) => {
        const clone = { ...ind, k: ind.k + ' (copy)', n: 0 };
        setIndustries(prev => [...prev, clone]); setDirty(true); setOpenIndKebab(null);
    };
    const handleInsertAbove = (i) => {
        const blank = { k: 'New industry', subs: [], n: 0 };
        setIndustries(prev => { const next = [...prev]; next.splice(i, 0, blank); return next; });
        setDirty(true); setOpenIndKebab(null);
    };
    const handleInsertBelow = (i) => {
        const blank = { k: 'New industry', subs: [], n: 0 };
        setIndustries(prev => { const next = [...prev]; next.splice(i + 1, 0, blank); return next; });
        setDirty(true); setOpenIndKebab(null);
    };
    const handleToggleHidden = (indKey) => {
        setIndustries(prev => prev.map(ind => ind.k === indKey ? { ...ind, hidden: !ind.hidden } : ind));
        setDirty(true); setOpenIndKebab(null);
    };
    const handleDeleteInd = (indKey) => {
        setIndustries(prev => prev.filter(ind => ind.k !== indKey));
        setDirty(true); setOpenIndKebab(null);
    };

    const moveIndustry = (from, to) => {
        if (from === null || to === null || from === to || from < 0 || to < 0) return;
        setIndustries(prev => {
            const next = [...prev];
            const [m] = next.splice(from, 1);
            next.splice(to, 0, m);
            return next;
        });
        setDirty(true);
    };

    const total = industries.reduce((a,i) => a+i.n, 0) || 1;
    const totalSubs = industries.reduce((a,i) => a+i.subs.length, 0);

    return (
        <CategoryDetailChrome
            crumb="Industries" title="Industries"
            subtitle="Primary and sub-industry taxonomy"
            statusDetail={`${industries.length} industries · ${totalSubs} sub-types`}
            updatedBy="Admin" updatedAt="4 months ago"
            onBack={onBack} dirty={dirty} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
            rightActions={
                <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => setShowAddInd(true)} style={{ padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>+ New industry</button>
                    <button onClick={handleCancel} disabled={!dirty} style={{ padding:'7px 14px', background:T.surface, color: dirty ? T.ink : T.inkMuted, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor: dirty ? 'pointer' : 'default', fontFamily:T.sans }}>Cancel</button>
                    <button onClick={handleSave} disabled={!dirty || saving} style={{ padding:'7px 14px', background: dirty ? T.ink : T.borderStrong, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor: dirty && !saving ? 'pointer' : 'default', fontFamily:T.sans }}>{saving ? 'Saving…' : 'Save changes'}</button>
                </div>
            }
        >
            <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:20 }}>
                {/* Left */}
                <div>
                    <CSectionCard title="Industry taxonomy" description="Two-level taxonomy. Primary industries are required on every Account; sub-industries are optional.">
                        {/* Add industry form */}
                        {showAddInd && (
                            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                                <input value={newInd} onChange={e => setNewInd(e.target.value)} placeholder="Industry name…" autoFocus
                                    onKeyDown={e => { if (e.key==='Enter') addIndustry(); if (e.key==='Escape') { setShowAddInd(false); setNewInd(''); } }}
                                    style={{ flex:1, padding:'6px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, color:T.ink, fontFamily:T.sans, outline:'none' }}/>
                                <button onClick={addIndustry} style={{ padding:'6px 14px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Add</button>
                                <button onClick={() => { setShowAddInd(false); setNewInd(''); }} style={{ padding:'6px 10px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                            </div>
                        )}

                        <div style={{ border:`1px solid ${T.border}`, borderRadius:T.r+2, background:T.surface, overflow:'hidden' }}>
                            {industries.map((ind,i) => {
                                const isExp = expanded[ind.k];
                                return (
                                    <div key={ind.k} onDragOver={e => { if (dragIdx !== null) { e.preventDefault(); setOverIdx(i); } }} onDrop={e => { e.preventDefault(); moveIndustry(dragIdx, i); setDragIdx(null); setOverIdx(null); }} style={{ borderBottom: i<industries.length-1 ? `1px solid ${T.border}` : 'none', opacity: dragIdx===i ? 0.4 : 1, boxShadow: (overIdx===i && dragIdx!==null && dragIdx!==i) ? `inset 0 2px 0 ${T.goldInk}` : 'none', transition:'box-shadow 80ms, opacity 80ms' }}>
                                        {/* Row header */}
                                        <div style={{ padding:'10px 14px', display:'flex', alignItems:'center', gap:10, opacity: ind.hidden ? 0.5 : 1 }}>
                                            <span draggable onDragStart={e => { setDragIdx(i); e.dataTransfer.effectAllowed='move'; try { e.dataTransfer.setData('text/plain', String(i)); } catch(_) {} }} onDragEnd={() => { setDragIdx(null); setOverIdx(null); }} style={{ cursor:'grab', display:'inline-flex', alignItems:'center' }}><SPDrag/></span>
                                            <span onClick={() => setExpanded(p => ({ ...p, [ind.k]: !isExp }))}
                                                style={{ fontSize:11, color:T.inkMuted, cursor:'pointer', transform: isExp ? 'rotate(0deg)' : 'rotate(-90deg)', display:'inline-block', transition:'transform 120ms', userSelect:'none' }}>▾</span>

                                            {/* Industry name — inline rename or display */}
                                            {renamingInd === ind.k ? (
                                                <input autoFocus value={renameIndVal}
                                                    onChange={e => setRenameIndVal(e.target.value)}
                                                    onKeyDown={e => { if (e.key==='Enter') handleRenameInd(ind.k); if (e.key==='Escape') { setRenamingInd(null); setRenameIndVal(''); } }}
                                                    onBlur={() => handleRenameInd(ind.k)}
                                                    style={{ flex:1, padding:'3px 8px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, fontWeight:600, color:T.ink, fontFamily:T.sans, outline:'none' }}/>
                                            ) : (
                                                <div style={{ flex:1, fontSize:13, fontWeight:600, color:T.ink, fontFamily:T.sans }}>
                                                    {ind.k}
                                                    {ind.hidden && <span style={{ marginLeft:8, fontSize:9, fontWeight:700, color:T.inkMuted, background:T.surface2, padding:'1px 5px', borderRadius:2, letterSpacing:0.4, fontFamily:T.sans }}>HIDDEN</span>}
                                                </div>
                                            )}

                                            <span style={{ fontSize:11, color:T.inkMuted, marginRight:10, fontFamily:T.sans }}>{ind.subs.length} sub-types</span>


                                            {/* Kebab */}
                                            <div style={{ position:'relative', marginLeft:8 }} onClick={e => e.stopPropagation()}>
                                                <button onClick={(e) => {
                                                        if (openIndKebab === ind.k) { setOpenIndKebab(null); return; }
                                                        const r = e.currentTarget.getBoundingClientRect();
                                                        const MENU_W = 224;
                                                        const below = window.innerHeight - r.bottom, above = r.top;
                                                        const openUp = below < 300 && above > below;
                                                        const left = Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8));
                                                        setKebabPos(openUp
                                                            ? { left, bottom: window.innerHeight - r.top + 4, maxHeight: above - 16 }
                                                            : { left, top: r.bottom + 4, maxHeight: below - 16 });
                                                        setOpenIndKebab(ind.k);
                                                    }}
                                                    style={{ background:'none', border:'none', cursor:'pointer', color:T.inkMuted, fontSize:16, padding:0, lineHeight:1 }}>⋯</button>
                                                {openIndKebab === ind.k && kebabPos && createPortal(
                                                    <div ref={kebabMenuRef} onClick={e => e.stopPropagation()} style={{ position:'fixed', left:kebabPos.left, ...(kebabPos.top != null ? { top:kebabPos.top } : { bottom:kebabPos.bottom }), zIndex:1000, width:224, maxHeight:kebabPos.maxHeight, overflowY:'auto', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2, boxShadow:'0 10px 30px rgba(42,38,34,0.20)' }}>

                                                        {/* Edit */}
                                                        {[
                                                            { label:'Edit industry', sub:'Name, description, color', action:() => { setRenamingInd(ind.k); setRenameIndVal(ind.k); setOpenIndKebab(null); } },
                                                            { label:'Duplicate', sub:'Clone with sub-types', action:() => handleDuplicateInd(ind) },
                                                            { label:'Move…', sub:'Drag the handle to reorder', action:() => setOpenIndKebab(null), muted:true },
                                                        ].map((item,mi) => (
                                                            <button key={mi} onClick={item.action}
                                                                style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', borderTop: mi>0 ? `1px solid ${T.border}` : 'none', textAlign:'left', cursor: item.muted ? 'default' : 'pointer', fontFamily:T.sans }}
                                                                onMouseEnter={e => { if (!item.muted) e.currentTarget.style.background = T.surface2; }}
                                                                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                                                <div style={{ fontSize:13, color: item.muted ? T.inkMuted : T.ink }}>{item.label}</div>
                                                                {item.sub && <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>{item.sub}</div>}
                                                            </button>
                                                        ))}

                                                        {/* Add New group */}
                                                        <div style={{ padding:'5px 14px 3px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', borderTop:`1px solid ${T.border}`, background:T.surface2, fontFamily:T.sans }}>Add new</div>
                                                        {[
                                                            { label:'Insert industry above', sub:`New industry above ${ind.k}`, action:() => handleInsertAbove(i) },
                                                            { label:'Insert industry below', sub:`New industry below ${ind.k}`, action:() => handleInsertBelow(i) },
                                                            { label:'Add sub-industry…', sub:`Add a sub-type to ${ind.k}`, action:() => { setAddingSubTo(ind.k); setNewSub(''); setExpanded(p => ({ ...p, [ind.k]: true })); setOpenIndKebab(null); } },
                                                            { label:'Merge into another…', sub:'Move sub-types and accounts', action:() => setOpenIndKebab(null), muted:true },
                                                        ].map((item,mi) => (
                                                            <button key={mi} onClick={item.action}
                                                                style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', borderTop:`1px solid ${T.border}`, textAlign:'left', cursor: item.muted ? 'default' : 'pointer', fontFamily:T.sans }}
                                                                onMouseEnter={e => { if (!item.muted) e.currentTarget.style.background = T.surface2; }}
                                                                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                                                <div style={{ fontSize:13, color: item.muted ? T.inkMuted : T.ink }}>{item.label}</div>
                                                                {item.sub && <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>{item.sub}</div>}
                                                            </button>
                                                        ))}

                                                        {/* Apply to accounts group */}
                                                        <div style={{ padding:'5px 14px 3px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', borderTop:`1px solid ${T.border}`, background:T.surface2, fontFamily:T.sans }}>Apply to accounts</div>
                                                        {[
                                                            { label:'View accounts', sub:'Open in Accounts, filtered', action:() => { setOpenIndKebab(null); if (setAccountsDeepFilter && setActiveTab) { setAccountsDeepFilter({ industry: ind.k }); setActiveTab('accounts'); } } },
                                                            { label:'Reassign accounts…', sub:'Move accounts to another industry', action:() => setOpenIndKebab(null), muted:true },
                                                            { label:'Re-run auto-tagging', sub:'From company name + website', action:() => setOpenIndKebab(null), muted:true },
                                                        ].map((item,mi) => (
                                                            <button key={mi} onClick={item.action}
                                                                style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', borderTop:`1px solid ${T.border}`, textAlign:'left', cursor: item.muted ? 'default' : 'pointer', fontFamily:T.sans }}
                                                                onMouseEnter={e => { if (!item.muted) e.currentTarget.style.background = T.surface2; }}
                                                                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                                                <div style={{ fontSize:13, color: item.muted ? T.inkMuted : T.ink }}>{item.label}</div>
                                                                {item.sub && <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>{item.sub}</div>}
                                                            </button>
                                                        ))}

                                                        {/* Visibility group */}
                                                        <div style={{ padding:'5px 14px 3px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', borderTop:`1px solid ${T.border}`, background:T.surface2, fontFamily:T.sans }}>Visibility</div>
                                                        <button onClick={() => handleToggleHidden(ind.k)}
                                                            style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', borderTop:`1px solid ${T.border}`, textAlign:'left', cursor:'pointer', fontFamily:T.sans }}
                                                            onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                                            <div style={{ fontSize:13, color:T.ink }}>{ind.hidden ? 'Show for new accounts' : 'Hide from new accounts'}</div>
                                                            <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>Existing accounts keep this tag</div>
                                                        </button>
                                                        <button onClick={() => handleDeleteInd(ind.k)}
                                                            style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', borderTop:`1px solid ${T.border}`, textAlign:'left', cursor:'pointer', fontFamily:T.sans }}
                                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(156,58,46,0.06)'}
                                                            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                                            <div style={{ fontSize:13, color:T.danger }}>Delete industry</div>
                                                            <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>Removes tag from all accounts</div>
                                                        </button>
                                                    </div>
                                                , document.body)}
                                            </div>
                                        </div>
                                        {/* Sub-industries */}
                                        <div style={{ padding:'0 14px 10px 52px', display:'flex', flexWrap:'wrap', gap:6 }}>
                                            {ind.subs.map((s,si) => (
                                                <span key={si} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 9px', fontSize:11.5, color:T.inkMid, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:12 }}>
                                                    {s}
                                                    <button onClick={() => removeSub(ind.k, s)} style={{ background:'none', border:'none', color:T.inkMuted, cursor:'pointer', fontSize:12, padding:0, lineHeight:1 }}
                                                        onMouseEnter={e => e.currentTarget.style.color = T.danger}
                                                        onMouseLeave={e => e.currentTarget.style.color = T.inkMuted}>×</button>
                                                </span>
                                            ))}
                                            {addingSubTo === ind.k ? (
                                                <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
                                                    <input value={newSub} onChange={e => setNewSub(e.target.value)} placeholder="Sub-type…" autoFocus
                                                        onKeyDown={e => { if (e.key==='Enter') addSub(ind.k); if (e.key==='Escape') { setAddingSubTo(null); setNewSub(''); } }}
                                                        style={{ width:120, padding:'3px 8px', border:`1px solid ${T.border}`, borderRadius:10, fontSize:11.5, color:T.ink, fontFamily:T.sans, outline:'none' }}/>
                                                    <button onClick={() => addSub(ind.k)} style={{ fontSize:11.5, fontWeight:600, color:T.goldInk, background:'none', border:'none', cursor:'pointer', fontFamily:T.sans }}>Add</button>
                                                    <button onClick={() => { setAddingSubTo(null); setNewSub(''); }} style={{ fontSize:11.5, color:T.inkMuted, background:'none', border:'none', cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                                                </span>
                                            ) : (
                                                <span onClick={() => { setAddingSubTo(ind.k); setNewSub(''); }}
                                                    style={{ padding:'3px 9px', fontSize:11.5, color:T.goldInk, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>+ Add</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CSectionCard>
                </div>

                {/* Right — distribution */}
                <div>
                    <div style={{ position:'sticky', top:20 }}>
                        <CSectionCard title="Distribution" description="Accounts per primary industry.">
                            {industries.map((ind,i) => {
                                const pct = (ind.n/total)*100;
                                return (
                                    <div key={i} style={{ padding:'6px 0', borderBottom: i<industries.length-1 ? `1px solid ${T.border}` : 'none' }}>
                                        <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, marginBottom:4 }}>
                                            <span style={{ flex:1, color:T.ink, fontWeight:500, fontFamily:T.sans }}>{ind.k}</span>
                                            <span style={{ fontFamily:'ui-monospace,Menlo,monospace', color:T.inkMid, fontSize:11 }}>{ind.n}</span>
                                            <span style={{ width:36, textAlign:'right', fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>{pct.toFixed(1)}%</span>
                                        </div>
                                        <div style={{ height:4, background:T.surface2, borderRadius:1 }}>
                                            <div style={{ width:`${pct}%`, height:'100%', background:T.goldInk, opacity:0.7, borderRadius:1 }}/>
                                        </div>
                                    </div>
                                );
                            })}
                        </CSectionCard>
                    </div>
                </div>
            </div>
        </CategoryDetailChrome>
    );
};
