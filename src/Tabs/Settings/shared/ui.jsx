// settings/shared/ui.jsx — shared UI primitives
import React from 'react';
import { T, CATEGORY_TINT, STATUS_STYLES } from './tokens.js';

export const StatusChip = ({ status, detail, small }) => {
    const s = STATUS_STYLES[status] || STATUS_STYLES.ok;
    return (
        <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding: small ? '1px 6px' : '2px 8px', background:s.bg, color:s.fg, borderRadius:T.r, fontSize: small ? 10.5 : 11, fontWeight:600, letterSpacing:0.2, whiteSpace:'nowrap', fontFamily:T.sans }}>
            <span style={{ fontSize: small ? 9 : 10 }}>{s.icon}</span>
            {detail || status}
        </span>
    );
};

// ── NEW badge ────────────────────────────────────────────────
export const NewBadge = () => (
    <span style={{ display:'inline-block', padding:'1px 5px', fontSize:9, fontWeight:700, letterSpacing:0.6, color:'#7a6a48', background:'rgba(200,185,154,0.25)', border:'1px solid rgba(200,185,154,0.5)', borderRadius:2, verticalAlign:'middle', fontFamily:T.sans }}>NEW</span>
);

// ── Setting icon tile ────────────────────────────────────────
export const SettingIcon = ({ category, size = 34 }) => {
    const t = CATEGORY_TINT[category] || { bg: '#eee', fg: '#555' };
    return (
        <div style={{ width:size, height:size, background:t.bg, borderRadius:6, display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <div style={{ width:14, height:14, background:t.fg, borderRadius:2, opacity:0.85 }}/>
        </div>
    );
};

// ── Avatar ───────────────────────────────────────────────────
const avatarBg = (name) => {
    const p = ['#9c6b4a','#7a5a3c','#5a6e5a','#6b5a7a','#8a5a5a','#5a7a8a','#7a6b5a','#4a6b5a'];
    let h = 0; for (const c of (name||'')) h = (h * 31 + c.charCodeAt(0)) | 0;
    return p[Math.abs(h) % p.length];
};
export const Avatar = ({ name, size = 28 }) => {
    const initials = (name||'').split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();
    return (
        <div style={{ width:size, height:size, borderRadius:'50%', background:avatarBg(name), color:'#fef4e6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.33, fontWeight:700, flexShrink:0 }}>{initials}</div>
    );
};

// ── Toggle (visual only) ──────────────────────────────────────
export const RToggle = ({ on, onChange }) => (
    <div onClick={() => onChange && onChange(!on)} style={{ width:28, height:16, borderRadius:10, padding:2, flexShrink:0, background: on ? T.ink : '#d4c8b4', transition:'background 120ms', cursor:'pointer' }}>
        <div style={{ width:12, height:12, borderRadius:'50%', background:'#fbf8f3', transform: on ? 'translateX(12px)' : 'translateX(0)', transition:'transform 120ms' }}/>
    </div>
);

// ── Checkbox ─────────────────────────────────────────────────
export const RCheck = ({ on, onChange }) => (
    <div style={{ display:'flex', justifyContent:'center' }}>
        <div onClick={() => onChange && onChange(!on)} style={{ width:16, height:16, borderRadius:3, border:`1.5px solid ${on ? T.ink : '#d4c8b4'}`, background: on ? T.ink : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:'#fbf8f3', fontWeight:700, cursor:'pointer' }}>
            {on ? '✓' : ''}
        </div>
    </div>
);

// ── Ring (quota/health gauge) ─────────────────────────────────
export const Ring = ({ value=0, max=100, size=72, stroke=7, color='#4d6b3d', trackColor }) => {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const pct = Math.max(0, Math.min(1, value / max));
    return (
        <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
            <svg width={size} height={size}>
                <circle cx={size/2} cy={size/2} r={r} stroke={trackColor || T.border} strokeWidth={stroke} fill="none"/>
                <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeDasharray={c} strokeDashoffset={c*(1-pct)} strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}/>
            </svg>
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:Math.round(size*0.22), fontWeight:700, color:T.ink, fontFamily:T.sans }}>
                {Math.round(pct*100)}%
            </div>
        </div>
    );
};

// ── Category chip ─────────────────────────────────────────────
export const CategoryChip = ({ category }) => {
    const t = CATEGORY_TINT[category] || { bg:'#eee', fg:'#555' };
    return (
        <span style={{ display:'inline-block', padding:'2px 7px', background:t.bg, color:t.fg, borderRadius:T.r, fontSize:10.5, fontWeight:600, letterSpacing:0.2, fontFamily:T.sans }}>{category}</span>
    );
};

const EXTRA_ICON_PATHS = {
    'link':     <g><path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 10-5.66-5.66l-1.5 1.5"/><path d="M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 105.66 5.66l1.5-1.5"/></g>,
    'upload':   <g><path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 20h16"/></g>,
    'download': <g><path d="M12 4v12M6 10l6 6 6-6"/><path d="M4 20h16"/></g>,
    'refresh':  <g><path d="M4 12a8 8 0 0114-5.3L20 8"/><path d="M20 4v4h-4"/><path d="M20 12a8 8 0 01-14 5.3L4 16"/><path d="M4 20v-4h4"/></g>,
    'lock':     <g><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 018 0v3"/></g>,
    'info':     <g><circle cx="12" cy="12" r="9"/><path d="M12 8v.5M12 11v5"/></g>,
    'chevron-down': <path d="M6 9l6 6 6-6"/>,
};
export const LIcon = ({ name, size = 16, color = 'currentColor', sw = 1.5, style: st }) => {
    if (EXTRA_ICON_PATHS[name]) {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={st}>
                {EXTRA_ICON_PATHS[name]}
            </svg>
        );
    }
    return null;
};

// Shared form primitives
