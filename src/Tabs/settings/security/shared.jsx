// settings/security/shared.jsx
import React from 'react';
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
