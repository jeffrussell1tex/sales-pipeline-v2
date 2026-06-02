// settings/salesProcess/shared.jsx — shared Sales-process chrome + primitives
import React from 'react';
import { T } from '../shared/tokens.js';

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
