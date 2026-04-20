// src/design/primitives.jsx
// Accelerep V1 Shared Primitives
// All imports from tokens.jsx. No external deps beyond React.
// These primitives replace scattered inline style objects across the codebase.

import React from 'react';
import { T, eyebrow, AVATAR_PALETTE, ENG_COLOR } from './tokens.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// useHover — lightweight hover detection hook used by GhostBtn etc.
// ─────────────────────────────────────────────────────────────────────────────
export const useHover = () => {
  const [h, setH] = React.useState(false);
  return [h, { onMouseEnter: () => setH(true), onMouseLeave: () => setH(false) }];
};

// ─────────────────────────────────────────────────────────────────────────────
// Icon — stroke-based SVG icon set. 1.5px stroke weight, 0 fill. Editorial.
// Props: name, size=16, color='currentColor', strokeWidth=1.5, style
// ─────────────────────────────────────────────────────────────────────────────
export const Icon = ({ name, size = 16, color = 'currentColor', strokeWidth = 1.5, style }) => {
  const p = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: color, strokeWidth,
    strokeLinecap: 'round', strokeLinejoin: 'round',
    style, flexShrink: 0,
  };
  switch (name) {
    case 'search':    return <svg {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>;
    case 'check':     return <svg {...p}><path d="M4 12l5 5L20 6"/></svg>;
    case 'x':         return <svg {...p}><path d="M6 6l12 12M18 6L6 18"/></svg>;
    case 'arrow-r':   return <svg {...p}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
    case 'arrow-l':   return <svg {...p}><path d="M19 12H5M11 6l-6 6 6 6"/></svg>;
    case 'arrow-ur':  return <svg {...p}><path d="M7 17L17 7M9 7h8v8"/></svg>;
    case 'phone':     return <svg {...p}><path d="M5 4h4l2 5-3 2a12 12 0 006 6l2-3 5 2v4a2 2 0 01-2 2A17 17 0 013 6a2 2 0 012-2z"/></svg>;
    case 'mail':      return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>;
    case 'calendar':  return <svg {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>;
    case 'users':     return <svg {...p}><circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6"/><circle cx="17" cy="7" r="2.5"/><path d="M22 18c0-2.5-2-4.5-5-4.5"/></svg>;
    case 'doc':       return <svg {...p}><path d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M14 3v5h5"/></svg>;
    case 'meeting':   return <svg {...p}><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/></svg>;
    case 'spark':     return <svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg>;
    case 'sparkle':   return <svg {...p}><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z"/></svg>;
    case 'flame':     return <svg {...p}><path d="M12 3s5 5 5 10a5 5 0 11-10 0c0-2 1-3 1-5 0 2 2 3 4 3 0-3-3-4 0-8z"/></svg>;
    case 'clock':     return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case 'alert':     return <svg {...p}><path d="M12 3l10 17H2L12 3z"/><path d="M12 10v5M12 18v.5" strokeWidth={strokeWidth * 1.2}/></svg>;
    case 'plus':      return <svg {...p}><path d="M12 5v14M5 12h14"/></svg>;
    case 'bell':      return <svg {...p}><path d="M6 16V10a6 6 0 1112 0v6l2 2H4l2-2z"/><path d="M10 20a2 2 0 004 0"/></svg>;
    case 'filter':    return <svg {...p}><path d="M4 5h16l-6 8v6l-4-2v-4L4 5z"/></svg>;
    case 'grip':      return <svg {...p}><circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/></svg>;
    case 'trending':  return <svg {...p}><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>;
    case 'chevron-r': return <svg {...p}><path d="M9 6l6 6-6 6"/></svg>;
    case 'chevron-d': return <svg {...p}><path d="M6 9l6 6 6-6"/></svg>;
    case 'building':  return <svg {...p}><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2"/></svg>;
    case 'layers':    return <svg {...p}><path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 18l9 5 9-5"/></svg>;
    case 'target':    return <svg {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill={color}/></svg>;
    case 'home':      return <svg {...p}><path d="M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1V11z"/></svg>;
    case 'pipeline':  return <svg {...p}><rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="8" width="5" height="12" rx="1"/><rect x="17" y="12" width="5" height="8" rx="1"/></svg>;
    case 'menu':      return <svg {...p}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
    case 'more':      return <svg {...p}><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>;
    case 'mic':       return <svg {...p}><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>;
    case 'snooze':    return <svg {...p}><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 3l-4 3M15 3l4 3"/></svg>;
    case 'inbox':     return <svg {...p}><path d="M3 13l3-8h12l3 8v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6z"/><path d="M3 13h5l1 2h6l1-2h5"/></svg>;
    case 'grid':      return <svg {...p}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>;
    case 'focus':     return <svg {...p}><path d="M3 9V5a2 2 0 012-2h4M21 9V5a2 2 0 00-2-2h-4M3 15v4a2 2 0 002 2h4M21 15v4a2 2 0 01-2 2h-4"/><circle cx="12" cy="12" r="3"/></svg>;
    case 'repeat':    return <svg {...p}><path d="M17 3l4 4-4 4M21 7H7a4 4 0 00-4 4v2M7 21l-4-4 4-4M3 17h14a4 4 0 004-4v-2"/></svg>;
    default: return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Avatar — circular avatar with initials + deterministic warm color from name.
// Props: name (string, required), size=28, textSize
// ─────────────────────────────────────────────────────────────────────────────
const _initials = (name) =>
  name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

const _avatarColor = (name) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
};

export const Avatar = ({ name, size = 28, textSize }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%',
    background: _avatarColor(name), color: '#fef4e6',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: textSize || Math.round(size * 0.38),
    fontWeight: 600, letterSpacing: 0.3, flexShrink: 0,
    fontFamily: T.sans,
  }}>
    {_initials(name)}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Ring — circular SVG progress ring. Used for quota attainment and deal health.
// Props: value=0, max=100, size=72, stroke=6, color, trackColor, labelColor, children
// ─────────────────────────────────────────────────────────────────────────────
export const Ring = ({
  value = 0, max = 100, size = 72, stroke = 6,
  color = T.ink, trackColor = T.borderStrong,
  children, labelColor,
}) => {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r}
          stroke={trackColor} strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: labelColor || color,
        fontWeight: 600,
        fontSize: Math.round(size * 0.22),
        fontFamily: T.sans,
      }}>
        {children}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Button — primary ink-dark action button. Used for all non-destructive actions.
