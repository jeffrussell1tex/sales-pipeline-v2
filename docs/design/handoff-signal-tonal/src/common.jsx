// Shared primitives — icons, chips, tiny helpers used across all three variations.
// Each variation owns its own palette; this file is neutral.

// ── Minimal icon set. Stroke-based, 1.5px, meant to feel editorial not "generic SaaS".
const Icon = ({ name, size = 16, color = 'currentColor', strokeWidth = 1.5, style }) => {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round', style };
  switch (name) {
    case 'search':   return <svg {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>;
    case 'check':    return <svg {...p}><path d="M4 12l5 5L20 6"/></svg>;
    case 'x':        return <svg {...p}><path d="M6 6l12 12M18 6L6 18"/></svg>;
    case 'arrow-r':  return <svg {...p}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
    case 'arrow-ur': return <svg {...p}><path d="M7 17L17 7M9 7h8v8"/></svg>;
    case 'phone':    return <svg {...p}><path d="M5 4h4l2 5-3 2a12 12 0 006 6l2-3 5 2v4a2 2 0 01-2 2A17 17 0 013 6a2 2 0 012-2z"/></svg>;
    case 'mail':     return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>;
    case 'calendar': return <svg {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>;
    case 'users':    return <svg {...p}><circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6"/><circle cx="17" cy="7" r="2.5"/><path d="M22 18c0-2.5-2-4.5-5-4.5"/></svg>;
    case 'doc':      return <svg {...p}><path d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M14 3v5h5"/></svg>;
    case 'meeting':  return <svg {...p}><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/></svg>;
    case 'spark':    return <svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg>;
    case 'flame':    return <svg {...p}><path d="M12 3s5 5 5 10a5 5 0 11-10 0c0-2 1-3 1-5 0 2 2 3 4 3 0-3-3-4 0-8z"/></svg>;
    case 'clock':    return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case 'alert':    return <svg {...p}><path d="M12 3l10 17H2L12 3z"/><path d="M12 10v5M12 18v.5" strokeWidth={strokeWidth*1.2}/></svg>;
    case 'plus':     return <svg {...p}><path d="M12 5v14M5 12h14"/></svg>;
    case 'bell':     return <svg {...p}><path d="M6 16V10a6 6 0 1112 0v6l2 2H4l2-2z"/><path d="M10 20a2 2 0 004 0"/></svg>;
    case 'filter':   return <svg {...p}><path d="M4 5h16l-6 8v6l-4-2v-4L4 5z"/></svg>;
    case 'grip':     return <svg {...p}><circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/></svg>;
    case 'trending': return <svg {...p}><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>;
    case 'chevron-r':return <svg {...p}><path d="M9 6l6 6-6 6"/></svg>;
    case 'chevron-d':return <svg {...p}><path d="M6 9l6 6 6-6"/></svg>;
    case 'building': return <svg {...p}><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2"/></svg>;
    case 'layers':   return <svg {...p}><path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 18l9 5 9-5"/></svg>;
    case 'target':   return <svg {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill={color}/></svg>;
    case 'home':     return <svg {...p}><path d="M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1V11z"/></svg>;
    case 'pipeline': return <svg {...p}><rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="8" width="5" height="12" rx="1"/><rect x="17" y="12" width="5" height="8" rx="1"/></svg>;
    case 'menu':     return <svg {...p}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
    case 'more':     return <svg {...p}><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>;
    case 'mic':      return <svg {...p}><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>;
    case 'snooze':   return <svg {...p}><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 3l-4 3M15 3l4 3"/></svg>;
    case 'inbox':    return <svg {...p}><path d="M3 13l3-8h12l3 8v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6z"/><path d="M3 13h5l1 2h6l1-2h5"/></svg>;
    case 'grid':     return <svg {...p}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>;
    case 'focus':    return <svg {...p}><path d="M3 9V5a2 2 0 012-2h4M21 9V5a2 2 0 00-2-2h-4M3 15v4a2 2 0 002 2h4M21 15v4a2 2 0 01-2 2h-4"/><circle cx="12" cy="12" r="3"/></svg>;
    case 'repeat':   return <svg {...p}><path d="M17 3l4 4-4 4M21 7H7a4 4 0 00-4 4v2M7 21l-4-4 4-4M3 17h14a4 4 0 004-4v-2"/></svg>;
    case 'sparkle':  return <svg {...p}><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z"/></svg>;
    case 'arrow-l':  return <svg {...p}><path d="M19 12H5M11 6l-6 6 6 6"/></svg>;
    case 'link':     return <svg {...p}><path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 10-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 105.66 5.66l1-1"/></svg>;
    case 'hash':     return <svg {...p}><path d="M5 9h14M5 15h14M9 3l-2 18M17 3l-2 18"/></svg>;
    case 'columns':  return <svg {...p}><rect x="3" y="4" width="8" height="16" rx="1"/><rect x="13" y="4" width="8" height="16" rx="1"/></svg>;
    case 'edit':     return <svg {...p}><path d="M4 20h4l11-11-4-4L4 16v4z"/><path d="M14 6l4 4"/></svg>;
    case 'shield':   return <svg {...p}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/></svg>;
    case 'settings': return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3h0a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8v0a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"/></svg>;
    default: return null;
  }
};

// Circular avatar with initials + deterministic warm color
const initials = (name) => name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const warmAvatarColor = (name) => {
  const palette = ['#9c6b4a', '#7a5a3c', '#5a6e5a', '#6b5a7a', '#8a5a5a', '#5a7a8a', '#7a6b5a', '#4a6b5a'];
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
};
const Avatar = ({ name, size = 28, textSize }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%',
    background: warmAvatarColor(name), color: '#fef4e6',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: textSize || Math.round(size * 0.38), fontWeight: 600,
    letterSpacing: 0.3, flexShrink: 0,
  }}>{initials(name)}</div>
);

// Progress ring — used for quota, health
const Ring = ({ value = 0, max = 100, size = 72, stroke = 6, color = '#3a3531', trackColor = '#e6ded0', children, labelColor }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none"/>
        <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`} />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: labelColor || color, fontWeight: 600, fontSize: Math.round(size * 0.22),
      }}>{children}</div>
    </div>
  );
};

// Hover detection hook
const useHover = () => {
  const [h, setH] = React.useState(false);
  return [h, { onMouseEnter: () => setH(true), onMouseLeave: () => setH(false) }];
};

Object.assign(window, { Icon, initials, warmAvatarColor, Avatar, Ring, useHover });
