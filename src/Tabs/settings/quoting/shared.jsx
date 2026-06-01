// settings/quoting/shared.jsx — shared Quoting primitives
import React from 'react';
import { T } from '../shared/tokens.js';

export const QPill = ({ tone = 'neutral', children, dot }) => {
    const map = {
        rep:     { bg:'rgba(77,107,61,0.12)',   fg:'#4d6b3d' },
        mgr:     { bg:'rgba(184,115,51,0.12)',  fg:'#b87333' },
        vp:      { bg:'rgba(156,58,46,0.12)',   fg:'#9c3a2e' },
        cfo:     { bg:'rgba(107,42,34,0.14)',   fg:'#6b2a22' },
        neutral: { bg:'rgba(138,131,120,0.14)', fg:'#5a544c' },
    };
    const c = map[tone] || map.neutral;
    return (
        <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'2px 8px', borderRadius:12, background:c.bg, color:c.fg, fontSize:11, fontWeight:600, letterSpacing:0.1, whiteSpace:'nowrap' }}>
            {dot && <span style={{ width:6, height:6, borderRadius:'50%', background:c.fg }}/>}
            {children}
        </span>
    );
};

export const ATToggle = ({ on, onChange }) => (
    <span onClick={onChange} style={{ display:'inline-block', width:28, height:16, borderRadius:8, background: on ? T.ok : T.borderStrong, position:'relative', cursor:'pointer', verticalAlign:'middle', flexShrink:0 }}>
        <span style={{ position:'absolute', top:2, left: on ? 14 : 2, width:12, height:12, borderRadius:'50%', background:'#fff', boxShadow:'0 1px 2px rgba(0,0,0,0.15)', transition:'left 120ms' }}/>
    </span>
);
