// settings/quoting/PriceBookDetail.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../../AppContext';
import { putSettings } from '../shared/saveSettings.js';
import { T, eb } from '../shared/tokens.js';
import { ATToggle } from './shared.jsx';

const SEGMENTS = ['SMB','Mid-Market','Enterprise'];
const REGIONS  = ['NA','EMEA','APAC','LATAM'];

const DEFAULT_TIERS = [
    { id:'t1', range:'1–24 seats',   price: null,  vsListPct: 0,    autoApply:'always' },
    { id:'t2', range:'25–99 seats',  price: null,  vsListPct: -10,  autoApply:'Quantity ≥ 25' },
    { id:'t3', range:'100–499 seats',price: null,  vsListPct: -20,  autoApply:'Quantity ≥ 100' },
    { id:'t4', range:'500+ seats',   price: null,  vsListPct: -30,  autoApply:'Quantity ≥ 500 · CFO approval' },
];

const makeMatrix = () => {
    const m = {};
    SEGMENTS.forEach(s => { m[s] = {}; REGIONS.forEach(r => { m[s][r] = null; }); });
    return m;
};

const PRICE_BOOK_PRODUCTS = [
    { id:'p1',  sku:'AR-CORE',    name:'Accelerep Core',         category:'Platform', type:'Recurring', unit:'/seat/yr',   listPrice:720,   cost:210, active:true,  tags:['Rules'],
      volumeTiers: DEFAULT_TIERS.map(t => ({ ...t })),
      segMatrix: { SMB:{ NA:720, EMEA:720, APAC:760, LATAM:800 }, 'Mid-Market':{ NA:null,EMEA:null,APAC:null,LATAM:null }, Enterprise:{ NA:null,EMEA:null,APAC:null,LATAM:null } },
      customRules: [{ id:'r1', when:'Deal > $100k', then:'Require VP approval before discount', tone:'warn' }] },
    { id:'p2',  sku:'AR-CORE-P',  name:'Accelerep Core — Premium', category:'Platform', type:'Recurring', unit:'/seat/yr', listPrice:1060,  cost:250, active:true,  tags:['Value'],
      volumeTiers: DEFAULT_TIERS.map(t => ({ ...t })), segMatrix: makeMatrix(), customRules: [] },
    { id:'p3',  sku:'MOD-PIPE',   name:'Pipeline & Forecasting',  category:'Modules',  type:'Recurring', unit:'/seat/yr',  listPrice:240,   cost:40,  active:true,  tags:[],
      volumeTiers: DEFAULT_TIERS.map(t => ({ ...t })), segMatrix: makeMatrix(), customRules: [] },
    { id:'p4',  sku:'MOD-QUOT',   name:'Quoting & CPQ',           category:'Modules',  type:'Recurring', unit:'/seat/yr',  listPrice:180,   cost:30,  active:true,  tags:[],
      volumeTiers: DEFAULT_TIERS.map(t => ({ ...t })), segMatrix: makeMatrix(), customRules: [] },
    { id:'p5',  sku:'MOD-REP',    name:'Reports & Dashboards',     category:'Modules',  type:'Recurring', unit:'/seat/yr',  listPrice:156,   cost:33,  active:true,  tags:[],
      volumeTiers: DEFAULT_TIERS.map(t => ({ ...t })), segMatrix: makeMatrix(), customRules: [] },
    { id:'p6',  sku:'MOD-AI',     name:'AI Assistant',             category:'Modules',  type:'Recurring', unit:'/seat/yr',  listPrice:200,   cost:90,  active:true,  tags:['New'],
      volumeTiers: DEFAULT_TIERS.map(t => ({ ...t })), segMatrix: makeMatrix(), customRules: [] },
    { id:'p7',  sku:'MOD-MOB',    name:'Mobile offline pack',      category:'Modules',  type:'Recurring', unit:'/seat/yr',  listPrice:120,   cost:20,  active:true,  tags:[],
      volumeTiers: DEFAULT_TIERS.map(t => ({ ...t })), segMatrix: makeMatrix(), customRules: [] },
    { id:'p8',  sku:'SVC-ONB-B',  name:'Onboarding — Basic',       category:'Services', type:'One-time',  unit:'/project', listPrice:7500,  cost:980, active:true,  tags:[],
      volumeTiers: [], segMatrix: makeMatrix(), customRules: [] },
    { id:'p9',  sku:'SVC-ONB-W',  name:'Onboarding — White-glove', category:'Services', type:'One-time',  unit:'/project', listPrice:18500, cost:2400,active:true,  tags:[],
      volumeTiers: [], segMatrix: makeMatrix(), customRules: [] },
    { id:'p10', sku:'SVC-DATA',   name:'Data migration',           category:'Services', type:'One-time',  unit:'/project', listPrice:4200,  cost:1200,active:true,  tags:[],
      volumeTiers: [], segMatrix: makeMatrix(), customRules: [] },
    { id:'p11', sku:'SVC-TRAIN',  name:'Team training (full day)', category:'Services', type:'One-time',  unit:'/session', listPrice:1800,  cost:450, active:true,  tags:[],
      volumeTiers: [], segMatrix: makeMatrix(), customRules: [] },
    { id:'p12', sku:'HW-TERM',    name:'Countertop terminal',       category:'Hardware', type:'One-time',  unit:'unit',     listPrice:680,   cost:340, active:true,  tags:[],
      volumeTiers: [], segMatrix: makeMatrix(), customRules: [] },
    { id:'p13', sku:'HW-SCAN',    name:'Wireless scanner',           category:'Hardware', type:'One-time',  unit:'unit',     listPrice:220,   cost:110, active:true,  tags:[],
      volumeTiers: [], segMatrix: makeMatrix(), customRules: [] },
    { id:'p14', sku:'SUP-PREM',   name:'Premium support (24/7)',    category:'Support',  type:'Recurring', unit:'/account/yr',listPrice:4800, cost:1800,active:true,  tags:[],
      volumeTiers: DEFAULT_TIERS.map(t => ({ ...t })), segMatrix: makeMatrix(), customRules: [] },
];

const PRICE_BOOK_BUNDLES = [
    { name:'SMB Starter',    items:3, seats:'Under 50 seats', listTotal:15616, bundlePrice:13947, discPct:11 },
    { name:'Growth Package', items:4, seats:'50–200 seats',   listTotal:31100, bundlePrice:25488, discPct:18 },
    { name:'Enterprise',     items:5, seats:'200+ seats',     listTotal:109456,bundlePrice:92738, discPct:15 },
];

