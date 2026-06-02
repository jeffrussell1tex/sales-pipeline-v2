// settings/shared/tokens.js — design tokens + shared colour/status maps

// ── Design tokens ────────────────────────────────────────────
export const T = {
    bg: '#f0ece4', surface: '#fbf8f3', surface2: '#f5efe3',
    border: '#e6ddd0', borderStrong: '#d4c8b4',
    ink: '#2a2622', inkMid: '#5a544c', inkMuted: '#8a8378',
    gold: '#c8b99a', goldInk: '#7a6a48',
    danger: '#9c3a2e', warn: '#b87333', ok: '#4d6b3d', info: '#3a5a7a',
    sans: '"Plus Jakarta Sans", system-ui, sans-serif',
    serif: 'Georgia, serif',
    r: 3,
};

export const eb = (color) => ({ fontSize: 11, fontWeight: 700, color: color || T.inkMuted, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: T.sans });

// ── Category colours ─────────────────────────────────────────
export const CATEGORY_TINT = {
    'Profile & Account': { bg: '#f0f4ea', fg: '#4d6b3d' },
    'Company':           { bg: '#ede7db', fg: '#7a6a48' },
    'Sales process':     { bg: '#ece7f2', fg: '#5e4e7a' },
    'Quoting':           { bg: '#f0ece1', fg: '#8a6a3a' },
    'People & Teams':    { bg: '#e6eef0', fg: '#3a5a6a' },
    'Dispatch':          { bg: '#e8ede4', fg: '#4d6b3d' },
    'Integrations':      { bg: '#eaf0e6', fg: '#4d6b3d' },
    'Security':          { bg: '#f4ebe4', fg: '#9c5a3a' },
    'Data':              { bg: '#ede7db', fg: '#7a6a48' },
};

// ── Status chip ───────────────────────────────────────────────
export const STATUS_STYLES = {
    ok:        { bg: 'rgba(77,107,61,0.10)',   fg: '#4d6b3d', icon: '✓' },
    connected: { bg: 'rgba(77,107,61,0.10)',   fg: '#4d6b3d', icon: '●' },
    partial:   { bg: 'rgba(184,115,51,0.10)',  fg: '#b87333', icon: '◐' },
    warning:   { bg: 'rgba(156,58,46,0.10)',   fg: '#9c3a2e', icon: '⚠' },
    none:      { bg: 'rgba(138,131,120,0.12)', fg: '#5a544c', icon: '○' },
    linked:    { bg: 'rgba(58,90,122,0.10)',   fg: '#3a5a7a', icon: '↗' },
    fail:      { bg: 'rgba(156,58,46,0.10)',   fg: '#9c3a2e', icon: '✕' },
};
