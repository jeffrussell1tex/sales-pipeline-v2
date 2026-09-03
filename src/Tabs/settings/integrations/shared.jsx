// settings/integrations/shared.jsx
import React from 'react';
import { T } from '../shared/tokens.js';

export const IntCrumb = ({ page, onBack }) => (
    <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:T.inkMuted, marginBottom:10 }}>
        <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>Settings</button>
        <span>/</span>
        <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>Integrations</button>
        <span>/</span>
        <span style={{ color:T.ink, fontWeight:600 }}>{page}</span>
    </div>
);

export const IntTitle = ({ title, sub, actions, dirty }) => (
    <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', paddingBottom:16, borderBottom:`1px solid ${T.border}`, marginBottom:20 }}>
        <div style={{ borderLeft:`3px solid ${T.goldInk}`, paddingLeft:10 }}>
            <div style={{ fontSize:22, fontWeight:700, color:T.ink, letterSpacing:-0.3, fontFamily:T.sans }}>
                {title}{dirty && <span style={{ fontSize:12, fontWeight:500, color:T.warn, marginLeft:12 }}>● Unsaved</span>}
            </div>
            <div style={{ fontSize:13, color:T.inkMid, marginTop:3, fontFamily:T.sans }}>{sub}</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>{actions}</div>
    </div>
);

// `disabled` was passed by four callers (Create key, Creating…, Create automation,
// Create endpoint) and dropped here, so none of those buttons was ever actually
// disabled — a second click during a save went through. Honoured since state §0.89.
export const IntBtn = ({ label, primary, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled}
        style={{ padding:'7px 14px', background: primary ? T.ink : T.surface, color: primary ? '#fbf8f3' : T.ink,
            border: primary ? 'none' : `1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600,
            cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1, fontFamily:T.sans, whiteSpace:'nowrap' }}
        onMouseEnter={e=>{ if (!disabled) e.currentTarget.style.background= primary ? '#3d3530' : T.surface2; }}
        onMouseLeave={e=>e.currentTarget.style.background= primary ? T.ink : T.surface}>
        {label}
    </button>
);

export const IntModal = ({ width=560, onClose, children }) => (
    <div onClick={onClose}
        style={{ position:'fixed', inset:0, background:'rgba(42,38,34,0.40)', zIndex:700, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:T.sans }}>
        <div onClick={e=>e.stopPropagation()}
            style={{ background:T.surface, borderRadius:8, width, maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 20px 56px rgba(20,16,12,0.28)' }}>
            {children}
        </div>
    </div>
);

export const IntModalHeader = ({ title, sub, onClose, left }) => (
    <div style={{ padding:'18px 22px 14px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', alignItems:'flex-start', gap:12 }}>
        {left}
        <div style={{ flex:1 }}>
            <div style={{ fontSize:17, fontWeight:700, color:T.ink, letterSpacing:-0.2 }}>{title}</div>
            {sub && <div style={{ fontSize:12.5, color:T.inkMuted, marginTop:2 }}>{sub}</div>}
        </div>
        <button onClick={onClose} style={{ background:'none', border:'none', color:T.inkMuted, fontSize:20, cursor:'pointer', padding:'2px 4px', lineHeight:1, borderRadius:4 }}
            onMouseEnter={e=>e.currentTarget.style.color=T.ink} onMouseLeave={e=>e.currentTarget.style.color=T.inkMuted}>×</button>
    </div>
);

export const IntModalFooter = ({ left, children }) => (
    <div style={{ padding:'12px 22px', borderTop:`1px solid ${T.border}`, background:T.surface2, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div style={{ fontSize:11.5, color:T.inkMuted, fontStyle:'italic' }}>{left}</div>
        <div style={{ display:'flex', gap:8 }}>{children}</div>
    </div>
);

// Shared row-menu item (used by WebhookRowMenu, ApiKeyRowMenu)
export const MenuRow = ({ icon, label, danger:isDanger, onClick, onClose }) => (
    <div onClick={() => { onClick(); onClose && onClose(); }}
    style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:3,
    cursor:'pointer', color:isDanger?T.danger:T.ink, fontFamily:T.sans }}
    onMouseEnter={e => e.currentTarget.style.background='rgba(200,185,154,0.10)'}
    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
    <span style={{ width:14, textAlign:'center', fontSize:13 }}>{icon}</span>
    <span style={{ fontSize:12.5, fontWeight:500 }}>{label}</span>
    </div>
    );