const fmt$ = (v) => '$' + Number(v).toLocaleString();
const fmtPct = (list, cost) => Math.round((list - cost) / list * 100);

// Category filter tabs
const CAT_TABS = ['All','Platform','Modules','Services','Hardware','Support'];

// ── Catalog row overflow menu ──────────────────────────────────
const PBRowMenu = ({ product, onEdit, onDuplicate, onArchive }) => {
    const [open, setOpen] = useState(false);
    const [openUp, setOpenUp] = useState(false);
    const ref = React.useRef(null);
    const btnRef = React.useRef(null);
    React.useEffect(() => {
        if (!open) return;
        const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [open]);
    return (
        <div ref={ref} style={{ position:'relative', flexShrink:0 }}>
            <button ref={btnRef} onClick={e => { e.stopPropagation(); if (!open) { const r = btnRef.current?.getBoundingClientRect(); setOpenUp(r ? window.innerHeight - r.bottom < 180 : false); } setOpen(v => !v); }}
                style={{ padding:'2px 7px', fontSize:15, fontWeight:700, color:T.inkMuted, background:'none', border:'none', cursor:'pointer', lineHeight:1, borderRadius:3 }}
                onMouseEnter={e => e.currentTarget.style.color=T.ink}
                onMouseLeave={e => e.currentTarget.style.color=T.inkMuted}>
                ⋯
            </button>
            {open && (
                <div style={{ position:'absolute', right:0, ...(openUp ? { bottom:'100%', marginBottom:4 } : { top:'100%', marginTop:4 }), background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', minWidth:200, zIndex:30, overflow:'hidden' }}>
                    {[
                        { label:'Edit pricing rules', action:() => { onEdit('tiers'); setOpen(false); } },
                        { label:'Edit product',       action:() => { onEdit('top');   setOpen(false); } },
                        { label:'Duplicate',          action:() => { onDuplicate();   setOpen(false); } },
                        { label:'Archive',            action:() => { onArchive();     setOpen(false); }, danger:true, div:true },
                    ].map((it,i) => (
                        <React.Fragment key={i}>
                            {it.div && <div style={{ height:1, background:T.border }}/>}
                            <div onClick={e => { e.stopPropagation(); it.action(); }}
                                style={{ padding:'8px 14px', fontSize:12.5, color: it.danger ? T.danger : T.ink, cursor:'pointer', fontFamily:T.sans }}
                                onMouseEnter={e => e.currentTarget.style.background=T.surface2}
                                onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                {it.label}
                            </div>
                        </React.Fragment>
                    ))}
                </div>
            )}
        </div>
    );
};

// ── Product Add/Edit Modal ─────────────────────────────────────
// Defined at module level — never recreated on parent re-render,
// so all inputs retain focus between keystrokes.
const PBProductModal = ({ mode, product, onClose, onSave }) => {
    // Draft state
    const blank = { sku:'', name:'', category:'Modules', type:'Recurring', unit:'/seat/yr', listPrice:'', cost:'', active:true,
        volumeTiers: DEFAULT_TIERS.map(t => ({ ...t })), segMatrix: makeMatrix(), customRules: [] };
    const init = mode === 'new' ? blank : { ...product, listPrice: String(product.listPrice), cost: String(product.cost) };

    const [draft, setDraft] = useState(init);
    const [dirty, setDirty] = useState(false);
    const [scrollTarget, setScrollTarget] = useState(null);

    const set = (k, v) => { setDraft(p => ({ ...p, [k]:v })); setDirty(true); };
    const listN = parseFloat(draft.listPrice) || 0;
    const costN  = parseFloat(draft.cost)      || 0;
    const margin = listN > 0 ? fmtPct(listN, costN) : 0;
    const marginGood = margin >= 60;

    // Tier helpers
    const addTier = () => {
        const t = { id:`t${Date.now()}`, range:'', price:null, vsListPct:0, autoApply:'always' };
        setDraft(p => ({ ...p, volumeTiers:[...p.volumeTiers, t] }));
        setDirty(true);
    };
    const setTierField = (idx, k, v) => {
        setDraft(p => {
            const tiers = p.volumeTiers.map((t,i) => i === idx ? { ...t, [k]:v } : t);
            return { ...p, volumeTiers:tiers };
        });
        setDirty(true);
    };
    const removeTier = (idx) => {
        setDraft(p => ({ ...p, volumeTiers: p.volumeTiers.filter((_,i) => i !== idx) }));
        setDirty(true);
    };

    // Matrix helper
    const setMatrix = (seg, reg, v) => {
        setDraft(p => ({
            ...p,
            segMatrix: { ...p.segMatrix, [seg]: { ...p.segMatrix[seg], [reg]: v === '' ? null : parseFloat(v) || null } }
        }));
        setDirty(true);
    };

    const handleSave = () => {
        if (!draft.sku.trim() || !draft.name.trim()) return;
        onSave({
            ...draft,
            listPrice: listN,
            cost: costN,
        });
    };

    const { showConfirm } = useApp();
    const handleBackdrop = () => {
        if (dirty) { showConfirm('Discard unsaved changes?', onClose, false); return; }
        onClose();
    };

    const eyebrow = mode === 'new' ? 'NEW PRODUCT' : `EDIT PRODUCT · ${product?.sku || ''}`;
    const title   = mode === 'new' ? 'New product' : `${product?.name || ''} — pricing rules`;
    const cta     = mode === 'new' ? 'Create product' : 'Publish changes';
    const statusText = mode === 'new' ? 'Drafted product · saves on Create' : `Last edited by Priya yesterday`;

    // Input style helper
    const inp = (extra={}) => ({
        padding:'7px 10px', background:T.surface, border:`1px solid ${T.border}`,
        borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans,
        outline:'none', width:'100%', boxSizing:'border-box', ...extra,
    });

    return (
        <div onClick={handleBackdrop}
            style={{ position:'fixed', inset:0, background:'rgba(20,16,12,0.45)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:T.sans }}>
            <div onClick={e => e.stopPropagation()}
                style={{ background:T.surface, borderRadius:10, width:1100, maxHeight:'calc(100vh - 80px)', display:'flex', flexDirection:'column', boxShadow:'0 24px 64px rgba(20,16,12,0.28)', overflow:'hidden' }}>

                {/* ── Modal header ── */}
                <div style={{ padding:'18px 24px 14px', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
                        <div>
                            <div style={{ ...eb(T.inkMuted), marginBottom:4 }}>{eyebrow}</div>
                            <div style={{ fontFamily:T.serif, fontStyle:'italic', fontSize:22, fontWeight:700, color:T.ink, letterSpacing:-0.3 }}>{title}</div>
                        </div>
                        <button onClick={onClose}
                            style={{ background:'none', border:'none', color:T.inkMuted, fontSize:22, cursor:'pointer', lineHeight:1, padding:'2px 6px', borderRadius:4 }}
                            onMouseEnter={e => e.currentTarget.style.color=T.ink}
                            onMouseLeave={e => e.currentTarget.style.color=T.inkMuted}>×</button>
                    </div>
                </div>

                {/* ── Modal body — scrollable ── */}
                <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>

                    {/* 1. Identity row — 6-column grid */}
                    <div style={{ display:'grid', gridTemplateColumns:'110px 1fr 1fr 130px 110px 100px', gap:12, marginBottom:18 }}>
                        {/* SKU */}
                        <div>
                            <label style={{ display:'block', fontSize:11, fontWeight:600, color:T.inkMid, marginBottom:4, fontFamily:T.sans }}>SKU</label>
                            <input value={draft.sku} onChange={e => set('sku', e.target.value)}
                                placeholder="AR-NEW" style={inp({ fontFamily:'ui-monospace,Menlo,monospace', fontSize:12 })}/>
                        </div>
                        {/* Product name */}
                        <div>
                            <label style={{ display:'block', fontSize:11, fontWeight:600, color:T.inkMid, marginBottom:4, fontFamily:T.sans }}>Product name</label>
                            <input value={draft.name} onChange={e => set('name', e.target.value)}
                                placeholder="e.g. Pipeline & Forecasting" style={inp()}/>
                        </div>
                        {/* Category */}
                        <div>
                            <label style={{ display:'block', fontSize:11, fontWeight:600, color:T.inkMid, marginBottom:4, fontFamily:T.sans }}>Category</label>
                            <select value={draft.category} onChange={e => set('category', e.target.value)} style={{ ...inp(), appearance:'none', cursor:'pointer',
                                backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%238a8378' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                                backgroundRepeat:'no-repeat', backgroundPosition:'right 9px center', paddingRight:26 }}>
                                {['Platform','Modules','Services','Hardware','Support'].map(c => <option key={c}>{c}</option>)}
                            </select>
                        </div>
                        {/* Type */}
                        <div>
                            <label style={{ display:'block', fontSize:11, fontWeight:600, color:T.inkMid, marginBottom:4, fontFamily:T.sans }}>Type</label>
                            <select value={draft.type} onChange={e => set('type', e.target.value)} style={{ ...inp(), appearance:'none', cursor:'pointer',
                                backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%238a8378' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                                backgroundRepeat:'no-repeat', backgroundPosition:'right 9px center', paddingRight:26 }}>
                                {['Recurring','One-time'].map(c => <option key={c}>{c}</option>)}
                            </select>
                        </div>
                        {/* Unit */}
                        <div>
                            <label style={{ display:'block', fontSize:11, fontWeight:600, color:T.inkMid, marginBottom:4, fontFamily:T.sans }}>Unit</label>
                            <input value={draft.unit} onChange={e => set('unit', e.target.value)}
                                placeholder="/seat/yr" style={inp({ fontFamily:'ui-monospace,Menlo,monospace', fontSize:12 })}/>
                        </div>
                        {/* Active toggle */}
                        <div>
                            <label style={{ display:'block', fontSize:11, fontWeight:600, color:T.inkMid, marginBottom:4, fontFamily:T.sans }}>Active</label>
                            <div style={{ display:'flex', alignItems:'center', gap:7, paddingTop:8 }}>
                                <ATToggle on={draft.active} onChange={() => set('active', !draft.active)}/>
                                <span style={{ fontSize:12, color:T.inkMuted }}>{draft.active ? 'Yes' : 'No'}</span>
                            </div>
                        </div>
                    </div>

                    {/* 2. Pricing summary cards */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:22 }}>
                        {/* List price */}
                        <div style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, padding:'14px 18px' }}>
                            <div style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', fontFamily:T.sans, marginBottom:8 }}>List price</div>
                            <div style={{ display:'flex', alignItems:'baseline', gap:4 }}>
                                <span style={{ fontSize:11, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace' }}>$</span>
                                <input value={draft.listPrice} onChange={e => set('listPrice', e.target.value)}
                                    style={{ fontSize:26, fontWeight:700, color:T.ink, fontFamily:T.serif, fontStyle:'italic', border:'none', background:'transparent', outline:'none', width:'100%', padding:0 }}
                                    placeholder="0"/>
                                <span style={{ fontSize:12, color:T.inkMuted, fontFamily:T.sans, whiteSpace:'nowrap' }}>{draft.unit}</span>
                            </div>
                        </div>
                        {/* Cost */}
                        <div style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, padding:'14px 18px' }}>
                            <div style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', fontFamily:T.sans, marginBottom:8 }}>Cost</div>
                            <div style={{ display:'flex', alignItems:'baseline', gap:4 }}>
                                <span style={{ fontSize:11, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace' }}>$</span>
                                <input value={draft.cost} onChange={e => set('cost', e.target.value)}
                                    style={{ fontSize:26, fontWeight:700, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace', border:'none', background:'transparent', outline:'none', width:'100%', padding:0 }}
                                    placeholder="0"/>
                            </div>
                        </div>
                        {/* Margin — computed */}
                        <div style={{ background:T.bg, border:`1px solid ${marginGood ? T.ok : T.warn}`, borderRadius:8, padding:'14px 18px' }}>
                            <div style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', fontFamily:T.sans, marginBottom:8 }}>Margin</div>
                            <div style={{ fontSize:26, fontWeight:700, color: marginGood ? T.ok : T.warn, fontFamily:'ui-monospace,Menlo,monospace' }}>
                                {listN > 0 ? `${margin}%` : '—'}
                            </div>
                        </div>
                    </div>

                    {/* 3. Volume tiers */}
                    <div style={{ marginBottom:22 }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                            <div>
                                <div style={{ fontSize:15, fontWeight:700, color:T.ink, fontFamily:T.sans }}>Volume tiers</div>
                                <div style={{ fontSize:12, color:T.inkMid, marginTop:2, fontFamily:T.sans }}>Per seat list price changes by quantity. Stacks with segment override.</div>
                            </div>
                            <button onClick={addTier}
                                style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 12px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12, fontWeight:600, color:T.ink, cursor:'pointer', fontFamily:T.sans }}
                                onMouseEnter={e => e.currentTarget.style.background=T.surface2}
                                onMouseLeave={e => e.currentTarget.style.background=T.surface}>
                                + Add tier
                            </button>
                        </div>
                        {draft.volumeTiers.length === 0 ? (
                            <div style={{ padding:'20px 14px', border:`1.5px dashed ${T.border}`, borderRadius:6, textAlign:'center', color:T.inkMuted, fontSize:12.5 }}>
                                No tiers — list price applies to all quantities.
                                <button onClick={addTier} style={{ marginLeft:8, color:T.goldInk, fontWeight:600, background:'none', border:'none', cursor:'pointer', fontFamily:T.sans, fontSize:12.5 }}>Add first tier →</button>
                            </div>
                        ) : (
                            <div style={{ border:`1px solid ${T.border}`, borderRadius:6, overflow:'hidden' }}>
                                {/* Header */}
                                <div style={{ display:'grid', gridTemplateColumns:'1fr 160px 100px 1fr 32px', padding:'8px 14px', background:T.surface2, borderBottom:`1px solid ${T.border}`, gap:10 }}>
                                    {['Quantity Range','Price / Seat / Yr','vs List','Auto-apply when',''].map((h,i) => (
                                        <div key={i} style={{ fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', fontFamily:T.sans }}>{h}</div>
                                    ))}
                                </div>
                                {draft.volumeTiers.map((tier, idx) => {
                                    const tierPrice = tier.vsListPct !== 0 && listN > 0
                                        ? Math.round(listN * (1 + tier.vsListPct / 100))
                                        : (tier.price || listN || 0);
                                    return (
                                        <div key={tier.id} style={{ display:'grid', gridTemplateColumns:'1fr 160px 100px 1fr 32px', padding:'9px 14px', borderBottom:`1px solid ${T.border}`, gap:10, alignItems:'center' }}>
                                            {/* Range */}
                                            <input value={tier.range} onChange={e => setTierField(idx,'range',e.target.value)}
                                                placeholder="e.g. 1–24 seats"
                                                style={{ padding:'5px 8px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface }}/>
                                            {/* Price display */}
                                            <div style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:13, color:T.ink }}>
                                                {tierPrice > 0 ? fmt$(tierPrice) : '—'}
                                            </div>
                                            {/* vs List pct */}
                                            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                                                <input type="number" value={tier.vsListPct} onChange={e => setTierField(idx,'vsListPct',Number(e.target.value))}
                                                    style={{ width:54, padding:'4px 6px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12, color: tier.vsListPct < 0 ? T.danger : T.ok, fontFamily:'ui-monospace,Menlo,monospace', outline:'none', background:T.surface, textAlign:'right' }}/>
                                                <span style={{ fontSize:12, color:T.inkMuted }}>%</span>
                                            </div>
                                            {/* Auto-apply */}
                                            <input value={tier.autoApply} onChange={e => setTierField(idx,'autoApply',e.target.value)}
                                                placeholder="always"
                                                style={{ padding:'5px 8px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface }}/>
                                            {/* Remove */}
                                            <button onClick={() => removeTier(idx)}
                                                style={{ width:24, height:24, display:'flex', alignItems:'center', justifyContent:'center', background:'none', border:'none', color:T.inkMuted, cursor:'pointer', fontSize:16, borderRadius:3 }}
                                                onMouseEnter={e => e.currentTarget.style.color=T.danger}
                                                onMouseLeave={e => e.currentTarget.style.color=T.inkMuted}>×</button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* 4. Segment × region matrix */}
                    <div style={{ marginBottom:22 }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                            <div>
                                <div style={{ fontSize:15, fontWeight:700, color:T.ink, fontFamily:T.sans }}>Segment × region matrix</div>
                                <div style={{ fontSize:12, color:T.inkMid, marginTop:2, fontFamily:T.sans }}>Override list price by combining customer segment and region. Empty cells inherit list.</div>
                            </div>
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                <span style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>Highlight:</span>
                                <span style={{ fontSize:12, fontWeight:600, color:T.goldInk, fontFamily:T.sans }}>Deviations from list ▾</span>
                            </div>
                        </div>
                        <div style={{ border:`1px solid ${T.border}`, borderRadius:6, overflow:'hidden' }}>
                            {/* Header row */}
                            <div style={{ display:'grid', gridTemplateColumns:`160px repeat(${REGIONS.length}, 1fr)`, background:T.surface2, borderBottom:`1px solid ${T.border}` }}>
                                <div style={{ padding:'8px 12px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', fontFamily:T.sans }}>Segment / Region</div>
                                {REGIONS.map(r => (
                                    <div key={r} style={{ padding:'8px 12px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', fontFamily:T.sans, textAlign:'center' }}>{r}</div>
                                ))}
                            </div>
                            {/* Data rows */}
                            {SEGMENTS.map((seg, si) => (
                                <div key={seg} style={{ display:'grid', gridTemplateColumns:`160px repeat(${REGIONS.length}, 1fr)`, borderBottom: si < SEGMENTS.length-1 ? `1px solid ${T.border}` : 'none' }}>
                                    <div style={{ padding:'10px 12px', fontSize:13, fontWeight:600, color:T.inkMid, fontFamily:T.sans, borderRight:`1px solid ${T.border}`, background:T.surface2 }}>{seg}</div>
                                    {REGIONS.map(reg => {
                                        const val = draft.segMatrix?.[seg]?.[reg];
                                        const devFromList = val !== null && val !== undefined && listN > 0 && val !== listN;
                                        const devPct = devFromList ? Math.round((val - listN) / listN * 100) : null;
                                        return (
                                            <MatrixCell key={reg} value={val} listPrice={listN} devPct={devPct}
                                                onChange={v => setMatrix(seg, reg, v)}/>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 5. Custom rules */}
                    <div style={{ marginBottom:8 }}>
                        <div style={{ fontSize:15, fontWeight:700, color:T.ink, fontFamily:T.sans, marginBottom:4 }}>Custom rules</div>
                        {draft.customRules.length === 0 ? (
                            <div style={{ padding:'18px 14px', border:`1.5px dashed ${T.border}`, borderRadius:6, fontSize:12.5, color:T.inkMuted, textAlign:'center' }}>
                                No custom rules yet —{' '}
                                <button onClick={() => {
                                    setDraft(p => ({ ...p, customRules:[...p.customRules, { id:`r${Date.now()}`, when:'', then:'', tone:'info' }] }));
                                    setDirty(true);
                                }} style={{ color:T.goldInk, fontWeight:600, background:'none', border:'none', cursor:'pointer', fontFamily:T.sans, fontSize:12.5 }}>
                                    Add your first rule →
                                </button>
                            </div>
                        ) : (
                            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                                {draft.customRules.map((rule, ri) => (
                                    <div key={rule.id} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 100px 28px', gap:10, padding:'10px 12px', background:T.bg, border:`1px solid ${T.border}`, borderRadius:6, alignItems:'center' }}>
                                        <div>
                                            <div style={{ fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.5, textTransform:'uppercase', marginBottom:3, fontFamily:T.sans }}>When</div>
                                            <input value={rule.when} onChange={e => {
                                                    setDraft(p => ({ ...p, customRules: p.customRules.map((r,i) => i===ri ? {...r, when:e.target.value} : r) }));
                                                    setDirty(true);
                                                }}
                                                placeholder="e.g. Deal > $100k"
                                                style={{ width:'100%', padding:'5px 8px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, boxSizing:'border-box' }}/>
                                        </div>
                                        <div>
                                            <div style={{ fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.5, textTransform:'uppercase', marginBottom:3, fontFamily:T.sans }}>Then</div>
                                            <input value={rule.then} onChange={e => {
                                                    setDraft(p => ({ ...p, customRules: p.customRules.map((r,i) => i===ri ? {...r, then:e.target.value} : r) }));
                                                    setDirty(true);
                                                }}
                                                placeholder="e.g. Require VP approval"
                                                style={{ width:'100%', padding:'5px 8px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, boxSizing:'border-box' }}/>
                                        </div>
                                        <div>
                                            <div style={{ fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.5, textTransform:'uppercase', marginBottom:3, fontFamily:T.sans }}>Tone</div>
                                            <select value={rule.tone} onChange={e => {
                                                    setDraft(p => ({ ...p, customRules: p.customRules.map((r,i) => i===ri ? {...r, tone:e.target.value} : r) }));
                                                    setDirty(true);
                                                }}
                                                style={{ width:'100%', padding:'5px 8px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, cursor:'pointer' }}>
                                                <option value="info">Info</option>
                                                <option value="warn">Warn</option>
                                                <option value="gold">Gold</option>
                                            </select>
                                        </div>
                                        <button onClick={() => { setDraft(p => ({ ...p, customRules: p.customRules.filter((_,i) => i!==ri) })); setDirty(true); }}
                                            style={{ width:24, height:24, display:'flex', alignItems:'center', justifyContent:'center', background:'none', border:'none', color:T.inkMuted, cursor:'pointer', fontSize:16, borderRadius:3 }}
                                            onMouseEnter={e => e.currentTarget.style.color=T.danger}
                                            onMouseLeave={e => e.currentTarget.style.color=T.inkMuted}>×</button>
                                    </div>
                                ))}
                                <button onClick={() => { setDraft(p => ({ ...p, customRules:[...p.customRules, { id:`r${Date.now()}`, when:'', then:'', tone:'info' }] })); setDirty(true); }}
                                    style={{ alignSelf:'flex-start', padding:'5px 12px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12, fontWeight:600, color:T.ink, cursor:'pointer', fontFamily:T.sans }}>
                                    + Add rule
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Modal footer — sticky ── */}
                <div style={{ borderTop:`1px solid ${T.border}`, padding:'12px 24px', background:T.surface2, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
                    <span style={{ fontSize:12, color:T.inkMuted, fontStyle:'italic', fontFamily:T.sans }}>{statusText}</span>
                    <div style={{ display:'flex', gap:8 }}>
                        <button style={{ padding:'8px 16px', background:T.surface, color:T.inkMid, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}
                            onMouseEnter={e => e.currentTarget.style.background=T.surface2}
                            onMouseLeave={e => e.currentTarget.style.background=T.surface}>
                            Test on quote
                        </button>
                        <button onClick={handleBackdrop}
                            style={{ padding:'8px 16px', background:T.surface, color:T.inkMid, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}
                            onMouseEnter={e => e.currentTarget.style.background=T.surface2}
                            onMouseLeave={e => e.currentTarget.style.background=T.surface}>
                            Cancel
                        </button>
                        <button onClick={handleSave}
                            disabled={!draft.sku.trim() || !draft.name.trim()}
                            style={{ padding:'8px 20px', background: (draft.sku.trim() && draft.name.trim()) ? T.ink : T.borderStrong, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:700, cursor: (draft.sku.trim() && draft.name.trim()) ? 'pointer' : 'default', fontFamily:T.sans, transition:'background 100ms' }}>
                            {cta}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Matrix cell — click-to-edit inline; defined at module level for stable identity
const MatrixCell = ({ value, listPrice, devPct, onChange }) => {
    const [editing, setEditing] = useState(false);
    const [local, setLocal] = useState('');
    const hasOverride = value !== null && value !== undefined;
    const commit = () => { setEditing(false); onChange(local); };
    return (
        <div onClick={() => { if (!editing) { setLocal(hasOverride ? String(value) : ''); setEditing(true); } }}
            style={{ padding:'10px 12px', borderLeft:`1px solid ${T.border}`, textAlign:'center', cursor:'pointer', position:'relative',
                background: hasOverride && devPct !== 0 ? 'rgba(200,185,154,0.10)' : 'transparent' }}>
            {editing ? (
                <input autoFocus value={local} onChange={e => setLocal(e.target.value)}
                    onBlur={commit}
                    onKeyDown={e => { if (e.key==='Enter') commit(); if (e.key==='Escape') setEditing(false); }}
                    style={{ width:'80px', padding:'3px 6px', border:`1.5px solid ${T.goldInk}`, borderRadius:T.r, fontSize:13, fontFamily:'ui-monospace,Menlo,monospace', outline:'none', textAlign:'center', background:T.surface, color:T.ink }}/>
            ) : hasOverride ? (
                <div>
                    <div style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:13, color:T.ink }}>{fmt$(value)}</div>
                    {devPct !== null && devPct !== 0 && (
                        <div style={{ fontSize:10, fontWeight:700, color: devPct > 0 ? T.danger : T.ok, marginTop:2 }}>
                            {devPct > 0 ? '+' : ''}{devPct}%
                        </div>
                    )}
                </div>
            ) : (
                <span style={{ fontSize:11, color:T.inkMuted, fontStyle:'italic' }}>·</span>
            )}
        </div>
    );
};

// ── Price Book Detail Page ─────────────────────────────────────
export const PriceBookDetail = ({ settings, setSettings, onBack }) => {
    const savedProducts = settings?.priceBookProducts?.length ? settings.priceBookProducts : PRICE_BOOK_PRODUCTS;
    const [products, setProducts] = useState(() => JSON.parse(JSON.stringify(savedProducts)));
    const [catFilter, setCatFilter]   = useState('All');
    const [search,    setSearch]      = useState('');
    const [dirty,     setDirty]       = useState(false);
    const [saving,    setSaving]       = useState(false);
    const [saveError, setSaveError] = useState('');
    const [modal, setModal] = useState(null); // null | { mode:'new'|'edit', product, scrollTo }
    const fileInputRef = useRef(null);

    const filtered = products.filter(p => {
        const matchCat = catFilter === 'All' || p.category === catFilter;
        const q = search.toLowerCase();
        const matchQ = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
        return matchCat && matchQ;
    });

    const openNew = () => setModal({ mode:'new', product:null });
    const openEdit = (product, scrollTo='top') => setModal({ mode:'edit', product, scrollTo });

    const handleSave = async () => {
        setSaving(true);
        let snapshot;
        setSettings(prev => { snapshot = prev; return { ...prev, priceBookProducts: products }; });
        setSaveError('');
        try {
            await putSettings({ priceBookProducts: products });
            setDirty(false);                 // only clear dirty once the write lands
        } catch (e) {
            setSettings(snapshot);
            setSaveError(`Price book not saved — ${e.message}`);
        }
        setSaving(false);
    };

    const handleModalSave = (saved) => {
        if (modal.mode === 'new') {
            const newP = { ...saved, id:`p${Date.now()}` };
            setProducts(prev => [...prev, newP]);
        } else {
            setProducts(prev => prev.map(p => p.id === saved.id ? saved : p));
        }
        setDirty(true);
        setModal(null);
    };

    const handleDuplicate = (product) => {
        const copy = { ...product, id:`p${Date.now()}`, sku:'', name:`Copy of ${product.name}` };
        setModal({ mode:'new', product: copy });
    };

    const { showConfirm } = useApp();
    const handleArchive = (product) => {
        showConfirm(`Archive "${product.name}"? It will no longer appear in new quotes.`, () => {
            setProducts(prev => prev.map(p => p.id === product.id ? { ...p, active:false } : p));
            setDirty(true);
        });
    };

    // ── CSV export / import (flat product fields) ──────────────────────────
    const CSV_COLS    = ['sku','name','category','type','unit','listPrice','cost','active'];
    const CSV_HEADERS = ['SKU','Name','Category','Type','Unit','List Price','Cost','Active'];
    const handleExportCSV = () => {
        const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s; };
        const lines = [CSV_HEADERS.join(',')];
        products.forEach(p => lines.push(CSV_COLS.map(c => esc(c === 'active' ? (p.active ? 'Yes' : 'No') : p[c])).join(',')));
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'price-book.csv';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    const parseCSVLine = (line) => {
        const cells = []; let cur = ''; let q = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (q) { if (ch === '"') { if (line[i+1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
            else if (ch === ',') { cells.push(cur); cur = ''; }
            else if (ch === '"') { q = true; }
            else cur += ch;
        }
        cells.push(cur); return cells;
    };
    const handleImportFile = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const rows = String(reader.result || '').split(/\r?\n/).filter(l => l.trim());
                if (rows.length < 2) { window.alert('No rows found in the CSV.'); return; }
                const header = parseCSVLine(rows[0]).map(h => h.trim().toLowerCase());
                const col = (names) => { for (const n of names) { const i = header.indexOf(n); if (i >= 0) return i; } return -1; };
                const iSku = col(['sku']); const iName = col(['name','product','product name']);
                if (iSku < 0 || iName < 0) { window.alert('CSV must include at least "SKU" and "Name" columns.'); return; }
                const iCat = col(['category']); const iType = col(['type']); const iUnit = col(['unit']);
                const iList = col(['list price','listprice','list','price']); const iCost = col(['cost']); const iActive = col(['active']);
                const num = (v) => Number(String(v ?? '').replace(/[^0-9.\-]/g,'')) || 0;
                const parsed = rows.slice(1).map(parseCSVLine).filter(c => (c[iSku]||'').trim() || (c[iName]||'').trim());
                setProducts(prev => {
                    const bySku = new Map(prev.map(p => [String(p.sku||'').toLowerCase(), p]));
                    parsed.forEach(c => {
                        const sku = (c[iSku]||'').trim(); const key = sku.toLowerCase();
                        const flat = {
                            sku,
                            name:     (c[iName]||'').trim(),
                            category: iCat  >= 0 ? ((c[iCat]||'').trim() || 'Uncategorized') : 'Uncategorized',
                            type:     iType >= 0 ? ((c[iType]||'').trim() || 'Recurring')     : 'Recurring',
                            unit:     iUnit >= 0 ? (c[iUnit]||'').trim() : '',
                            listPrice: iList >= 0 ? num(c[iList]) : 0,
                            cost:      iCost >= 0 ? num(c[iCost]) : 0,
                            active:    iActive >= 0 ? !/^(no|false|0|inactive|archived)$/i.test((c[iActive]||'').trim()) : true,
                        };
                        if (key && bySku.has(key)) bySku.set(key, { ...bySku.get(key), ...flat });
                        else bySku.set(key || ('new_' + crypto.randomUUID()), {
                            id: 'p_' + crypto.randomUUID(), ...flat, tags: [],
                            volumeTiers: DEFAULT_TIERS.map(tt => ({ ...tt })), segMatrix: makeMatrix(), customRules: [],
                        });
                    });
                    return Array.from(bySku.values());
                });
                setDirty(true);
                window.alert(`Imported ${parsed.length} product${parsed.length === 1 ? '' : 's'}. Review the list, then click Save changes to persist.`);
            } catch (err) {
                console.error('price book CSV import error', err);
                window.alert('Could not parse the CSV. Please check the format and try again.');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    // Catalog health stats
    const activeCount = products.filter(p => p.active).length;
    const avgMargin = Math.round(products.reduce((sum, p) => sum + fmtPct(p.listPrice, p.cost), 0) / products.length);
    const mostUsed  = [...products].sort((a,b) => (b.usedTimes||0) - (a.usedTimes||0))[0];
    const lowestUsed = [...products].sort((a,b) => (a.usedTimes||0) - (b.usedTimes||0))[0];

    // Category counts for filter tabs
    const catCounts = CAT_TABS.reduce((acc, c) => {
        acc[c] = c === 'All' ? products.length : products.filter(p => p.category === c).length;
        return acc;
    }, {});

    return (
        <div style={{ fontFamily:T.sans }}>
            {saveError && (
                <div style={{ padding:'10px 14px', marginBottom:12, background:'rgba(156,58,46,0.08)',
                    border:`1px solid ${T.danger}`, borderRadius:T.r, color:T.danger,
                    fontSize:12.5, fontFamily:T.sans }}>
                    {saveError}
                </div>
            )}
            {/* Modal */}
            {modal && (
                <PBProductModal
                    mode={modal.mode}
                    product={modal.product}
                    onClose={() => setModal(null)}
                    onSave={handleModalSave}
                />
            )}

            {/* Breadcrumb + title band */}
            <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:T.inkMuted, marginBottom:10 }}>
                <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>Settings</button>
                <span>/</span>
                <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>Quoting</button>
                <span>/</span>
                <span style={{ color:T.ink, fontWeight:600 }}>Price book</span>
            </div>
            <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', paddingBottom:16, borderBottom:`1px solid ${T.border}`, marginBottom:18 }}>
                <div style={{ borderLeft:`3px solid ${T.goldInk}`, paddingLeft:10 }}>
                    <div style={{ fontSize:22, fontWeight:700, color:T.ink, letterSpacing:-0.3, fontFamily:T.sans }}>
                        Price book
                        {dirty && <span style={{ fontSize:12, fontWeight:500, color:T.warn, marginLeft:12 }}>● Unsaved</span>}
                    </div>
                    <div style={{ fontSize:13, color:T.inkMid, marginTop:3, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', fontFamily:T.sans }}>
                        <span>Products, services, list prices, and pricing rules</span>
                        <span style={{ color:T.inkMuted }}>•</span>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                            <span style={{ color:T.ok, fontWeight:600 }}>✓</span>
                            <span>{activeCount} active SKUs · 3 bundles · USD</span>
                        </span>
                        <span style={{ color:T.inkMuted }}>•</span>
                        <span style={{ fontSize:11.5, color:T.inkMuted }}>Last edited yesterday by <b style={{ color:T.inkMid, fontWeight:500 }}>Priya</b></span>
                    </div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                    <input type="file" ref={fileInputRef} accept=".csv,text/csv" onChange={handleImportFile} style={{ display:'none' }} />
                    <button onClick={() => fileInputRef.current?.click()} style={{ padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}
                        onMouseEnter={e => e.currentTarget.style.background=T.surface2}
                        onMouseLeave={e => e.currentTarget.style.background=T.surface}>
                        Import CSV
                    </button>
                    <button onClick={handleExportCSV} style={{ padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}
                        onMouseEnter={e => e.currentTarget.style.background=T.surface2}
                        onMouseLeave={e => e.currentTarget.style.background=T.surface}>
                        Export
                    </button>
                    <button onClick={openNew}
                        style={{ padding:'7px 16px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:T.sans }}>
                        + New product
                    </button>
                </div>
            </div>

            {/* Filter tabs + search + two-col layout */}
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                <span style={{ fontSize:11.5, color:T.inkMuted, fontFamily:T.sans }}>Filter:</span>
                <div style={{ display:'flex', gap:4 }}>
                    {CAT_TABS.map(cat => {
                        const active = catFilter === cat;
                        return (
                            <button key={cat} onClick={() => setCatFilter(cat)}
                                style={{
                                    padding:'4px 10px', fontSize:12, fontWeight:600, borderRadius:12,
                                    border:`1px solid ${active ? T.ink : T.border}`,
                                    background: active ? T.ink : 'transparent',
                                    color: active ? '#fbf8f3' : T.inkMid,
                                    cursor:'pointer', fontFamily:T.sans,
                                }}>
                                {cat} {catCounts[cat] > 0 && <span style={{ opacity:0.7 }}>{catCounts[cat]}</span>}
                            </button>
                        );
                    })}
                </div>
                <div style={{ flex:1 }}/>
                <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search SKUs, names, categories…"
                    style={{ padding:'6px 12px', fontSize:12.5, border:`1px solid ${T.border}`, borderRadius:16, outline:'none', width:240, fontFamily:T.sans, background:T.surface, color:T.ink }}/>
            </div>

            {/* Main two-column layout */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:18, alignItems:'start' }}>

                {/* Left: Catalog table */}
                <div>
                    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, overflow:'hidden' }}>
                        <div style={{ padding:'12px 16px', borderBottom:`1px solid ${T.border}` }}>
                            <div style={{ fontSize:14, fontWeight:700, color:T.ink, fontFamily:T.sans }}>Catalog</div>
                            <div style={{ fontSize:12, color:T.inkMuted, marginTop:2, fontFamily:T.sans }}>The full product list. Inline-edit list price; bulk actions for archive, deprecate, or re-categorize.</div>
                        </div>
                        {/* Table header */}
                        <div style={{ display:'grid', gridTemplateColumns:'24px 100px 1fr 90px 80px 60px 90px 70px 72px 32px', gap:8, padding:'8px 16px', background:T.surface2, borderBottom:`1px solid ${T.border}` }}>
                            {[{l:'',w:'24px'},{l:'SKU',w:'100px'},{l:'Product',w:'1fr'},{l:'Category',w:'90px'},{l:'Type',w:'80px'},{l:'Unit',w:'60px'},{l:'List Price',w:'90px'},{l:'Cost',w:'70px'},{l:'Margin',w:'72px'},{l:'',w:'32px'}].map((h,i) => (
                                <div key={i} style={{ fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', fontFamily:T.sans }}>{h.l}</div>
                            ))}
                        </div>
                        {/* Table rows */}
                        {filtered.length === 0 ? (
                            <div style={{ padding:'28px 16px', textAlign:'center', color:T.inkMuted, fontSize:13 }}>No products match the current filter.</div>
                        ) : filtered.map((product, i) => {
                            const mg = fmtPct(product.listPrice, product.cost);
                            return (
                                <div key={product.id}
                                    onClick={() => openEdit(product)}
                                    style={{ display:'grid', gridTemplateColumns:'24px 100px 1fr 90px 80px 60px 90px 70px 72px 32px', gap:8, padding:'10px 16px', borderBottom: i < filtered.length-1 ? `1px solid ${T.border}` : 'none', alignItems:'center', cursor:'pointer', transition:'background 80ms' }}
                                    onMouseEnter={e => e.currentTarget.style.background=T.surface2}
                                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                    {/* Drag handle */}
                                    <span style={{ color:T.border, fontSize:14, cursor:'grab' }}>⠿</span>
                                    {/* SKU */}
                                    <div style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5, color:T.inkMid }}>{product.sku}</div>
                                    {/* Name + tags */}
                                    <div style={{ display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
                                        <span style={{ fontSize:13, fontWeight:600, color:T.ink, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{product.name}</span>
                                        {(product.tags||[]).map(tag => (
                                            <span key={tag} style={{ padding:'1px 6px', fontSize:9.5, fontWeight:700, borderRadius:10, background:'rgba(58,90,122,0.10)', color:T.info, letterSpacing:0.3, flexShrink:0 }}>{tag}</span>
                                        ))}
                                    </div>
                                    {/* Category */}
                                    <div style={{ fontSize:12, color:T.inkMid }}>{product.category}</div>
                                    {/* Type */}
                                    <div style={{ fontSize:12, color:T.inkMuted }}>{product.type}</div>
                                    {/* Unit */}
                                    <div style={{ fontSize:11, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace' }}>{product.unit}</div>
                                    {/* List price */}
                                    <div style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:13, fontWeight:600, color:T.ink }}>{fmt$(product.listPrice)}</div>
                                    {/* Cost */}
                                    <div style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:12, color:T.inkMuted }}>{fmt$(product.cost)}</div>
                                    {/* Margin chip */}
                                    <div style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 7px', borderRadius:10,
                                        background: mg >= 60 ? 'rgba(77,107,61,0.10)' : 'rgba(184,115,51,0.12)',
                                        color: mg >= 60 ? T.ok : T.warn, fontSize:11.5, fontWeight:700 }}>
                                        {mg}%
                                    </div>
                                    {/* Row menu */}
                                    <div onClick={e => e.stopPropagation()}>
                                        <PBRowMenu product={product}
                                            onEdit={(scrollTo) => openEdit(product, scrollTo)}
                                            onDuplicate={() => handleDuplicate(product)}
                                            onArchive={() => handleArchive(product)}/>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {/* Save bar */}
                    {dirty && (
                        <div style={{ marginTop:12, display:'flex', justifyContent:'flex-end', gap:8 }}>
                            <button onClick={() => { setProducts(JSON.parse(JSON.stringify(savedProducts))); setDirty(false); }}
                                style={{ padding:'8px 16px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                                Discard changes
                            </button>
                            <button onClick={handleSave}
                                style={{ padding:'8px 20px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:T.sans }}>
                                {saving ? 'Saving…' : 'Save changes'}
                            </button>
                        </div>
                    )}
                </div>

                {/* Right rail — Bundles + Catalog health */}
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                    {/* Bundles */}
                    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:16 }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                            <div>
                                <div style={{ fontSize:14, fontWeight:700, color:T.ink, fontFamily:T.sans }}>Bundles</div>
                                <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:2, lineHeight:1.4, fontFamily:T.sans }}>Pre-priced kits reps can drop into a quote in one click.</div>
                            </div>
                            <button style={{ padding:'4px 10px', fontSize:11.5, fontWeight:600, background:T.surface, color:T.ink, border:`1px solid ${T.border}`, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans, whiteSpace:'nowrap' }}
                                onMouseEnter={e => e.currentTarget.style.background=T.surface2}
                                onMouseLeave={e => e.currentTarget.style.background=T.surface}>
                                + New bundle
                            </button>
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                            {PRICE_BOOK_BUNDLES.map((b,i) => (
                                <div key={i} style={{ padding:'10px 12px', background:T.bg, borderRadius:6, border:`1px solid ${T.border}` }}>
                                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:3 }}>
                                        <span style={{ fontSize:13, fontWeight:700, color:T.ink, fontFamily:T.sans }}>{b.name}</span>
                                        <span style={{ fontSize:11, fontWeight:700, padding:'1px 6px', borderRadius:10,
                                            background:'rgba(156,58,46,0.10)', color:T.danger }}>
                                            -{b.discPct}%
                                        </span>
                                    </div>
                                    <div style={{ fontSize:11, color:T.inkMuted, marginBottom:6, fontFamily:T.sans }}>{b.items} items · {b.seats}</div>
                                    <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
                                        <span style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>List: {fmt$(b.listTotal)}</span>
                                        <span style={{ fontSize:11, color:T.inkMuted }}>·</span>
                                        <span style={{ fontSize:13, fontWeight:700, color:T.goldInk, fontFamily:'ui-monospace,Menlo,monospace' }}>Bundle {fmt$(b.bundlePrice)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Catalog health */}
                    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:16 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:T.ink, fontFamily:T.sans, marginBottom:10 }}>Catalog health</div>
                        <div style={{ fontSize:11, color:T.inkMuted, marginBottom:12, fontFamily:T.sans }}>Last 90 days of quote usage.</div>
                        {[
                            { label:'Active SKUs',       value:activeCount, mono:true, suffix:'' },
                            { label:'Avg margin',        value:`${avgMargin}%`, sub:'weighted', color: avgMargin >= 60 ? T.ok : T.warn },
                            { label:'Most-used SKU',     value: mostUsed?.sku  || '—', sub:`${mostUsed?.usedTimes||'99%'} attach`, mono:true },
                            { label:'Lowest used',       value: lowestUsed?.sku || '—', sub:`${lowestUsed?.usedTimes||'14%'} attach`, mono:true },
                            { label:'Deprecated/unused', value:'1', sub:'MOD-LEG', color:T.inkMuted },
                        ].map((row,i) => (
                            <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 0', borderBottom: i < 4 ? `1px solid ${T.border}` : 'none' }}>
                                <span style={{ fontSize:12, color:T.inkMid, fontFamily:T.sans }}>{row.label}</span>
                                <div style={{ textAlign:'right' }}>
                                    <div style={{ fontSize: row.large ? 18 : 13, fontWeight:700, color: row.color || T.ink, fontFamily: row.mono ? 'ui-monospace,Menlo,monospace' : T.sans }}>{row.value}</div>
                                    {row.sub && <div style={{ fontSize:10.5, color:T.inkMuted, fontFamily:T.sans }}>{row.sub}</div>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