// Red delete buttons use the `variant="danger"` prop.
// Props: children, icon, onClick, size='sm'|'md', variant='primary'|'danger'|'ghost'
// ─────────────────────────────────────────────────────────────────────────────
export const Button = ({ children, icon, onClick, size = 'sm', variant = 'primary', disabled, style }) => {
  const pad = size === 'sm' ? '6px 12px' : '9px 16px';
  const fs  = size === 'sm' ? 12 : 13;

  const variants = {
    primary: { background: T.ink, color: T.surface, border: 'none' },
    danger:  { background: T.danger, color: '#ffffff', border: 'none' },
    ghost:   { background: 'transparent', color: T.ink, border: `1px solid ${T.border}` },
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: pad,
        ...variants[variant],
        fontSize: fs, fontWeight: variant === 'primary' ? 600 : 500,
        borderRadius: T.radiusSm, cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: T.sans, whiteSpace: 'nowrap',
        opacity: disabled ? 0.5 : 1,
        transition: 'opacity 120ms',
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={fs - 1} color={variants[variant].color} />}
      {children}
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// GhostBtn — bordered transparent button. Used for secondary actions.
// Has hover-fill behaviour (surface2).
// Props: children, icon, onClick, size='sm'|'md'
// ─────────────────────────────────────────────────────────────────────────────
export const GhostBtn = ({ children, icon, onClick, size = 'sm', style }) => {
  const [h, hb] = useHover();
  const pad = size === 'sm' ? '5px 10px' : '8px 14px';
  const fs  = size === 'sm' ? 12 : 13;
  return (
    <button
      {...hb}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: pad,
        background: h ? T.surface2 : 'transparent',
        border: `1px solid ${T.border}`, color: T.ink,
        fontSize: fs, fontWeight: 500,
        borderRadius: T.radiusSm, cursor: 'pointer',
        fontFamily: T.sans, whiteSpace: 'nowrap',
        transition: 'background 120ms',
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={fs - 1} color={T.inkMid} />}
      {children}
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Pill — toggle chip used for view switchers, filter chips, smart presets.
// Active state: ink background + cream text. Inactive: white + border.
// Props: label, active, onClick, icon, count
// ─────────────────────────────────────────────────────────────────────────────
export const Pill = ({ label, active, onClick, icon, count }) => (
  <button
    onClick={onClick}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 12px',
      border: `1px solid ${active ? T.ink : T.border}`,
      background: active ? T.ink : T.surface,
      color: active ? T.surface : T.ink,
      fontSize: 12, fontWeight: 500,
      borderRadius: T.radiusSm, cursor: 'pointer',
      fontFamily: T.sans, transition: 'all 120ms',
    }}
  >
    {icon && <Icon name={icon} size={12} color={active ? T.surface : T.inkMid} />}
    {label}
    {count != null && (
      <span style={{
        background: active ? 'rgba(255,255,255,0.18)' : T.surface2,
        padding: '1px 6px', borderRadius: 8,
        fontSize: 10, fontWeight: 600,
        color: active ? T.surface : T.inkMuted,
      }}>
        {count}
      </span>
    )}
  </button>
);

