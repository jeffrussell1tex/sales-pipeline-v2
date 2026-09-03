// settings/quoting/QuoteTemplatesDetail.jsx
import React, { useState, useEffect, useRef } from 'react';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { putSettings } from '../shared/saveSettings.js';
import { CSectionCard } from '../shared/form.jsx';
import { LIcon } from '../shared/ui.jsx';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';
import { QPill, ATToggle } from './shared.jsx';
import { EditBrandModal, BRAND_PRESET } from './EditBrandModal.jsx';

// TODO: read currentUser from session/AppContext — hard-coded for dev
const CURRENT_USER = { id:'u_42', name:'Bea Chen', role:'admin' };

const canEditTemplate = (tpl, user) => {
    if (tpl.systemTemplate) return false;
    if (user.role === 'admin') return true;
    return tpl.createdBy === user.id;
};

const lockReason = (tpl) => {
    if (tpl.systemTemplate) return 'Accelerep starter — duplicate to edit';
    if (tpl.createdByName)   return `Read-only — created by ${tpl.createdByName}`;
    return 'Read-only';
};

const DEFAULT_QUOTE_TEMPLATES = [
    { id:'tpl1', name:'SMB Starter — Annual',   desc:'Core + Pipeline + Reports + Basic onboarding. Ideal for 10–50 seats.',          usedTimes:47, lastUsed:'3 days ago',  avgWinRate:0.48, createdBy:'u_42', createdByName:'Bea Chen',    createdAt:'2024-01-15', systemTemplate:false },
    { id:'tpl2', name:'Growth Package',          desc:'Core + all core modules + white-glove services. 50–200 seats, 2-3 yr terms.',    usedTimes:28, lastUsed:'1 week ago',  avgWinRate:0.44, createdBy:'u_99', createdByName:'Raj Patel',    createdAt:'2024-03-02', systemTemplate:false },
    { id:'tpl3', name:'Enterprise — Multi-year', desc:'Premium core + full module stack + dedicated CSM. 200+ seats.',                  usedTimes:9,  lastUsed:'2 weeks ago', avgWinRate:0.57, createdBy:'u_42', createdByName:'Bea Chen',    createdAt:'2024-05-18', systemTemplate:false },
    { id:'tpl4', name:'Quick trial → paid',      desc:'Minimal Core + basic onboarding, annual. Conversion-from-trial template.',       usedTimes:19, lastUsed:'6 days ago',  avgWinRate:0.52, createdBy:null,   createdByName:null,           createdAt:'2023-11-01', systemTemplate:true  },
];

const QT_BRANDING = {
    primary: '#6b2a22', ink: '#1a1612', paper: '#fbf8f3', accent: '#b87333',
    serifFamily: 'Georgia, serif', sansFamily: 'system-ui, sans-serif',
    logoMark: '◐', companyName: 'Accelerep',
    contactLine: 'sales@accelerep.com · accelerep.com',
};

// Mini quote doc preview — scaled-down representation
const MiniQuoteDoc = ({ scale = 0.32 }) => {
    const w = Math.round(360 * scale);
    const h = Math.round(480 * scale);
    const s = scale;
    return (
        <div style={{ width:w, height:h, background:QT_BRANDING.paper, border:`1px solid ${T.border}`, borderRadius:4, boxShadow:'0 4px 12px rgba(0,0,0,0.06)', padding:Math.round(18*s), fontSize:Math.round(9*s), color:QT_BRANDING.ink, fontFamily:T.sans, overflow:'hidden', display:'flex', flexDirection:'column', gap:Math.round(8*s) }}>
            {/* Cover */}
            <div style={{ display:'flex', alignItems:'center', gap:Math.round(6*s) }}>
                <span style={{ fontSize:Math.round(18*s), color:QT_BRANDING.primary }}>{QT_BRANDING.logoMark}</span>
                <b style={{ fontFamily:T.serif, fontStyle:'italic', fontSize:Math.round(11*s) }}>{QT_BRANDING.companyName}</b>
            </div>
            <div style={{ height:1, background:QT_BRANDING.primary, opacity:0.6 }}/>
            <div style={{ fontSize:Math.round(7*s), fontWeight:700, color:QT_BRANDING.accent, letterSpacing:0.5, textTransform:'uppercase' }}>QUOTE · Q-2026</div>
            <div style={{ fontFamily:T.serif, fontStyle:'italic', fontWeight:700, fontSize:Math.round(16*s), lineHeight:1.1 }}>Mountain View Capital</div>
            <div style={{ fontSize:Math.round(7*s), color:T.inkMuted }}>Prepared for Helena Choi · Valid 30 days</div>
            {/* Lines */}
            <div>
                <div style={{ display:'flex', justifyContent:'space-between', padding:`${Math.round(3*s)}px 0`, borderBottom:`1px solid ${QT_BRANDING.primary}`, fontWeight:700, fontSize:Math.round(7*s), letterSpacing:0.4 }}>
                    <span>ITEM</span><span>QTY</span><span>TOTAL</span>
                </div>
                {[['Accelerep Core','50','$36,000'],['Pipeline','50','$12,000'],['Support','1','$4,800']].map((r,i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:`${Math.round(3*s)}px 0`, fontSize:Math.round(7*s), borderBottom:`1px solid rgba(0,0,0,0.06)` }}>
                        <span>{r[0]}</span><span style={{ color:T.inkMuted }}>{r[1]}</span><span style={{ fontFamily:'ui-monospace,Menlo,monospace' }}>{r[2]}</span>
                    </div>
                ))}
                <div style={{ display:'flex', justifyContent:'space-between', paddingTop:Math.round(4*s), fontSize:Math.round(8*s), fontWeight:700 }}>
                    <span>Total</span>
                    <span style={{ color:QT_BRANDING.primary, fontFamily:T.serif, fontStyle:'italic' }}>$52,800</span>
                </div>
            </div>
            {/* Terms */}
            <div style={{ marginTop:'auto', fontSize:Math.round(6*s), color:T.inkMuted, lineHeight:1.45 }}>
                <div style={{ fontWeight:700, color:QT_BRANDING.accent, letterSpacing:0.5, textTransform:'uppercase', fontSize:Math.round(6*s), marginBottom:2 }}>Terms</div>
                Net-30 invoicing. Auto-renew with 60-day notice. Pricing locked for the term.
            </div>
        </div>
    );
};

