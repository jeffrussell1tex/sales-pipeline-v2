// settings/shared/form.jsx — shared form + detail-page primitives
import React from 'react';
import { T } from './tokens.js';
import { StatusChip } from './ui.jsx';

export const CField = ({ label, hint, children, half }) => (
    <div style={{ display:'flex', flexDirection:'column', gap:5, ...(half ? { gridColumn:'span 1' } : {}) }}>
        <label style={{ fontSize:11.5, fontWeight:600, color:T.inkMid, letterSpacing:0.2, fontFamily:T.sans }}>{label}</label>
        {children}
        {hint && <span style={{ fontSize:11, color:T.inkMuted, lineHeight:1.45, fontFamily:T.sans }}>{hint}</span>}
    </div>
);
export const CInput = ({ value, onChange, placeholder, mono }) => (
    <input
        value={value || ''}
        onChange={e => onChange && onChange(e.target.value)}
        placeholder={placeholder}
        style={{ padding:'8px 10px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily: mono ? 'ui-monospace,Menlo,monospace' : T.sans, outline:'none', width:'100%', boxSizing:'border-box' }}
    />
);
export const CTextarea = ({ value, onChange, rows = 4 }) => (
    <textarea
        value={value || ''}
        onChange={e => onChange && onChange(e.target.value)}
        rows={rows}
        style={{ padding:'8px 10px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', width:'100%', boxSizing:'border-box', resize:'vertical', lineHeight:1.5 }}
    />
);
export const CSelect = ({ value, onChange, options }) => (
    <select value={value || ''} onChange={e => onChange && onChange(e.target.value)}
        style={{ padding:'8px 10px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', width:'100%', appearance:'none', cursor:'pointer',
            backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a8378' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat:'no-repeat', backgroundPosition:'right 10px center', paddingRight:28 }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
);
export const CSectionCard = ({ title, description, children, headAction }) => (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:20, marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:16, marginBottom:16 }}>
            <div style={{ flex:1 }}>
                <div style={{ fontSize:15, fontWeight:700, color:T.ink, marginBottom:3, fontFamily:T.sans }}>{title}</div>
                {description && <div style={{ fontSize:12.5, color:T.inkMid, lineHeight:1.5, fontFamily:T.sans }}>{description}</div>}
            </div>
            {headAction}
        </div>
        {children}
    </div>
);

// Shared chrome wrapper for all three detail pages
export const DetailPageChrome = ({ crumb, title, subtitle, statusDetail, updatedBy, updatedAt, onBack, dirty, onCancel, primaryAction, primaryLabel, disablePrimary, rightActions, error, children }) => (
    <div style={{ fontFamily:T.sans }}>
        {/* Breadcrumb */}
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:T.inkMuted, marginBottom:10 }}>
            <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>Settings</button>
            <span>/</span>
            <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>Company</button>
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
                {rightActions || (<>
                <button onClick={onCancel} style={{ padding:'8px 16px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                <button onClick={primaryAction} disabled={disablePrimary !== undefined ? disablePrimary : !dirty} style={{ padding:'8px 16px', background: (disablePrimary !== undefined ? !disablePrimary : dirty) ? T.ink : T.borderStrong, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor: (disablePrimary !== undefined ? !disablePrimary : dirty) ? 'pointer' : 'default', fontFamily:T.sans, transition:'background 120ms' }}>{primaryLabel}</button>
                </>)}
            </div>
        </div>

        {/* Same contract as CategoryDetailChrome: a panel that clears its dirty flag

            on a failed PUT tells the user the change was saved when it was not. */}

        {error && (

            <div style={{ padding:'9px 12px', marginBottom:12, borderRadius:T.r,

                background:`${T.danger}12`, border:`1px solid ${T.danger}55`,

                color:T.danger, fontSize:12.5, fontWeight:600, fontFamily:T.sans }}>

                {error}

            </div>

        )}

        {children}
    </div>
);
