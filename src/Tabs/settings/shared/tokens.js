// settings/shared/tokens.js — the Settings panels' import point for the design
// tokens (re-exported from src/tokens.js — ONE copy for the whole app since
// 14 Sep 2026) + the shared colour/status maps below.
import { T } from '../../../tokens.js';
export { T };


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
