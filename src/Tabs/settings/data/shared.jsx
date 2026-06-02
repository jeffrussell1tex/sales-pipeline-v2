// settings/data/shared.jsx
import React from 'react';
import { T } from '../shared/tokens.js';

export const DataStatCard = ({ label, value, mono, warn }) => (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, padding:14 }}>
        <div style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', marginBottom:6, fontFamily:T.sans }}>{label}</div>
        <div style={{ fontFamily: mono ? 'ui-monospace,Menlo,monospace' : T.serif, fontStyle: mono ? 'normal' : 'italic', fontWeight:700, fontSize: mono ? 18 : 26, color: warn ? T.warn : T.ink }}>{value}</div>
    </div>
);

export const DataCard = ({ title, desc, headAction, children }) => (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:20, marginBottom:16, fontFamily:T.sans }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 }}>
            <div>
                <div style={{ fontSize:15, fontWeight:700, color:T.ink }}>{title}</div>
                {desc && <div style={{ fontSize:12.5, color:T.inkMid, marginTop:3 }}>{desc}</div>}
            </div>
            {headAction}
        </div>
        {children}
    </div>
);

export const DPill = ({ tone='neutral', children }) => {
    const m = {
        ok:      { bg:'rgba(77,107,61,0.12)',   fg:T.ok      },
        warn:    { bg:'rgba(184,115,51,0.12)',  fg:T.warn    },
        danger:  { bg:'rgba(156,58,46,0.12)',   fg:T.danger  },
        info:    { bg:'rgba(58,90,122,0.10)',   fg:T.info    },
        neutral: { bg:'rgba(138,131,120,0.12)', fg:T.inkMid  },
    };
    const c = m[tone]||m.neutral;
    return <span style={{ display:'inline-block', padding:'2px 7px', borderRadius:10, fontSize:11, fontWeight:700, background:c.bg, color:c.fg, fontFamily:T.sans, whiteSpace:'nowrap' }}>{children}</span>;
};

export const DataCrumb = ({ page, onBack }) => (
    <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:T.inkMuted, marginBottom:10, fontFamily:T.sans }}>
        <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>Settings</button>
        <span>/</span>
        <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>Data</button>
        <span>/</span>
        <span style={{ color:T.ink, fontWeight:600 }}>{page}</span>
    </div>
);

export const DataTitle = ({ title, sub, badge, updatedBy, updatedAt, actions, dirty }) => (
    <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', paddingBottom:16, borderBottom:`1px solid ${T.border}`, marginBottom:20, fontFamily:T.sans }}>
        <div style={{ borderLeft:`3px solid ${T.goldInk}`, paddingLeft:10 }}>
            <div style={{ fontSize:22, fontWeight:700, color:T.ink, letterSpacing:-0.3 }}>
                {title}{dirty && <span style={{ fontSize:12, fontWeight:500, color:T.warn, marginLeft:12 }}>● Unsaved</span>}
            </div>
            <div style={{ fontSize:13, color:T.inkMid, marginTop:3, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                <span>{sub}</span>
                {badge && <><span style={{ color:T.inkMuted }}>•</span><span style={{ color:T.ok, fontWeight:600 }}>✓ {badge}</span></>}
                {updatedBy && <><span style={{ color:T.inkMuted }}>•</span><span style={{ fontSize:11.5, color:T.inkMuted }}>Last: {updatedAt} by <b style={{ color:T.inkMid, fontWeight:500 }}>{updatedBy}</b></span></>}
            </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>{actions}</div>
    </div>
);

export const DataBtn = ({ label, primary, danger:isDanger, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled}
        style={{ padding:'7px 14px', fontFamily:T.sans, fontSize:12.5, fontWeight:600, cursor:disabled?'default':'pointer', borderRadius:T.r, whiteSpace:'nowrap',
            background: isDanger ? T.danger : primary ? T.ink : T.surface,
            color: (isDanger||primary) ? '#fbf8f3' : T.ink,
            border: (isDanger||primary) ? 'none' : `1px solid ${T.borderStrong}`,
            opacity: disabled ? 0.6 : 1, transition:'opacity 100ms' }}>
        {label}
    </button>
);

export const DataModal = ({ width=640, onClose, children }) => (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(42,38,34,0.45)', zIndex:700, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:T.sans }}>
        <div onClick={e=>e.stopPropagation()} style={{ background:T.surface, borderRadius:8, width, maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 20px 56px rgba(20,16,12,0.28)' }}>
            {children}
        </div>
    </div>
);

export const DataModalHead = ({ title, sub, onClose }) => (
    <div style={{ padding:'18px 22px 14px', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
            <div>
                <div style={{ fontSize:16, fontWeight:700, color:T.ink }}>{title}</div>
                {sub && <div style={{ fontSize:12.5, color:T.inkMuted, marginTop:2 }}>{sub}</div>}
            </div>
            <button onClick={onClose} style={{ background:'none', border:'none', color:T.inkMuted, fontSize:20, cursor:'pointer', lineHeight:1, padding:'2px 4px' }}>×</button>
        </div>
    </div>
);

export const DataModalFoot = ({ children }) => (
    <div style={{ padding:'12px 22px', borderTop:`1px solid ${T.border}`, background:T.surface2, display:'flex', gap:8, justifyContent:'flex-end', flexShrink:0 }}>{children}</div>
);