// Template card — with hover edit affordance, lock icon, overflow menu, ownership stamp
const TplLibCard = ({ t, isDefault, isSelected, isEditing, editingName, onEditingNameChange, onEditingCommit, onClick, onEdit, onDuplicate, onSetDefault, onDelete, isLastRow = false }) => {
    const [hover,    setHover]    = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [tooltip,  setTooltip]  = useState(false);
    const canEdit = canEditTemplate(t, CURRENT_USER);
    const menuRef = React.useRef(null);
    // Prevents card onClick from firing when Edit button was mousedown'd
    const editFired = React.useRef(false);

    // Close menu on outside click
    React.useEffect(() => {
        if (!menuOpen) return;
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [menuOpen]);

    const editableMenuItems = [
        { label:'✎  Edit template',   action: onEdit,       danger:false },
        { label:'⊕  Duplicate',        action: onDuplicate,  danger:false },
        isDefault
            ? { label:'✓  Default',    action:null,          danger:false, disabled:true }
            : { label:'◈  Set as default', action: onSetDefault, danger:false },
        { label:'Rename',              action: null,         danger:false, divider:true },
        { label:'Delete',              action: onDelete,     danger:true  },
    ];

    const readOnlyMenuItems = [
        { label:'👁  Open preview',       action: onClick,    danger:false },
        { label:'⊕  Duplicate to edit',   action: onDuplicate,danger:false },
        { label:'Edit',                   action: null,       danger:false, disabled:true, divider:true },
        { label:'Delete',                 action: null,       danger:true,  disabled:true  },
    ];

    const menuItems = canEdit ? editableMenuItems : readOnlyMenuItems;

    return (
        <div
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => { setHover(false); setMenuOpen(false); setTooltip(false); }}
            onClick={() => { if (!menuOpen && !editFired.current) { onClick && onClick(); } editFired.current = false; }}
            style={{
                background:T.surface,
                border:`1.5px solid ${isSelected ? T.goldInk : hover ? T.borderStrong : T.border}`,
                borderRadius:T.r+2, overflow:'hidden', cursor:'pointer',
                display:'flex', flexDirection:'column',
                transition:'border-color 120ms, box-shadow 120ms',
                boxShadow: hover ? '0 6px 18px rgba(0,0,0,0.06)' : 'none',
                position:'relative',
            }}>

            {/* Preview tile */}
            <div style={{ height:130, background:'linear-gradient(180deg, #f4ede0 0%, #ede4d2 100%)', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'center', position:'relative', flexShrink:0 }}>
                <div style={{ transform:'scale(0.32)', transformOrigin:'center' }}>
                    <MiniQuoteDoc/>
                </div>

                {/* DEFAULT pill — top-left */}
                {isDefault && (
                    <span style={{ position:'absolute', top:8, left:8, padding:'2px 7px', background:'rgba(0,0,0,0.72)', color:'#fff', fontSize:9, fontWeight:700, letterSpacing:0.6, borderRadius:2, textTransform:'uppercase', zIndex:1 }}>Default</span>
                )}

                {/* Edit button — top-right, hover + editable */}
                {hover && canEdit && (
                    <button
                        onMouseDown={e => { e.stopPropagation(); e.preventDefault(); editFired.current = true; onEdit && onEdit(); }}
                        style={{
                            position:'absolute', top:8, right:8,
                            display:'inline-flex', alignItems:'center', gap:4,
                            padding:'4px 10px', fontSize:11, fontWeight:600,
                            background:'rgba(255,255,255,0.92)',
                            border:`1px solid ${T.border}`,
                            borderRadius:4, cursor:'pointer', fontFamily:T.sans,
                            boxShadow:'0 2px 6px rgba(0,0,0,0.10)',
                            zIndex:2,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor=T.goldInk; e.currentTarget.style.background='#fff'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor=T.border; e.currentTarget.style.background='rgba(255,255,255,0.92)'; }}>
                        <span style={{ fontSize:10 }}>✎</span> Edit
                    </button>
                )}

                {/* Lock icon — top-right, always visible when not editable */}
                {!canEdit && (
                    <div
                        onMouseEnter={() => setTooltip(true)}
                        onMouseLeave={() => setTooltip(false)}
                        style={{ position:'absolute', top:8, right:8, zIndex:2 }}>
                        <div style={{
                            width:22, height:22, display:'flex', alignItems:'center', justifyContent:'center',
                            background:'rgba(255,255,255,0.88)', borderRadius:4, border:`1px solid ${T.border}`,
                            boxShadow:'0 1px 4px rgba(0,0,0,0.08)',
                        }}>
                            <LIcon name="lock" size={12} color={T.inkMuted}/>
                        </div>
                        {/* Tooltip */}
                        {tooltip && (
                            <div style={{
                                position:'absolute', top:28, right:0, zIndex:10,
                                background:T.ink, color:'#fbf8f3', fontSize:11, fontWeight:500,
                                padding:'5px 9px', borderRadius:5, whiteSpace:'nowrap',
                                boxShadow:'0 4px 12px rgba(0,0,0,0.18)',
                                pointerEvents:'none',
                            }}>
                                {lockReason(t)}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Card body */}
            <div style={{ padding:12, flex:1, display:'flex', flexDirection:'column', position:'relative' }}>

                {/* Title row + overflow menu activator */}
                <div style={{ display:'flex', alignItems:'flex-start', gap:6, marginBottom:4 }}>
                    {isEditing ? (
                        <input
                            autoFocus
                            value={editingName}
                            onChange={e => onEditingNameChange(e.target.value)}
                            onBlur={onEditingCommit}
                            onKeyDown={e => { if (e.key==='Enter') onEditingCommit(); if (e.key==='Escape') onEditingCommit(); }}
                            onClick={e => e.stopPropagation()}
                            style={{
                                flex:1, fontSize:13, fontWeight:700, color:T.ink,
                                border:`1.5px solid ${T.goldInk}`, borderRadius:4,
                                padding:'2px 6px', fontFamily:T.sans,
                                background:T.surface, outline:'none',
                                lineHeight:1.3, width:'100%', boxSizing:'border-box',
                            }}
                        />
                    ) : (
                        <div style={{ fontSize:13, fontWeight:700, color:T.ink, flex:1, lineHeight:1.3 }}>{t.name}</div>
                    )}
                    {/* ⋯ activator — shows on hover */}
                    {hover && (
                        <div ref={menuRef} style={{ position:'relative', flexShrink:0 }}>
                            <button
                                onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
                                style={{
                                    padding:'2px 6px', fontSize:14, lineHeight:1, fontWeight:700,
                                    background: menuOpen ? T.surface2 : 'transparent',
                                    border:`1px solid ${menuOpen ? T.border : 'transparent'}`,
                                    borderRadius:4, cursor:'pointer', color:T.inkMid, fontFamily:T.sans,
                                }}
                                onMouseEnter={e => e.currentTarget.style.background=T.surface2}
                                onMouseLeave={e => { if (!menuOpen) e.currentTarget.style.background='transparent'; }}>
                                ⋯
                            </button>

                            {/* Dropdown menu */}
                            {menuOpen && (
                                <div style={{
                                    position:'absolute', right:0, marginTop:4, ...(isLastRow ? { bottom:'100%', marginBottom:4, top:'auto' } : { top:'100%' }),
                                    background:T.surface, border:`1px solid ${T.border}`,
                                    borderRadius:6, minWidth:186,
                                    boxShadow:'0 8px 24px rgba(0,0,0,0.12)',
                                    zIndex:20, overflow:'hidden',
                                }}>
                                    {menuItems.map((item, i) => (
                                        <React.Fragment key={i}>
                                            {item.divider && <div style={{ height:1, background:T.border, margin:'2px 0' }}/>}
                                            <div
                                                onClick={e => { e.stopPropagation(); if (!item.disabled && item.action) { item.action(); setMenuOpen(false); } }}
                                                style={{
                                                    padding:'8px 14px', fontSize:12.5, fontWeight: i===0 ? 600 : 500,
                                                    color: item.disabled ? T.inkMuted : item.danger ? T.danger : T.ink,
                                                    cursor: item.disabled ? 'default' : 'pointer',
                                                    background: i===0 && !item.disabled ? 'rgba(200,185,154,0.10)' : 'transparent',
                                                    fontFamily:T.sans,
                                                }}
                                                onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background=item.danger ? 'rgba(156,58,46,0.06)' : T.surface2; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = (i===0 && !item.disabled) ? 'rgba(200,185,154,0.10)' : 'transparent'; }}>
                                                {item.label}
                                                {item.disabled && <span style={{ marginLeft:6, fontSize:10, color:T.inkMuted }}>(no permission)</span>}
                                            </div>
                                        </React.Fragment>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div style={{ fontSize:11, color:T.inkMuted, marginBottom:8, lineHeight:1.5, height:32, overflow:'hidden' }}>{t.desc}</div>

                {/* Meta row */}
                <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:10.5, color:T.inkMid, marginTop:'auto' }}>
                    <span><b style={{ color:T.ink, fontFamily:T.serif, fontStyle:'italic', fontSize:13 }}>{t.usedTimes}</b> uses</span>
                    <span style={{ color:T.inkMuted }}>·</span>
                    <span>Last: {t.lastUsed}</span>
                    <div style={{ flex:1 }}/>
                    <QPill tone="rep" dot>{Math.round(t.avgWinRate*100)}% win</QPill>
                </div>

                {/* Ownership stamp */}
                <div style={{ marginTop:8, paddingTop:8, borderTop:`1px dashed ${T.border}`, display:'flex', alignItems:'center', gap:6 }}>
                    {t.systemTemplate ? (
                        <>
                            <span style={{ fontSize:10, color:T.goldInk, fontWeight:700, letterSpacing:0.3 }}>★</span>
                            <span style={{ fontSize:10.5, color:T.inkMuted, fontStyle:'italic' }}>Accelerep starter</span>
                        </>
                    ) : t.createdByName ? (
                        <>
                            <div style={{ width:16, height:16, borderRadius:'50%', background:T.gold, display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:700, color:T.ink, flexShrink:0 }}>
                                {t.createdByName.split(' ').map(w=>w[0]).join('').toUpperCase()}
                            </div>
                            <span style={{ fontSize:10.5, color:T.inkMuted }}>
                                {canEdit && t.createdBy !== CURRENT_USER.id ? 'Admin edit' : 'Created by'} <b style={{ color:T.inkMid, fontWeight:600 }}>{t.createdByName}</b>
                            </span>
                        </>
                    ) : (
                        <span style={{ fontSize:10.5, color:T.inkMuted }}>Created by removed user</span>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// BLANK MODE — right-pane sub-views
// ─────────────────────────────────────────────────────────────────────────────

// Shared: coloured kind-tag badge used in Required blocks list and Use-case pills
const KindTag = ({ kind, color = T.ink, size = 26 }) => (
    <span style={{
        display:'inline-flex', alignItems:'center', justifyContent:'center',
        width:size, height:size, borderRadius:4,
        background: color === T.ink ? 'rgba(42,38,34,0.08)' : `rgba(77,107,61,0.10)`,
        border:`1px solid ${color === T.ink ? T.borderStrong : '#4d6b3d'}`,
        color, fontWeight:700, fontSize:9, letterSpacing:0.5,
        fontFamily:T.sans, flexShrink:0, userSelect:'none',
    }}>{kind}</span>
);

// Small pill used inside use-case cards to show block sets
const BlockPill = ({ kind }) => (
    <span style={{
        display:'inline-block', padding:'1px 5px', fontSize:9.5, fontWeight:700,
        background:'rgba(42,38,34,0.06)', color:T.inkMid,
        borderRadius:3, border:`1px solid ${T.border}`,
        letterSpacing:0.4, fontFamily:T.sans,
    }}>{kind}</span>
);

// ── V2: Required blocks ───────────────────────────────────────────────────────
const REQUIRED_BLOCKS = [
    { kind:'LOGO', label:'Logo + brand',      sub:'Pulled from Brand settings',           color: T.ink },
    { kind:'META', label:'Quote metadata',    sub:'ID, date, customer, prepared-by',      color: T.ink },
    { kind:'LINE', label:'Line items',        sub:'Standard layout · qty · unit · total', color: T.ink },
    { kind:'TERM', label:'Terms',             sub:'Pulls boilerplate from Defaults',       color:'#4d6b3d' },
    { kind:'SIGN', label:'Signature block',   sub:'DocuSign tags',                         color:'#4d6b3d' },
];
const OPTIONAL_BLOCKS_DEFAULT = [
    { kind:'HERO', label:'Cover page',          sub:'Customer name + valid-until banner',   on:true  },
    { kind:'SUMM', label:'Executive summary',   sub:'2-paragraph framing',                  on:false },
    { kind:'ADDN', label:'Optional add-ons',    sub:'Greyed-out items rep can suggest',     on:false },
];

const BlankRequiredBlocks = ({ optionalBlocks, setOptionalBlocks }) => (
    <div>
        <div style={{ fontSize:10.5, fontWeight:700, color:T.inkMid, letterSpacing:0.7, textTransform:'uppercase', marginBottom:6, fontFamily:T.sans }}>
            Starting blocks
        </div>
        <div style={{ fontSize:11.5, color:T.inkMuted, marginBottom:12, lineHeight:1.5 }}>
            Every quote needs these 5 sends. Toggle off the rest if you don't need them — you can always add more in the editor.
        </div>
        {/* Scrollable block list */}
        <div style={{ maxHeight:260, overflowY:'auto', display:'flex', flexDirection:'column', gap:0, border:`1px solid ${T.border}`, borderRadius:6, overflow:'hidden' }}>
            {/* Required rows */}
            {REQUIRED_BLOCKS.map((b, i) => (
                <div key={b.kind} style={{
                    display:'flex', alignItems:'center', gap:12, padding:'9px 12px',
                    background:T.surface, borderBottom:`1px solid ${T.border}`,
                }}>
                    <KindTag kind={b.kind} color={b.color}/>
                    <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12.5, fontWeight:600, color:T.ink, lineHeight:1.2 }}>{b.label}</div>
                        <div style={{ fontSize:11, color:T.inkMuted, marginTop:1 }}>{b.sub}</div>
                    </div>
                    <span style={{
                        padding:'2px 8px', fontSize:10.5, fontWeight:700,
                        background:'rgba(42,38,34,0.07)', color:T.inkMid,
                        borderRadius:10, border:`1px solid ${T.borderStrong}`,
                        letterSpacing:0.2, fontFamily:T.sans, flexShrink:0,
                    }}>Required</span>
                </div>
            ))}
            {/* Divider + Optional eyebrow */}
            <div style={{ padding:'6px 12px 4px', background:T.bg, borderBottom:`1px solid ${T.border}` }}>
                <span style={{ fontSize:9.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', fontFamily:T.sans }}>Optional</span>
            </div>
            {/* Optional rows */}
            {optionalBlocks.map((b, i) => (
                <div key={b.kind} style={{
                    display:'flex', alignItems:'center', gap:12, padding:'9px 12px',
                    background:T.surface,
                    borderBottom: i < optionalBlocks.length - 1 ? `1px solid ${T.border}` : 'none',
                }}>
                    <KindTag kind={b.kind} color={T.ink}/>
                    <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12.5, fontWeight:600, color:T.ink, lineHeight:1.2 }}>{b.label}</div>
                        <div style={{ fontSize:11, color:T.inkMuted, marginTop:1 }}>{b.sub}</div>
                    </div>
                    <ATToggle on={b.on} onChange={() => setOptionalBlocks(prev =>
                        prev.map(x => x.kind === b.kind ? { ...x, on:!x.on } : x)
                    )}/>
                </div>
            ))}
        </div>
    </div>
);

// ── V3: Page setup ────────────────────────────────────────────────────────────
const PAGE_SIZES = [
    { key:'letter',  label:'US Letter', sub:'8.5 × 11 in',   h:80 },
    { key:'a4',      label:'A4',        sub:'210 × 297 mm',   h:80 },
    { key:'legal',   label:'US Legal',  sub:'8.5 × 14 in',   h:96 },
    { key:'custom',  label:'Custom',    sub:'Set size',       h:70 },
];

const PageTile = ({ size, selected, onClick }) => (
    <div onClick={onClick} style={{
        border:`1.5px solid ${selected ? T.goldInk : T.border}`,
        borderRadius:6, padding:'10px 8px 8px', cursor:'pointer', textAlign:'center',
        background: selected ? 'rgba(200,185,154,0.10)' : T.surface,
        display:'flex', flexDirection:'column', alignItems:'center', gap:6,
        transition:'border-color 100ms, background 100ms',
    }}>
        {/* Paper rectangle preview */}
        <div style={{
            width: size.key === 'legal' ? 36 : 40,
            height: size.h * 0.55,
            background: selected ? 'rgba(122,106,72,0.08)' : T.bg,
            border:`1px solid ${selected ? T.goldInk : T.borderStrong}`,
            borderRadius:2, flexShrink:0,
            display:'flex', alignItems:'center', justifyContent:'center',
        }}>
            {/* Simulated content lines */}
            <div style={{ width:'70%', display:'flex', flexDirection:'column', gap:2 }}>
                {[1,0.6,0.6,0.4].map((w, i) => (
                    <div key={i} style={{ height:2, width:`${w*100}%`, background: selected ? T.goldInk : T.borderStrong, borderRadius:1, opacity:0.6 }}/>
                ))}
            </div>
        </div>
        <div style={{ fontSize:11.5, fontWeight:700, color: selected ? T.ink : T.inkMid, lineHeight:1.2 }}>{size.label}</div>
        <div style={{ fontSize:10, color:T.inkMuted }}>{size.sub}</div>
    </div>
);

// Segmented control shared by Orientation + Density
const SegCtrl = ({ options, value, onChange }) => (
    <div style={{ display:'inline-flex', background:T.bg, border:`1px solid ${T.border}`, borderRadius:5, padding:2, gap:2 }}>
        {options.map(opt => (
            <button key={opt} onClick={() => onChange(opt)}
                style={{
                    padding:'5px 14px', fontSize:12, fontWeight:600, borderRadius:4, border:'none',
                    cursor:'pointer', fontFamily:T.sans,
                    background: value === opt ? T.ink : 'transparent',
                    color: value === opt ? '#fbf8f3' : T.inkMid,
                    transition:'background 100ms, color 100ms',
                }}>{opt}</button>
        ))}
    </div>
);

const BlankPageSetup = ({ pageSetup, setPageSetup }) => (
    <div>
        {/* Page size tiles */}
        <div style={{ fontSize:10.5, fontWeight:700, color:T.inkMid, letterSpacing:0.7, textTransform:'uppercase', marginBottom:10, fontFamily:T.sans }}>
            Page size
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10, marginBottom:16 }}>
            {PAGE_SIZES.map(size => (
                <PageTile key={size.key} size={size}
                    selected={pageSetup.size === size.key}
                    onClick={() => setPageSetup(p => ({ ...p, size:size.key }))}/>
            ))}
        </div>
        {/* Orientation + Density */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:4 }}>
            <div>
                <div style={{ fontSize:10.5, fontWeight:700, color:T.inkMid, letterSpacing:0.7, textTransform:'uppercase', marginBottom:8, fontFamily:T.sans }}>Orientation</div>
                <SegCtrl options={['Portrait','Landscape']} value={pageSetup.orientation} onChange={v => setPageSetup(p => ({ ...p, orientation:v }))}/>
            </div>
            <div>
                <div style={{ fontSize:10.5, fontWeight:700, color:T.inkMid, letterSpacing:0.7, textTransform:'uppercase', marginBottom:8, fontFamily:T.sans }}>Density</div>
                <SegCtrl options={['Compact','Standard','Roomy']} value={pageSetup.density} onChange={v => setPageSetup(p => ({ ...p, density:v }))}/>
            </div>
        </div>
    </div>
);

// ── V4: Use-case picker ───────────────────────────────────────────────────────
const USE_CASES = [
    {
        key:'plain',
        icon:'◷', iconColor:T.inkMid,
        label:'Plain quote',
        sub:'Minimum required blocks. Good for short transactional deals.',
        blocks:['LOGO','META','LINE','TERM','SIGN'],
    },
    {
        key:'pitch',
        icon:'◐', iconColor:T.goldInk,
        label:'Pitch-style proposal',
        sub:'Cover + exec summary + line items + ROI. Good for new logos.',
        blocks:['LOGO','HERO','SUMM','LINE','ROI','TERM','SIGN'],
    },
    {
        key:'renewal',
        icon:'↻', iconColor:T.inkMid,
        label:'Renewal',
        sub:"Skip cover. Adds 'what's changed' + auto-renew clause.",
        blocks:['LOGO','META','CHNG','LINE','TERM','SIGN'],
    },
    {
        key:'multi',
        icon:'≡', iconColor:T.inkMid,
        label:'Multi-option',
        sub:'Side-by-side good/better/best comparison.',
        blocks:['LOGO','HERO','CMPR','LINE','TERM','SIGN'],
    },
];

const BlankUseCasePicker = ({ useCase, setUseCase }) => (
    <div>
        <div style={{ fontSize:10.5, fontWeight:700, color:T.inkMid, letterSpacing:0.7, textTransform:'uppercase', marginBottom:6, fontFamily:T.sans }}>
            What's this template for?
        </div>
        <div style={{ fontSize:11.5, color:T.inkMuted, marginBottom:12, lineHeight:1.5 }}>
            Pick the scenario closest to your use case — we'll seed the right starting blocks. You can change everything after.
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {USE_CASES.map(uc => {
                const sel = useCase === uc.key;
                return (
                    <div key={uc.key} onClick={() => setUseCase(uc.key)}
                        style={{
                            border:`1.5px solid ${sel ? T.goldInk : T.border}`,
                            borderRadius:8, padding:'12px 14px', cursor:'pointer',
                            background: sel ? 'rgba(200,185,154,0.10)' : T.surface,
                            display:'flex', flexDirection:'column', gap:8,
                            transition:'border-color 100ms, background 100ms',
                        }}>
                        {/* Icon + title row */}
                        <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                            <div style={{
                                width:32, height:32, borderRadius:6, flexShrink:0,
                                background: sel ? 'rgba(122,106,72,0.14)' : 'rgba(42,38,34,0.06)',
                                border:`1px solid ${sel ? T.goldInk : T.border}`,
                                display:'flex', alignItems:'center', justifyContent:'center',
                                fontSize:16, color: sel ? T.goldInk : uc.iconColor,
                            }}>{uc.icon}</div>
                            <div>
                                <div style={{ fontSize:13, fontWeight:700, color:T.ink, lineHeight:1.2, marginBottom:3 }}>{uc.label}</div>
                                <div style={{ fontSize:11, color:T.inkMuted, lineHeight:1.4 }}>{uc.sub}</div>
                            </div>
                        </div>
                        {/* Block pills */}
                        <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                            {uc.blocks.map(b => <BlockPill key={b} kind={b}/>)}
                        </div>
                    </div>
                );
            })}
        </div>
    </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// NTMFooter — module-level component (NOT inside NewTemplateModal) so React never
// unmounts/remounts the input between keystrokes, preventing the focus-loss bug.
const NTMFooter = ({ newName, setNewName, visibleTo, setVisibleTo, setAsDefault, setSetAsDefault }) => (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 160px 160px', gap:10, marginBottom:12, padding:'12px 14px', background:T.surface2, borderRadius:6, border:`1px solid ${T.border}` }}>
        {/* Template name */}
        <div>
            <label style={{ display:'block', fontSize:11, fontWeight:600, color:T.inkMid, marginBottom:5, letterSpacing:0.1, fontFamily:T.sans }}>Template name</label>
            <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Q4 partner deals"
                style={{ width:'100%', padding:'7px 10px', border:`1px solid ${T.border}`, borderRadius:T.r+1, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', boxSizing:'border-box', background:T.surface }}
                onFocus={e => e.currentTarget.style.borderColor=T.goldInk}
                onBlur={e => e.currentTarget.style.borderColor=T.border}
            />
        </div>
        {/* Visible to */}
        <div>
            <label style={{ display:'block', fontSize:11, fontWeight:600, color:T.inkMid, marginBottom:5, letterSpacing:0.1, fontFamily:T.sans }}>Visible to</label>
            <select value={visibleTo} onChange={e => setVisibleTo(e.target.value)}
                style={{ width:'100%', padding:'7px 10px', border:`1px solid ${T.border}`, borderRadius:T.r+1, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, cursor:'pointer', appearance:'none',
                    backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%238a8378' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                    backgroundRepeat:'no-repeat', backgroundPosition:'right 8px center', paddingRight:26 }}>
                <option>Everyone in Sales</option>
                <option>Managers only</option>
                <option>Admins only</option>
                <option>My team only</option>
            </select>
        </div>
        {/* Set as default */}
        <div>
            <label style={{ display:'block', fontSize:11, fontWeight:600, color:T.inkMid, marginBottom:5, letterSpacing:0.1, fontFamily:T.sans }}>Set as default?</label>
            <div style={{ display:'flex', alignItems:'center', gap:8, paddingTop:6 }}>
                <ATToggle on={setAsDefault} onChange={() => setSetAsDefault(v => !v)}/>
                <span style={{ fontSize:12.5, color:T.inkMuted }}>{setAsDefault ? 'Yes' : 'No'}</span>
            </div>
        </div>
    </div>
);

// NEW TEMPLATE MODAL — main component
// ─────────────────────────────────────────────────────────────────────────────
const NewTemplateModal = ({ templates, onClose, onCreate }) => {
    // Top-level mode (left rail)
    const [mode, setMode]               = useState('blank'); // blank | duplicate | import | library

    // Blank sub-variant (segmented control inside right pane when mode===blank)
    const [blankVariant, setBlankVariant] = useState('blocks'); // blocks | pageSetup | useCase

    // Blank/V2 — optional block toggles
    const [optionalBlocks, setOptionalBlocks] = useState(
        OPTIONAL_BLOCKS_DEFAULT.map(b => ({ ...b }))
    );

    // Blank/V3 — page setup state
    const [pageSetup, setPageSetup] = useState({ size:'letter', orientation:'Portrait', density:'Standard' });

    // Blank/V4 — use case selection (default: pitch)
    const [useCase, setUseCase] = useState('pitch');

    // V5 — live preview drawer (only active in blank+blocks mode)
    const [showPreview, setShowPreview] = useState(false);

    // Collapse preview when leaving blank/blocks
    React.useEffect(() => {
        if (mode !== 'blank' || blankVariant !== 'blocks') setShowPreview(false);
    }, [mode, blankVariant]);

    // Duplicate mode state
    const [selectedTpl, setSelectedTpl] = useState(null);

    // Shared footer state
    const [newName,      setNewName]      = useState('Untitled template');
    const [visibleTo,    setVisibleTo]    = useState('Everyone in Sales');
    const [setAsDefault, setSetAsDefault] = useState(false);

    // Footer always shown for blank; shown conditionally for others
    const showFooter = mode === 'blank' || (mode === 'duplicate' && selectedTpl) || mode === 'import';

    // Footer helper text by variant
    const footerHelper = mode !== 'blank' ? `Step 1 of 2 · You'll edit content next`
        : blankVariant === 'blocks'    ? (showPreview ? 'Updates live as you toggle blocks.' : 'Required blocks are always added. Toggles seed optional blocks.')
        : blankVariant === 'pageSetup' ? 'Page setup is locked once content is added. Pick carefully.'
        : 'Each use case seeds a different starting block set.';

    // Build the onCreate payload
    const handleCreate = () => {
        if (!newName.trim()) return;
        const payload = {
            name: newName.trim(),
            mode,
            sourceTpl: selectedTpl,
            isDefault: setAsDefault,
            visibleTo,
        };
        if (mode === 'blank') {
            payload.blankVariant = blankVariant;
            if (blankVariant === 'blocks') {
                payload.blocks = [
                    ...REQUIRED_BLOCKS.map(b => b.kind),
                    ...optionalBlocks.filter(b => b.on).map(b => b.kind),
                ];
            } else if (blankVariant === 'pageSetup') {
                payload.pageSetup = { ...pageSetup };
                payload.blocks = REQUIRED_BLOCKS.map(b => b.kind);
            } else {
                const uc = USE_CASES.find(u => u.key === useCase);
                payload.blocks = uc ? [...uc.blocks] : REQUIRED_BLOCKS.map(b => b.kind);
                payload.useCase = useCase;
            }
        }
        onCreate(payload);
    };

    // ── Mode rail definition
    const modeOptions = [
        {
            key: 'blank',
            label: 'Blank',
            sub: 'Start from scratch',
            icon: (active) => (
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={active ? T.goldInk : T.inkMuted} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>
                </svg>
            ),
        },
        {
            key: 'duplicate',
            label: 'Duplicate',
            sub: 'From existing',
            icon: (active) => (
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={active ? T.goldInk : T.inkMuted} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="8" y="8" width="12" height="12" rx="2"/>
                    <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>
                </svg>
            ),
        },
        {
            key: 'import',
            label: 'Import',
            sub: 'PDF · DOCX · .qtpl',
            icon: (active) => (
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={active ? T.goldInk : T.inkMuted} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 16V4M6 10l6 6 6-6"/><path d="M4 20h16"/>
                </svg>
            ),
        },
        {
            key: 'library',
            label: 'From library',
            sub: 'Accelerep starters',
            icon: (active) => (
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={active ? T.goldInk : T.inkMuted} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
            ),
        },
    ];

    // Shared footer name row (spec: 3-col grid 1fr 160px 160px)
    // FooterNameRow lifted to module-level component (NTMFooter) to prevent focus-loss on re-render

    return (
        <div style={{ position:'fixed', inset:0, background:'rgba(20,16,12,0.45)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center' }}
            onClick={onClose}>
            <div onClick={e => e.stopPropagation()}
                style={{ background:T.surface, borderRadius:12, width: showPreview ? 1140 : 820, maxHeight:'92vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 24px 64px rgba(20,16,12,0.28)', fontFamily:T.sans, transition:'width 220ms ease' }}>

                {/* ── Header ── */}
                <div style={{ padding:'20px 24px 16px', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
                        <div>
                            <div style={{ fontSize:18, fontWeight:700, color:T.ink, marginBottom:3, letterSpacing:-0.2, fontFamily:T.serif, fontStyle:'italic' }}>New quote template</div>
                            <div style={{ fontSize:12.5, color:T.inkMuted, fontFamily:T.sans }}>Choose how to start, then name the template.</div>
                        </div>
                        <button onClick={onClose}
                            style={{ background:'none', border:'none', color:T.inkMuted, cursor:'pointer', fontSize:20, lineHeight:1, padding:'2px 6px', borderRadius:4, fontFamily:T.sans }}
                            onMouseEnter={e => e.currentTarget.style.color=T.ink}
                            onMouseLeave={e => e.currentTarget.style.color=T.inkMuted}>×</button>
                    </div>
                </div>

                {/* ── Body: mode rail + content + optional preview drawer ── */}
                <div style={{ display:'grid', gridTemplateColumns: showPreview ? '180px 1fr 320px' : '180px 1fr', flex:1, minHeight:0, transition:'grid-template-columns 220ms ease' }}>

                    {/* Left: mode rail */}
                    <div style={{ borderRight:`1px solid ${T.border}`, padding:'14px 10px', display:'flex', flexDirection:'column', gap:3, overflowY:'auto', flexShrink:0 }}>
                        {modeOptions.map(opt => {
                            const active = mode === opt.key;
                            return (
                                <div key={opt.key}
                                    onClick={() => { setMode(opt.key); setSelectedTpl(null); }}
                                    style={{
                                        padding:'10px 12px', borderRadius:6, cursor:'pointer',
                                        background: active ? 'rgba(200,185,154,0.18)' : 'transparent',
                                        border: active ? `1.5px solid ${T.goldInk}` : '1.5px solid transparent',
                                        display:'flex', alignItems:'center', gap:10,
                                        transition:'background 100ms, border-color 100ms',
                                    }}
                                    onMouseEnter={e => { if (!active) e.currentTarget.style.background='rgba(200,185,154,0.07)'; }}
                                    onMouseLeave={e => { if (!active) e.currentTarget.style.background='transparent'; }}>
                                    <div style={{ flexShrink:0, width:16, display:'flex', alignItems:'center', justifyContent:'center' }}>
                                        {opt.icon(active)}
                                    </div>
                                    <div>
                                        <div style={{ fontSize:13, fontWeight:600, color: active ? T.ink : T.inkMid, lineHeight:1.2 }}>{opt.label}</div>
                                        <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>{opt.sub}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Right: mode content */}
                    <div style={{ overflowY:'auto', display:'flex', flexDirection:'column' }}>
                        <div style={{ padding:'16px 20px', flex:1 }}>

                            {/* ── BLANK MODE ── */}
                            {mode === 'blank' && (
                                <div>
                                    {/* Starting blocks eyebrow + Preview toggle button */}
                                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                                        <div style={{ fontSize:10.5, fontWeight:700, color:T.inkMid, letterSpacing:0.7, textTransform:'uppercase', fontFamily:T.sans }}>
                                            Starting blocks
                                        </div>
                                        {blankVariant === 'blocks' && (
                                            <button
                                                onClick={() => setShowPreview(v => !v)}
                                                style={{
                                                    display:'inline-flex', alignItems:'center', gap:5,
                                                    padding:'4px 10px', fontSize:11.5, fontWeight:600,
                                                    background: showPreview ? T.ink : T.surface,
                                                    color: showPreview ? '#fbf8f3' : T.inkMid,
                                                    border:`1px solid ${showPreview ? T.ink : T.border}`,
                                                    borderRadius:5, cursor:'pointer', fontFamily:T.sans,
                                                    transition:'background 120ms, color 120ms',
                                                }}>
                                                {showPreview ? (
                                                    <>
                                                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
                                                        </svg>
                                                        Hide preview
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>
                                                        </svg>
                                                        Preview
                                                    </>
                                                )}
                                            </button>
                                        )}
                                    </div>

                                    {/* Sub-variant segmented control */}
                                    <div style={{ display:'flex', gap:0, marginBottom:12, background:T.bg, border:`1px solid ${T.border}`, borderRadius:6, padding:3, width:'fit-content' }}>
                                        {[
                                            { key:'blocks',    label:'Required blocks' },
                                            { key:'pageSetup', label:'Page setup' },
                                            { key:'useCase',   label:'Use-case picker' },
                                        ].map(v => (
                                            <button key={v.key} onClick={() => setBlankVariant(v.key)}
                                                style={{
                                                    padding:'6px 14px', fontSize:12, fontWeight:600, borderRadius:4, border:'none',
                                                    cursor:'pointer', fontFamily:T.sans,
                                                    background: blankVariant === v.key ? T.ink : 'transparent',
                                                    color: blankVariant === v.key ? '#fbf8f3' : T.inkMid,
                                                    transition:'background 100ms, color 100ms',
                                                }}>{v.label}</button>
                                        ))}
                                    </div>

                                    {/* Sub-variant content */}
                                    {blankVariant === 'blocks'    && <BlankRequiredBlocks optionalBlocks={optionalBlocks} setOptionalBlocks={setOptionalBlocks}/>}
                                    {blankVariant === 'pageSetup' && <BlankPageSetup pageSetup={pageSetup} setPageSetup={setPageSetup}/>}
                                    {blankVariant === 'useCase'   && <BlankUseCasePicker useCase={useCase} setUseCase={setUseCase}/>}
                                </div>
                            )}

                            {/* ── DUPLICATE MODE ── */}
                            {mode === 'duplicate' && (
                                <div>
                                    <div style={{ fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.8, textTransform:'uppercase', marginBottom:10, fontFamily:T.sans }}>
                                        Pick a template to duplicate
                                    </div>
                                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                                        {templates.map(tpl => {
                                            const isSel = selectedTpl?.id === tpl.id;
                                            return (
                                                <div key={tpl.id}
                                                    onClick={() => { setSelectedTpl(tpl); setNewName(tpl.name + ' — copy'); }}
                                                    style={{
                                                        border:`1.5px solid ${isSel ? T.goldInk : T.border}`,
                                                        borderRadius:8, cursor:'pointer',
                                                        display:'flex', alignItems:'stretch',
                                                        background: isSel ? 'rgba(200,185,154,0.08)' : T.surface,
                                                        overflow:'hidden', transition:'border-color 100ms, background 100ms',
                                                    }}>
                                                    {/* Thumbnail */}
                                                    <div style={{ width:72, flexShrink:0, background:'linear-gradient(180deg,#f4ede0 0%,#ede4d2 100%)', borderRight:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'center', padding:'8px 0', overflow:'hidden' }}>
                                                        <div style={{ transform:'scale(0.16)', transformOrigin:'center', width:360, height:240, marginTop:-100, marginLeft:-130 }}>
                                                            <MiniQuoteDoc scale={1}/>
                                                        </div>
                                                    </div>
                                                    {/* Text */}
                                                    <div style={{ flex:1, padding:'12px 14px', minWidth:0 }}>
                                                        <div style={{ fontSize:13.5, fontWeight:700, color:T.ink, marginBottom:3 }}>{tpl.name}</div>
                                                        <div style={{ fontSize:11.5, color:T.inkMuted, lineHeight:1.5, marginBottom:8 }}>{tpl.desc}</div>
                                                        <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:11, color:T.inkMid }}>
                                                            <span><b style={{ fontFamily:T.serif, fontStyle:'italic', fontSize:13, color:T.ink }}>{tpl.usedTimes}</b> uses</span>
                                                            <span style={{ color:T.inkMuted }}>·</span>
                                                            <span>Last {tpl.lastUsed}</span>
                                                            <div style={{ flex:1 }}/>
                                                            <QPill tone="rep" dot>{Math.round(tpl.avgWinRate * 100)}% win</QPill>
                                                        </div>
                                                    </div>
                                                    {/* Radio */}
                                                    <div style={{ padding:'12px 14px', display:'flex', alignItems:'center', flexShrink:0 }}>
                                                        <div style={{ width:18, height:18, borderRadius:'50%', border:`2px solid ${isSel ? T.goldInk : T.borderStrong}`, display:'flex', alignItems:'center', justifyContent:'center', background: isSel ? 'rgba(122,106,72,0.08)' : 'transparent', transition:'border-color 100ms', flexShrink:0 }}>
                                                            {isSel && <div style={{ width:9, height:9, borderRadius:'50%', background:T.goldInk }}/>}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* ── IMPORT MODE ── */}
                            {mode === 'import' && (
                                <div style={{ padding:28, border:`1.5px dashed ${T.border}`, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:10, minHeight:160, cursor:'pointer' }}
                                    onMouseEnter={e => e.currentTarget.style.background='rgba(200,185,154,0.06)'}
                                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                    <LIcon name="upload" size={24} color={T.inkMuted}/>
                                    <span style={{ fontSize:13, fontWeight:600, color:T.inkMid }}>Drop file here or click to browse</span>
                                    <span style={{ fontSize:11.5, color:T.inkMuted }}>PDF · DOCX · .qtpl — max 10 MB</span>
                                </div>
                            )}

                            {/* ── LIBRARY MODE ── */}
                            {mode === 'library' && (
                                <div style={{ padding:28, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8, minHeight:160 }}>
                                    <span style={{ fontSize:28, color:T.goldInk }}>★</span>
                                    <span style={{ fontSize:13, fontWeight:600, color:T.inkMid }}>Accelerep starter templates</span>
                                    <span style={{ fontSize:11.5, color:T.inkMuted, textAlign:'center', maxWidth:280, lineHeight:1.5 }}>Coming soon — curated layouts for common deal types.</span>
                                </div>
                            )}

                        </div>
                    </div>

                    {/* ── V5 Live Preview Drawer ── */}
                    {showPreview && mode === 'blank' && blankVariant === 'blocks' && (
                        <div style={{
                            width:320, flexShrink:0,
                            borderLeft:`1px solid ${T.border}`,
                            display:'flex', flexDirection:'column',
                            background:T.bg,
                            overflow:'hidden',
                        }}>
                            {/* Drawer header */}
                            <div style={{
                                padding:'10px 14px', borderBottom:`1px solid ${T.border}`,
                                display:'flex', alignItems:'center', justifyContent:'space-between',
                                background:T.surface, flexShrink:0,
                            }}>
                                <div>
                                    <div style={{ fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', fontFamily:T.sans }}>Live Preview · Page 1</div>
                                </div>
                                <button
                                    onClick={() => setShowPreview(false)}
                                    style={{ fontSize:11, fontWeight:600, color:T.inkMid, background:'none', border:`1px solid ${T.border}`, borderRadius:4, padding:'3px 8px', cursor:'pointer', fontFamily:T.sans }}
                                    onMouseEnter={e => e.currentTarget.style.background=T.surface2}
                                    onMouseLeave={e => e.currentTarget.style.background='none'}>
                                    Hide
                                </button>
                            </div>

                            {/* Paper preview — scrollable */}
                            <div style={{ flex:1, overflowY:'auto', padding:16, display:'flex', flexDirection:'column', alignItems:'center' }}>
                                {/* Paper document */}
                                <div style={{
                                    width:260, background:'#fbf8f3',
                                    border:`1px solid ${T.border}`,
                                    borderRadius:4,
                                    boxShadow:'0 4px 16px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)',
                                    padding:'20px 18px',
                                    fontFamily:T.sans,
                                    minHeight:320,
                                }}>
                                    {/* Cover — always shown */}
                                    <div style={{ marginBottom:16 }}>
                                        <div style={{ fontFamily:T.serif, fontStyle:'italic', fontWeight:700, fontSize:15, color:QT_BRANDING.ink, lineHeight:1.2, marginBottom:3 }}>
                                            Proposal for Acme Co.
                                        </div>
                                        <div style={{ fontSize:10.5, color:T.inkMuted }}>
                                            Valid until Dec 31 · Prepared by Sarah K.
                                        </div>
                                        <div style={{ height:1, background:QT_BRANDING.primary, opacity:0.4, margin:'10px 0' }}/>
                                    </div>

                                    {/* Block rows — always-required + toggled optionals */}
                                    {(() => {
                                        const activeBlocks = [
                                            ...REQUIRED_BLOCKS,
                                            ...optionalBlocks.filter(b => b.on),
                                        ];
                                        // Sort to natural document order
                                        const ORDER = ['LOGO','META','HERO','SUMM','LINE','ADDN','TERM','SIGN'];
                                        const sorted = [...activeBlocks].sort((a,b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
                                        return sorted.map((block, i) => (
                                            <div key={block.kind} style={{
                                                display:'flex', alignItems:'center', gap:8,
                                                padding:'7px 10px', marginBottom:5,
                                                background: 'rgba(42,38,34,0.03)',
                                                border:`1px solid ${T.border}`,
                                                borderRadius:3,
                                            }}>
                                                <span style={{
                                                    display:'inline-flex', alignItems:'center', justifyContent:'center',
                                                    width:36, flexShrink:0,
                                                    fontSize:8.5, fontWeight:700, letterSpacing:0.4,
                                                    color: block.color === '#4d6b3d' ? '#4d6b3d' : T.inkMuted,
                                                    fontFamily:T.sans,
                                                }}>{block.kind}</span>
                                                <span style={{ fontSize:11, color:T.inkMid, flex:1 }}>{block.label}</span>
                                            </div>
                                        ));
                                    })()}
                                </div>

                                {/* Live indicator */}
                                <div style={{ marginTop:12, display:'flex', alignItems:'center', gap:5, fontSize:10.5, color:T.inkMuted }}>
                                    <span style={{ width:6, height:6, borderRadius:'50%', background:'#4d6b3d', display:'inline-block' }}/>
                                    Updates live as you toggle blocks
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Footer ── */}
                {showFooter && (
                    <div style={{ borderTop:`1px solid ${T.border}`, padding:'14px 20px', flexShrink:0, background:T.bg }}>
                        <NTMFooter
                            newName={newName} setNewName={setNewName}
                            visibleTo={visibleTo} setVisibleTo={setVisibleTo}
                            setAsDefault={setAsDefault} setSetAsDefault={setSetAsDefault}
                        />
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                            <span style={{ fontSize:11, color:T.inkMuted, fontStyle:'italic' }}>{footerHelper}</span>
                            <div style={{ display:'flex', gap:8 }}>
                                <button onClick={onClose}
                                    style={{ padding:'8px 20px', background:T.surface, color:T.inkMid, border:`1px solid ${T.borderStrong}`, borderRadius:T.r+1, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}
                                    onMouseEnter={e => e.currentTarget.style.background=T.surface2}
                                    onMouseLeave={e => e.currentTarget.style.background=T.surface}>
                                    Cancel
                                </button>
                                <button onClick={handleCreate} disabled={!newName.trim()}
                                    style={{ padding:'8px 20px', background: newName.trim() ? T.ink : T.borderStrong, color:'#fbf8f3', border:'none', borderRadius:T.r+1, fontSize:12.5, fontWeight:700, cursor: newName.trim() ? 'pointer' : 'default', fontFamily:T.sans, transition:'background 100ms' }}>
                                    Create draft
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export const QuoteTemplatesDetail = ({ settings, setSettings, onBack }) => {
    const savedTemplates  = settings?.quoteTemplates?.length ? settings.quoteTemplates : DEFAULT_QUOTE_TEMPLATES;
    const savedDefaults   = settings?.quoteDefaults || { validity:'30 days', paymentTerms:'Net-30', autoRenew:'60-day notice', currency:'USD', signOff:'DocuSign', issueDate:'Date sent' };
    const savedBoilerplate = settings?.quoteBoilerplate || '"Pricing reflects current list less applicable discounts. Quote valid for 30 days from issue. Auto-renews for like terms unless 60-day written notice…"';

    const [templates,    setTemplates]   = useState(() => JSON.parse(JSON.stringify(savedTemplates)));
    const [defaults,     setDefaults]    = useState({ ...savedDefaults });
    const [boilerplate,  setBoilerplate] = useState(savedBoilerplate);
    const [selectedId,   setSelectedId]  = useState(templates[0]?.id || null);
    const [showNewModal, setShowNewModal] = useState(false);
    const [editingTplId, setEditingTplId] = useState(null);  // id of card in inline-name-edit mode
    const [editingName,  setEditingName]  = useState('');
    const [dirty,        setDirty]       = useState(false);
    const [saving,       setSaving]      = useState(false);
    const [saveError, setSaveError] = useState('');
    const [editBoilerplate, setEditBoilerplate] = useState(false);

    // Commit inline name edit
    const commitNameEdit = () => {
        if (!editingTplId) return;
        const trimmed = editingName.trim();
        if (trimmed) {
            setTemplates(prev => prev.map(t => t.id === editingTplId ? { ...t, name:trimmed } : t));
            setDirty(true);
        }
        setEditingTplId(null);
        setEditingName('');
    };

    const handleCancel = () => { setTemplates(JSON.parse(JSON.stringify(savedTemplates))); setDefaults({ ...savedDefaults }); setBoilerplate(savedBoilerplate); setDirty(false); };
    const handleSave   = async () => {
        setSaving(true);
        setSettings(prev => ({ ...prev, quoteTemplates:templates, quoteDefaults:defaults, quoteBoilerplate:boilerplate }));
        try {
            await putSettings({ quoteTemplates:templates, quoteDefaults:defaults, quoteBoilerplate:boilerplate });
            setSaveError('');
            setDirty(false);
        } catch (e) {
            // Keep the panel dirty: the change was NOT saved, and clearing the
            // flag here is what made a 403 look like success.
            setSaveError(e.message);
        }
        setSaving(false);
    };

    const handleCreateTemplate = ({ name, mode, sourceTpl, isDefault, visibleTo, blocks, pageSetup, useCase, blankVariant }) => {
        const newTpl = {
            id: `tpl_${Date.now()}`,
            name,
            desc: 'New template — edit to add description.',
            usedTimes: 0,
            lastUsed: 'Just created',
            avgWinRate: 0,
            status: 'draft',
            ...(mode === 'blank' && {
                blankVariant: blankVariant || 'blocks',
                blocks: blocks || ['LOGO','META','LINE','TERM','SIGN'],
                ...(pageSetup ? { pageSetup } : {}),
                ...(useCase    ? { useCase  } : {}),
            }),
            ...(mode === 'duplicate' && sourceTpl ? { sourceTplId: sourceTpl.id } : {}),
            visibleTo: visibleTo || 'Everyone in Sales',
        };
        const withoutOldDefault = templates.map(t => ({ ...t, ...(isDefault ? { isDefault:false } : {}) }));
        const updated = [...withoutOldDefault, { ...newTpl, isDefault: !!isDefault }];
        setTemplates(updated);
        setDirty(true);
        setShowNewModal(false);
        setSelectedId(newTpl.id);
    };

    const setfd = (k, v) => { setDefaults(p => ({ ...p, [k]:v })); setDirty(true); };
    const sel = (opts, val, onChange) => (
        <select value={val} onChange={e => onChange(e.target.value)}
            style={{ width:'100%', padding:'7px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, cursor:'pointer',
                backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a8378' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat:'no-repeat', backgroundPosition:'right 10px center', paddingRight:28, appearance:'none' }}>
            {opts.map(o => <option key={o}>{o}</option>)}
        </select>
    );

    // Brand — read from saved quote brand (settings.quoteBrand)
    const [showEditBrand, setShowEditBrand] = useState(false);
    const brand        = settings?.quoteBrand || BRAND_PRESET;
    const brandColor   = brand.primary;
    const brandName    = brand.companyName;

    return (
        <>
        <CategoryDetailChrome error={saveError}
            crumb="Quote templates & branding" category="Quoting" title="Quote templates & branding"
            subtitle="Header, footer, terms boilerplate, and PDF styling for sent quotes"
            statusDetail={`${templates.length} templates · brand locked`}
            onBack={onBack} dirty={dirty} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
        >
            {/* New template modal */}
            {showNewModal && <NewTemplateModal templates={templates} onClose={() => setShowNewModal(false)} onCreate={handleCreateTemplate}/>}

            <div style={{ padding:'0 0 40px' }}>
                {/* Brand strip */}
                <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2, padding:'14px 18px', marginBottom:18, display:'grid', gridTemplateColumns:'60px 1fr 1fr 1fr 1fr 120px', gap:18, alignItems:'center' }}>
                    <div style={{ width:48, height:48, background:QT_BRANDING.paper, border:`1.5px solid ${brandColor}`, borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, color:brandColor }}>
                        {QT_BRANDING.logoMark}
                    </div>
                    <div>
                        <div style={{ fontSize:9.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', marginBottom:2, fontFamily:T.sans }}>Company name</div>
                        <div style={{ fontFamily:T.serif, fontStyle:'italic', fontWeight:700, fontSize:16 }}>{brandName}</div>
                    </div>
                    <div>
                        <div style={{ fontSize:9.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', marginBottom:2, fontFamily:T.sans }}>Primary color</div>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <span style={{ width:14, height:14, background:brandColor, borderRadius:2, border:'1px solid rgba(0,0,0,0.1)', flexShrink:0 }}/>
                            <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:12 }}>{brandColor}</span>
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize:9.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', marginBottom:2, fontFamily:T.sans }}>Display font</div>
                        <div style={{ fontFamily:T.serif, fontStyle:'italic', fontSize:14 }}>{brand.displayFont}</div>
                    </div>
                    <div>
                        <div style={{ fontSize:9.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', marginBottom:2, fontFamily:T.sans }}>Body font</div>
                        <div style={{ fontSize:13, fontFamily:T.sans }}>{brand.bodyFont}</div>
                    </div>
                    <button onClick={() => setShowEditBrand(true)} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}
                        onMouseEnter={e => e.currentTarget.style.background=T.surface2}
                        onMouseLeave={e => e.currentTarget.style.background=T.surface}>
                        Edit brand
                    </button>
                </div>

                {/* Two-column body */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:20 }}>
                    {/* Left: templates grid */}
                    <CSectionCard
                        title="Templates"
                        description="The set of quote layouts your team can pick from. The default is used unless a rep changes it."
                        headAction={
                            <div style={{ display:'flex', gap:8 }}>
                                <button style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 11px', background:'transparent', border:`1px solid ${T.border}`, color:T.ink, fontSize:12, fontWeight:500, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}
                                    onMouseEnter={e => e.currentTarget.style.background=T.surface2}
                                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                    <LIcon name="upload" size={12}/> Import
                                </button>
                                <button onClick={() => { setShowNewModal(true); }}
                                    style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 11px', background:'transparent', border:`1px solid ${T.border}`, color:T.ink, fontSize:12, fontWeight:500, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}
                                    onMouseEnter={e => e.currentTarget.style.background=T.surface2}
                                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                    + New template
                                </button>
                            </div>
                        }
                    >
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:14 }}>
                            {templates.map((t,i) => (
                                <TplLibCard key={t.id} t={t} isLastRow={i >= templates.length - 3}
                                    isDefault={i===0}
                                    isSelected={selectedId===t.id}
                                    isEditing={editingTplId===t.id}
                                    editingName={editingTplId===t.id ? editingName : t.name}
                                    onEditingNameChange={v => setEditingName(v)}
                                    onEditingCommit={commitNameEdit}
                                    onClick={() => { if (editingTplId) commitNameEdit(); setSelectedId(t.id); }}
                                    onEdit={() => {
                                        setSelectedId(t.id);
                                        setEditingTplId(t.id);
                                        setEditingName(t.name);
                                    }}
                                    onDuplicate={() => {
                                        const copy = { ...t, id:`tpl_${Date.now()}`, name:`Copy of ${t.name}`, usedTimes:0, lastUsed:'Just created', avgWinRate:0, status:'draft', createdBy:CURRENT_USER.id, createdByName:CURRENT_USER.name, systemTemplate:false };
                                        setTemplates(prev => [...prev, copy]);
                                        setDirty(true);
                                    }}
                                    onSetDefault={() => {
                                        setTemplates(prev => prev.map((x,j) => ({ ...x, isDefault: j===i })));
                                        setDirty(true);
                                    }}
                                    onDelete={() => {
                                        if (templates.length <= 1) return;
                                        setTemplates(prev => prev.filter(x => x.id !== t.id));
                                        if (selectedId === t.id) setSelectedId(templates.find(x => x.id !== t.id)?.id || null);
                                        setDirty(true);
                                    }}
                                />
                            ))}
                            {/* New template CTA tile */}
                            <div onClick={() => setShowNewModal(true)}
                                style={{ border:`1.5px dashed ${T.border}`, borderRadius:T.r+2, minHeight:230, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:6, color:T.inkMuted, cursor:'pointer', background:'rgba(255,255,255,0.4)', transition:'border-color 120ms, background 120ms' }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor=T.goldInk; e.currentTarget.style.background='rgba(200,185,154,0.06)'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor=T.border; e.currentTarget.style.background='rgba(255,255,255,0.4)'; }}>
                                <span style={{ fontSize:22, color:T.goldInk }}>+</span>
                                <span style={{ fontSize:12, fontWeight:600, color:T.inkMid }}>New template</span>
                                <span style={{ fontSize:10.5, color:T.inkMuted }}>Start blank or duplicate</span>
                            </div>
                        </div>
                    </CSectionCard>

                    {/* Right: defaults + boilerplate */}
                    <div>
                        <CSectionCard title="Defaults" description="Applied to all templates unless overridden.">
                            {[
                                { label:'Issue date',              hint:'When the date stamped on the quote is set', key:'issueDate',     opts:['Date sent','Date created','Manual'] },
                                { label:'Default validity',         hint:null, key:'validity',      opts:['14 days','30 days','45 days','60 days','90 days'] },
                                { label:'Default payment terms',   hint:null, key:'paymentTerms',  opts:['Net-15','Net-30','Net-45','Net-60','Due on receipt'] },
                                { label:'Auto-renew clause',       hint:null, key:'autoRenew',     opts:['None','30-day notice','60-day notice','90-day notice'] },
                                { label:'Currency',                hint:null, key:'currency',      opts:['USD','EUR','GBP','CAD','AUD'] },
                                { label:'Sign-off method',         hint:null, key:'signOff',       opts:['DocuSign','PandaDoc','HelloSign','Manual signature','None'] },
                            ].map((f,i) => (
                                <div key={i} style={{ marginBottom:12 }}>
                                    <label style={{ fontSize:11, fontWeight:600, color:T.inkMid, display:'block', marginBottom:3, fontFamily:T.sans }}>{f.label}</label>
                                    {sel(f.opts, defaults[f.key] || f.opts[0], v => setfd(f.key, v))}
                                    {f.hint && <span style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>{f.hint}</span>}
                                </div>
                            ))}
                        </CSectionCard>

                        <CSectionCard title="Boilerplate text" description="Editable per template; this is the fallback.">
                            {editBoilerplate ? (
                                <textarea value={boilerplate} onChange={e => { setBoilerplate(e.target.value); setDirty(true); }} rows={5}
                                    style={{ width:'100%', padding:12, background:T.surface2, borderRadius:T.r, fontSize:11, color:T.inkMid, lineHeight:1.6, fontFamily:T.serif, fontStyle:'italic', border:`1px solid ${T.border}`, outline:'none', resize:'vertical', boxSizing:'border-box' }}/>
                            ) : (
                                <div style={{ position:'relative', padding:12, background:T.surface2, borderRadius:T.r, fontSize:11, color:T.inkMid, lineHeight:1.6, fontFamily:T.serif, fontStyle:'italic', maxHeight:110, overflow:'hidden' }}>
                                    {boilerplate}
                                    <div style={{ position:'absolute', bottom:0, left:0, right:0, height:30, background:`linear-gradient(180deg, transparent 0%, ${T.surface2} 100%)` }}/>
                                </div>
                            )}
                            <button onClick={() => setEditBoilerplate(v => !v)}
                                style={{ marginTop:10, fontSize:11, color:T.goldInk, fontWeight:600, cursor:'pointer', background:'none', border:'none', padding:0, fontFamily:T.sans }}>
                                {editBoilerplate ? 'Done editing' : 'Edit boilerplate →'}
                            </button>
                        </CSectionCard>
                    </div>
                </div>
            </div>
        </CategoryDetailChrome>
        {showEditBrand && <EditBrandModal initial={brand} onClose={() => setShowEditBrand(false)}/>}
        </>
    );
};