// ─────────────────────────────────────────────────────────────────────────────
// Field — form field wrapper with label, hint, and error message.
// Props: label, children, required, hint, errorMsg, width
// ─────────────────────────────────────────────────────────────────────────────
export const Field = ({ label, children, required, hint, errorMsg, width }) => (
  <div style={{ width }}>
    {label && (
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 5,
      }}>
        <label style={{
          fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase',
          color: T.inkMid, fontWeight: 600, fontFamily: T.sans,
        }}>
          {label}
          {required && <span style={{ color: T.danger, marginLeft: 3 }}>*</span>}
        </label>
        {hint && (
          <span style={{ fontSize: 10, color: T.inkMuted, fontFamily: T.sans }}>{hint}</span>
        )}
      </div>
    )}
    {children}
    {errorMsg && (
      <div style={{ fontSize: 10.5, color: T.danger, marginTop: 3, fontFamily: T.sans }}>
        {errorMsg}
      </div>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// EngDot — engagement level dot (hot/warm/cool/stale). Used on contact cards.
// Maps last-touch recency to a color signal.
// Props: level ('hot'|'warm'|'cool'|'stale'), size=8
// ─────────────────────────────────────────────────────────────────────────────
export const EngDot = ({ level, size = 8 }) => (
  <span style={{
    display: 'inline-block',
    width: size, height: size, borderRadius: '50%',
    background: ENG_COLOR[level] || T.inkMuted,
    flexShrink: 0,
  }} />
);

// ─────────────────────────────────────────────────────────────────────────────
// RoleBadge — contact role chip (Champion, Economic Buyer, Technical, User).
// Props: role (string)
// ─────────────────────────────────────────────────────────────────────────────
export const RoleBadge = ({ role }) => (
  <span style={{
    fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 700,
    color: T.goldInk,
    background: 'rgba(200, 185, 154, 0.2)',
    padding: '2px 6px', borderRadius: 2,
    fontFamily: T.sans,
  }}>
    {role}
  </span>
);

// ─────────────────────────────────────────────────────────────────────────────
// SignalChip — AI signal pill. Three states: positive, neutral, risk.
// Props: kind ('positive'|'neutral'|'risk'), text
// ─────────────────────────────────────────────────────────────────────────────
const SIGNAL_STYLES = {
  positive: {
    bg:       'rgba(77, 107, 61, 0.09)',
    border:   'rgba(77, 107, 61, 0.3)',
    icon:     T.ok,
    iconName: 'check',
  },
  neutral: {
    bg:       T.surface2,
    border:   T.border,
    icon:     T.inkMid,
    iconName: 'clock',
  },
  risk: {
    bg:       'rgba(156, 58, 46, 0.07)',
    border:   'rgba(156, 58, 46, 0.3)',
    icon:     T.danger,
    iconName: 'alert',
  },
};

export const SignalChip = ({ kind, text }) => {
  const c = SIGNAL_STYLES[kind] || SIGNAL_STYLES.neutral;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '8px 10px',
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: T.radiusSm,
    }}>
      <Icon name={c.iconName} size={12} color={c.icon} style={{ marginTop: 2, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: T.ink, lineHeight: 1.4, fontFamily: T.sans }}>
        {text}
      </span>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// StageRibbon — horizontal stage progress bar with chevron arrows.
// Filters out Closed Won / Closed Lost (shown separately).
// Props: stages (string[]), current (string), onStage (fn), compact=false
// ─────────────────────────────────────────────────────────────────────────────
export const StageRibbon = ({ stages, current, onStage, compact = false }) => {
  const curIdx = stages.indexOf(current);
  const visible = stages.filter(s => !s.startsWith('Closed'));
  return (
    <div style={{ display: 'flex', gap: 0, width: '100%' }}>
      {visible.map((s, i) => {
        const done = i < curIdx;
        const cur  = i === curIdx;
        const bg   = cur ? T.ink : done ? T.goldInk : T.surface2;
        const fg   = cur ? T.surface : done ? T.surface : T.inkMuted;
        const clip = i === 0
          ? 'polygon(0 0, 100% 0, calc(100% - 10px) 50%, 100% 100%, 0 100%)'
          : 'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%)';
        return (
          <div
            key={s}
            onClick={() => onStage && onStage(s)}
            style={{
              flex: 1,
              padding: compact ? '7px 18px 7px 22px' : '10px 20px 10px 26px',
              marginLeft: i === 0 ? 0 : -8,
              background: bg, color: fg,
              clipPath: clip,
              fontSize: compact ? 11 : 12,
              fontWeight: cur ? 700 : 500,
              letterSpacing: 0.2,
              textAlign: 'center',
              cursor: onStage ? 'pointer' : 'default',
              whiteSpace: 'nowrap',
              fontFamily: T.sans,
              transition: 'background 120ms',
            }}
          >
            {s}
          </div>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SectionLabel — small-caps section heading. Used inside modals and panels.
// Props: children, color
// ─────────────────────────────────────────────────────────────────────────────
export const SectionLabel = ({ children, color }) => (
  <div style={{
    fontSize: 10, letterSpacing: 1.1, textTransform: 'uppercase', fontWeight: 700,
    color: color || T.inkMuted, marginBottom: 8, fontFamily: T.sans,
  }}>
    {children}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// PageHeader — editorial italic page title + context subtitle.
// Used at the top of every tab body below the AppHeader.
// Props: title (string), subtitle (string|node), right (node)
// ─────────────────────────────────────────────────────────────────────────────
export const PageHeader = ({ title, subtitle, right }) => (
  <div style={{
    padding: '20px 32px 14px',
    display: 'flex', alignItems: 'flex-end', gap: 24,
  }}>
    <div style={{ flex: 1 }}>
      <div style={{
        fontSize: 28, fontFamily: T.serif, fontStyle: 'italic',
        fontWeight: 300, letterSpacing: -0.8, color: T.ink, lineHeight: 1, marginBottom: 6,
      }}>
        {title}
      </div>
      <div style={{ fontSize: 12, color: T.inkMuted, lineHeight: 1.4, fontFamily: T.sans }}>
        {subtitle}
      </div>
    </div>
    {right}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// AppHeader — shared navigation bar. Ink-dark, gold wordmark, gold active underline.
// Props: active (string matching one of the nav items)
// ─────────────────────────────────────────────────────────────────────────────
const NAV_ITEMS = ['Home', 'Pipeline', 'Accounts', 'Tasks', 'Reports'];

export const AppHeader = ({ active = 'Home', currentUser = 'Jamie Chen' }) => (
  <div style={{
    height: 48, background: T.surfaceInk, color: T.surfaceInkFg,
    display: 'flex', alignItems: 'center', padding: '0 20px', gap: 20,
    flexShrink: 0, fontFamily: T.sans,
  }}>
    <div style={{
      fontSize: 14, fontWeight: 700, letterSpacing: 1.2, color: T.gold,
    }}>
      ACCELEREP
    </div>
    <div style={{ display: 'flex', gap: 18, marginLeft: 20 }}>
      {NAV_ITEMS.map(t => (
        <div key={t} style={{
          fontSize: 13,
          fontWeight: t === active ? 600 : 400,
          color: t === active ? '#fbf8f3' : 'rgba(230,221,208,0.6)',
          paddingBottom: 2,
          borderBottom: t === active ? `2px solid ${T.gold}` : '2px solid transparent',
        }}>
          {t}
        </div>
      ))}
    </div>
    <div style={{ flex: 1 }} />
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'rgba(255,255,255,0.06)', padding: '5px 12px',
      borderRadius: T.radiusSm, width: 280,
    }}>
      <Icon name="search" size={14} color="rgba(230,221,208,0.5)" />
      <span style={{ fontSize: 12, color: 'rgba(230,221,208,0.5)' }}>
        Search accounts, deals, contacts
      </span>
      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(230,221,208,0.4)', fontFamily: 'monospace' }}>
        ⌘K
      </span>
    </div>
    <Icon name="bell" size={16} color="rgba(230,221,208,0.7)" />
    <Avatar name={currentUser} size={28} />
  </div>
);
