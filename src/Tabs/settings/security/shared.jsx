// settings/security/shared.jsx
import React, { useState, useEffect, useRef } from 'react';
import { T } from '../shared/tokens.js';

export const SecCrumb = ({ page, onBack }) => (
    <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:T.inkMuted, marginBottom:10, fontFamily:T.sans }}>
        <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>Settings</button>
        <span>/</span>
        <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>Security</button>
        <span>/</span>
        <span style={{ color:T.ink, fontWeight:600 }}>{page}</span>
    </div>
);

export const SecTitle = ({ title, sub, badge, updatedAt, actions, dirty }) => (
    <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', paddingBottom:16, borderBottom:`1px solid ${T.border}`, marginBottom:20 }}>
        <div style={{ borderLeft:`3px solid ${T.goldInk}`, paddingLeft:10 }}>
            <div style={{ fontSize:22, fontWeight:700, color:T.ink, letterSpacing:-0.3, fontFamily:T.sans }}>
                {title}{dirty && <span style={{ fontSize:12, fontWeight:500, color:T.warn, marginLeft:12 }}>● Unsaved</span>}
            </div>
            <div style={{ fontSize:13, color:T.inkMid, marginTop:3, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', fontFamily:T.sans }}>
                <span>{sub}</span>
                {badge && <><span style={{ color:T.inkMuted }}>•</span>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:12.5, color:T.ok, fontWeight:600 }}>
                        <span>✓</span><span>{badge}</span>
                    </span></>}
                {updatedAt && <><span style={{ color:T.inkMuted }}>•</span>
                    <span style={{ fontSize:11.5, color:T.inkMuted }}>{updatedAt}</span></>}
            </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>{actions}</div>
    </div>
);

export const SecBtn = ({ label, primary, warn:isWarn, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled}
        style={{ padding:'7px 14px', fontFamily:T.sans, fontSize:12.5, fontWeight:600, cursor:disabled?'default':'pointer', borderRadius:T.r, border:'none', whiteSpace:'nowrap',
            background: isWarn ? T.warn : primary ? T.ink : T.surface,
            color: (isWarn||primary) ? '#fbf8f3' : T.ink,
            ...((!isWarn&&!primary) ? { border:`1px solid ${T.borderStrong}` } : {}),
            opacity: disabled ? 0.6 : 1,
        }}
        onMouseEnter={e=>{ if(!disabled) e.currentTarget.style.opacity='0.85'; }}
        onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
        {label}
    </button>
);

export const SecCallout = ({ tone='warn', icon='⚠', text, actions }) => {
    const c = tone==='warn'
        ? { bg:'rgba(184,115,51,0.09)', border:T.warn, iconColor:T.warn }
        : { bg:'rgba(58,90,122,0.08)',  border:T.info,  iconColor:T.info };
    return (
        <div style={{ padding:'11px 16px', background:c.bg, borderLeft:`3px solid ${c.border}`, borderRadius:4, marginBottom:20, display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ color:c.iconColor, fontSize:16, flexShrink:0 }}>{icon}</span>
            <div style={{ flex:1, fontSize:13, color:T.inkMid, fontFamily:T.sans }}>{text}</div>
            {actions && <div style={{ display:'flex', gap:8, flexShrink:0 }}>{actions}</div>}
        </div>
    );
};

export const SecCard = ({ title, desc, children, headAction }) => (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:20, marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
            <div>
                <div style={{ fontSize:15, fontWeight:700, color:T.ink, fontFamily:T.sans }}>{title}</div>
                {desc && <div style={{ fontSize:12.5, color:T.inkMid, marginTop:3, fontFamily:T.sans }}>{desc}</div>}
            </div>
            {headAction}
        </div>
        {children}
    </div>
);

// Shared dropdown primitives (used by Session policy + Audit filters)
export const DropdownPanel = ({ children, width=280 }) => (
    <div style={{ width, background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:4,
        boxShadow:'0 8px 24px rgba(42,38,34,0.12), 0 2px 4px rgba(42,38,34,0.06)',
        padding:4, fontFamily:T.sans, maxHeight:360, overflowY:'auto' }}>
        {children}
    </div>
);

export const DropdownOption = ({ label, sub, selected, recommended, danger, blocked, onClick }) => (
    <div onClick={blocked ? ()=>alert('Blocked by workspace policy') : onClick}
        style={{ display:'grid', gridTemplateColumns:'18px 1fr auto', gap:10, alignItems:'center',
            padding:'8px 10px', borderRadius:3, cursor: blocked ? 'not-allowed' : 'pointer',
            background: selected ? 'rgba(200,185,154,0.18)' : 'transparent' }}
        onMouseEnter={e=>{ if (!selected && !blocked) e.currentTarget.style.background='rgba(200,185,154,0.10)'; }}
        onMouseLeave={e=>{ e.currentTarget.style.background = selected ? 'rgba(200,185,154,0.18)' : 'transparent'; }}>
        <span style={{ fontSize:12, color: selected ? T.goldInk : 'transparent', textAlign:'center', fontWeight:700 }}>✓</span>
        <div style={{ minWidth:0 }}>
            <div style={{ fontSize:12.5, fontWeight: selected ? 700 : 500,
                color: (danger || blocked) ? T.danger : T.ink, lineHeight:1.2 }}>{label}</div>
            {sub && <div style={{ fontSize:10.5, color:T.inkMuted, marginTop:2, lineHeight:1.4 }}>{sub}</div>}
        </div>
        {recommended && (
            <span style={{ fontSize:9, fontWeight:700, letterSpacing:0.6, textTransform:'uppercase',
                color:T.goldInk, padding:'2px 6px', background:'rgba(200,185,154,0.25)', borderRadius:2, flexShrink:0 }}>Rec.</span>
        )}
    </div>
);

export const PolicySelect = ({ label, value, children, width=260 }) => {
    const [open, setOpen] = React.useState(false);
    const ref    = React.useRef(null);
    const btnRef = React.useRef(null);
    const [pos,  setPos]  = React.useState({ top:0, left:0 });

    React.useEffect(() => {
        if (!open) return;
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) setOpen(false); };
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
    }, [open]);

    const openDropdown = () => {
        if (btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            setPos({ top: r.bottom + 2, left: r.left });
        }
        setOpen(o => !o);
    };

    return (
        <div>
            <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5, fontFamily:T.sans }}>{label}</label>
            <button ref={btnRef} onClick={openDropdown}
                style={{ width:'100%', padding:'8px 10px', border:`1px solid ${open ? T.borderStrong : T.border}`, borderRadius:T.r,
                    fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, cursor:'pointer',
                    display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, textAlign:'left' }}>
                <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{value}</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.inkMuted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: open ? 'rotate(180deg)' : 'none', transition:'transform 100ms', flexShrink:0 }}>
                    <path d="M6 9l6 6 6-6"/>
                </svg>
            </button>
            {open && (
                <div ref={ref} style={{ position:'fixed', top:pos.top, left:pos.left, zIndex:9999 }}>
                    <DropdownPanel width={width}>{React.Children.map(children, child =>
                        child ? React.cloneElement(child, { onClick: child.props.onClick ? () => { child.props.onClick(); setOpen(false); } : () => setOpen(false) }) : null
                    )}</DropdownPanel>
                </div>
            )}
        </div>
    );
};
