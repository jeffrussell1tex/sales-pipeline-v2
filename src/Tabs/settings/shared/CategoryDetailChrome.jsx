// settings/shared/CategoryDetailChrome.jsx
import React from 'react';
import { T } from './tokens.js';
import { StatusChip } from './ui.jsx';

export const CategoryDetailChrome = ({ crumb, category = 'Sales process', title, subtitle, statusDetail, updatedBy, updatedAt,
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
