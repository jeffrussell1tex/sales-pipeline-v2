// settings/salesProcess/shared.jsx — shared Sales-process chrome + primitives
import React from 'react';
import { T } from '../shared/tokens.js';
import { StatusChip } from '../shared/ui.jsx';

// SPDetailPageChrome — detail-page chrome with the Sales-process breadcrumb.
export const SPDetailPageChrome = ({ crumb, category = 'Sales process', title, subtitle, statusDetail, updatedBy, updatedAt,
    onBack, dirty, onCancel, primaryAction, primaryLabel, disablePrimary, rightActions, extraActions, children }) => (
    <div style={{ fontFamily: T.sans }}>
        {/* Breadcrumb */}
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:T.inkMuted, marginBottom:10 }}>
            <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>Settings</button>
            <span>/</span>
            <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>{category}</button>
            <span>/</span>
            <span style={{ color:T.ink, fontWeight:600 }}>{crumb}</span>
        </div>
        {/* Title band */}
        <div style={{ display:'flex', alignItems:'flex-end', gap:24, paddingBottom:18, borderBottom:`1px solid ${T.border}`, marginBottom:20 }}>
            <div style={{ borderLeft:`3px solid ${T.goldInk}`, paddingLeft:10, flex:1 }}>
                <div style={{ fontSize:22, fontWeight:700, color:T.ink, letterSpacing:-0.3, fontFamily:T.sans }}>
                    {title}
                    {dirty && <span style={{ fontSize:12, fontWeight:500, color:T.warn, marginLeft:12, fontFamily:T.sans }}>● Unsaved changes</span>}
                </div>
                <div style={{ fontSize:13, color:T.inkMid, marginTop:4, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', fontFamily:T.sans }}>
                    <span>{subtitle}</span>
                    <span style={{ color:T.inkMuted }}>•</span>
                    <StatusChip status="ok" detail={statusDetail} small/>
                    <span style={{ color:T.inkMuted }}>•</span>
                    <span style={{ fontSize:11.5, color:T.inkMuted }}>Last edited {updatedAt} by <span style={{ color:T.inkMid, fontWeight:500 }}>{updatedBy}</span></span>
                </div>
            </div>
            <div style={{ display:'flex', gap:8, flexShrink:0, alignItems:'center' }}>
                {extraActions && <div style={{ display:'flex', gap:8 }}>{extraActions}</div>}
                {rightActions || (
                    <>
                        <button onClick={onCancel} style={{ padding:'8px 16px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                        <button onClick={primaryAction} disabled={disablePrimary !== undefined ? disablePrimary : !dirty}
                            style={{ padding:'8px 16px', background:(disablePrimary !== undefined ? !disablePrimary : dirty) ? T.ink : T.borderStrong, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:(disablePrimary !== undefined ? !disablePrimary : dirty) ? 'pointer':'default', fontFamily:T.sans, transition:'background 120ms' }}>
                            {primaryLabel}
                        </button>
                    </>
                )}
            </div>
        </div>
        {children}
    </div>
);

// ── Shared SP primitives ────────────────────
export const SPTable = ({ columns, rows }) => (
    <div style={{ border:`1px solid ${T.border}`, borderRadius:T.r+2, overflow:'hidden', background:T.surface }}>
        <div style={{ display:'grid', gridTemplateColumns:columns.map(c => c.w||'1fr').join(' '), padding:'9px 14px', borderBottom:`1px solid ${T.border}`, background:T.surface2, gap:10 }}>
            {columns.map((c,i) => (
                <div key={i} style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', textAlign:c.align||'left', fontFamily:T.sans }}>{c.label}</div>
            ))}
        </div>
        {rows.map((row,i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:columns.map(c => c.w||'1fr').join(' '), padding:'11px 14px', gap:10, borderBottom: i===rows.length-1 ? 'none' : `1px solid ${T.border}`, alignItems:'center' }}>
                {columns.map((c,j) => (
                    <div key={j} style={{ textAlign:c.align||'left', color:c.muted ? T.inkMid : T.ink, fontFamily: c.mono ? 'ui-monospace,Menlo,monospace' : T.sans, fontSize:13 }}>
                        {row[c.key]}
                    </div>
                ))}
            </div>
        ))}
    </div>
);

export const SPDrag = ({ muted }) => (
    <span style={{ color: muted ? T.border : T.inkMuted, fontSize:14, cursor:'grab', userSelect:'none', letterSpacing:-2 }}>⋮⋮</span>
);

export const SPSparkline = ({ data, color }) => {
    const max = Math.max(...data), min = Math.min(...data);
    const w = 120, h = 28;
    const pts = data.map((v,i) => {
        const x = (i / (data.length-1)) * w;
        const y = h - ((v - min) / ((max-min)||1)) * h;
        return `${x},${y}`;
    }).join(' ');
    return (
        <svg width={w} height={h} style={{ verticalAlign:'middle' }}>
            <polyline points={pts} fill="none" stroke={color||T.ok} strokeWidth="1.5"/>
        </svg>
    );
};
