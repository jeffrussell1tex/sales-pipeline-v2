// src/components/documents/atoms.jsx
// ════════════════════════════════════════════════════════════════════════════
// Shared primitives for the Documents feature. Per the coding guide, non-settings
// areas define `T` locally; rather than copy the token object into five files,
// this module is the single source for the feature (same values as the rails'
// local T) and is imported by every Documents surface. Pure, prop-driven,
// module-scope components only (no inline sub-components).
// ════════════════════════════════════════════════════════════════════════════

import React from 'react';

// ── Design tokens (identical palette to the rails' local T) ──────────────────
export const T = {
    sans:     '"Plus Jakarta Sans", system-ui, sans-serif',
    surface:  '#fbf8f3',
    surface2: '#f5efe3',
    surface3: '#f0ece4',
    border:   '#e6ddd0',
    ink:      '#2a2622',
    ink2:     '#5a544c',
    ink3:     '#8a8378',
    gold:     '#c8b99a',
    danger:   '#9c3a2e',
    info:     '#3a5a7a',
    good:     '#4d6b3d',
    r:        3,
};

// ── Formatters ───────────────────────────────────────────────────────────────
export function fmtSize(kb) {
    const n = Number(kb) || 0;
    if (n < 1024) return `${n} KB`;
    return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} MB`;
}

export function fmtDate(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt)) return '';
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function fmtDateLong(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt)) return '';
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export const baseName = (filename = '') => filename.replace(/\.[^.]+$/, '');

// ── File-type badge meta ─────────────────────────────────────────────────────
const FILE_META = {
    pdf:  { label: 'PDF', color: '#9c3a2e', bg: '#f7e9e6' },
    doc:  { label: 'DOC', color: '#3a5a7a', bg: '#e8eef3' },
    docx: { label: 'DOC', color: '#3a5a7a', bg: '#e8eef3' },
    xls:  { label: 'XLS', color: '#4d6b3d', bg: '#eaf0e6' },
    xlsx: { label: 'XLS', color: '#4d6b3d', bg: '#eaf0e6' },
    ppt:  { label: 'PPT', color: '#a85a2e', bg: '#f6ebe2' },
    pptx: { label: 'PPT', color: '#a85a2e', bg: '#f6ebe2' },
    png:  { label: 'IMG', color: '#6b5a3d', bg: '#f0ece4' },
    jpg:  { label: 'IMG', color: '#6b5a3d', bg: '#f0ece4' },
    jpeg: { label: 'IMG', color: '#6b5a3d', bg: '#f0ece4' },
    gif:  { label: 'IMG', color: '#6b5a3d', bg: '#f0ece4' },
    webp: { label: 'IMG', color: '#6b5a3d', bg: '#f0ece4' },
    csv:  { label: 'CSV', color: '#4d6b3d', bg: '#eaf0e6' },
    txt:  { label: 'TXT', color: '#5a544c', bg: '#f0ece4' },
};
export const fileMeta = (ext) => FILE_META[String(ext || '').toLowerCase()] || { label: (ext || 'FILE').toUpperCase().slice(0, 4), color: T.ink2, bg: T.surface3 };

export function FileTypeBadge({ ext, size = 36 }) {
    const m = fileMeta(ext);
    return (
        <div style={{
            width: size, height: size, borderRadius: T.r, background: m.bg, color: m.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            fontSize: size <= 28 ? 8 : 9, fontWeight: 800, letterSpacing: '0.04em', fontFamily: T.sans,
        }}>{m.label}</div>
    );
}

// ── Category pill ────────────────────────────────────────────────────────────
export const CATEGORIES = ['Contract', 'NDA', 'SOW', 'Invoice', 'Quote', 'Spec sheet', 'Note'];
const CATEGORY_STYLE = {
    'Contract':   { color: '#9c3a2e', bg: '#f7e9e6' },
    'NDA':        { color: '#a85a2e', bg: '#f6ebe2' },
    'SOW':        { color: '#3a5a7a', bg: '#e8eef3' },
    'Invoice':    { color: '#6b3d4d', bg: '#f3e8ec' },
    'Quote':      { color: '#4d6b3d', bg: '#eaf0e6' },
    'Spec sheet': { color: '#5a544c', bg: '#f0ece4' },
    'Note':       { color: '#8a8378', bg: '#f0ece4' },
};
export const categoryStyle = (cat) => CATEGORY_STYLE[cat] || { color: T.ink2, bg: T.surface3 };

export function CategoryPill({ category }) {
    if (!category) return null;
    const s = categoryStyle(category);
    return (
        <span style={{
            display: 'inline-block', fontSize: 10, fontWeight: 700, color: s.color, background: s.bg,
            borderRadius: 999, padding: '2px 9px', letterSpacing: '0.04em', textTransform: 'uppercase',
            fontFamily: T.sans, whiteSpace: 'nowrap',
        }}>{category}</span>
    );
}

// ── Entity (record-type) meta + glyph ────────────────────────────────────────
export const ENTITY_META = {
    account:     { label: 'Account',     color: '#3a5a7a' },
    contact:     { label: 'Contact',     color: '#6b3d4d' },
    opportunity: { label: 'Opportunity', color: '#a85a2e' },
    task:        { label: 'Task',        color: '#4d6b3d' },
    activity:    { label: 'Activity',    color: '#5a544c' },
};
const ENTITY_PATHS = {
    account:     'M3 21V5l7-2v18M14 21V9l7 2v10M3 21h18M6 8h1M6 11h1M6 14h1',
    contact:     'M12 12a4 4 0 100-8 4 4 0 000 8zM4 20a8 8 0 0116 0',
    opportunity: 'M12 12m-9 0a9 9 0 1018 0 9 9 0 10-18 0M12 12m-4.5 0a4.5 4.5 0 109 0 4.5 4.5 0 10-9 0M12 12h.01',
    task:        'M5 12l5 5L20 6',
    activity:    'M13 2L3 14h7v8l10-12h-7z',
};
export function EntityGlyph({ type, size = 14, color }) {
    const meta = ENTITY_META[type] || ENTITY_META.account;
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
             stroke={color || meta.color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
             style={{ flexShrink: 0 }}>
            <path d={ENTITY_PATHS[type] || ENTITY_PATHS.account} />
        </svg>
    );
}

// ── Link chip (a document's association to a record) ─────────────────────────
export function LinkChip({ link, onRemove }) {
    const meta = ENTITY_META[link.type] || ENTITY_META.account;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 999, padding: onRemove ? '3px 6px 3px 9px' : '3px 10px', fontSize: 11, color: T.ink,
            fontFamily: T.sans, maxWidth: 220,
        }}>
            <EntityGlyph type={link.type} size={12} color={meta.color} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.name || link.recordId}</span>
            {onRemove && (
                <button onClick={(e) => { e.stopPropagation(); onRemove(link); }}
                    style={{ background: 'none', border: 'none', color: T.ink3, cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0, flexShrink: 0 }}
                    title="Remove link">×</button>
            )}
        </span>
    );
}

// ── Visibility control (Private | Team | Specific) ───────────────────────────
export const VISIBILITY_OPTS = [
    { key: 'private',  label: 'Private',  hint: 'Only you' },
    { key: 'team',     label: 'Team',     hint: 'Everyone on your team' },
    { key: 'specific', label: 'Specific', hint: 'Chosen people only' },
];
export function VisibilityControl({ value = 'team', onChange, disabled }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {VISIBILITY_OPTS.map((o) => {
                const active = value === o.key;
                return (
                    <button key={o.key} disabled={disabled}
                        onClick={() => !disabled && onChange && onChange(o.key)}
                        style={{
                            textAlign: 'left', padding: '8px 10px', borderRadius: T.r, cursor: disabled ? 'default' : 'pointer',
                            border: `1px solid ${active ? T.gold : T.border}`,
                            background: active ? 'rgba(200,185,154,0.14)' : T.surface,
                            fontFamily: T.sans,
                        }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{o.label}</div>
                        <div style={{ fontSize: 10, color: T.ink3, marginTop: 1 }}>{o.hint}</div>
                    </button>
                );
            })}
        </div>
    );
}

// ── Linked-to chip row (compact, with +N overflow) ───────────────────────────
export function LinkedToRow({ links = [], max = 2 }) {
    if (!links.length) return <span style={{ fontSize: 12, color: T.ink3, fontStyle: 'italic' }}>—</span>;
    const shown = links.slice(0, max);
    const extra = links.length - shown.length;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap', overflow: 'hidden' }}>
            {shown.map((l) => <LinkChip key={l.id || `${l.type}:${l.recordId}`} link={l} />)}
            {extra > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: T.ink3, flexShrink: 0 }}>+{extra}</span>}
        </div>
    );
}
