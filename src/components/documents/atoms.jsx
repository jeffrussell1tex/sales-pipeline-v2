// src/components/documents/atoms.jsx
// ════════════════════════════════════════════════════════════════════════════
// Shared primitives for the Documents feature. The design tokens come from
// src/tokens.js (one copy for the whole app since 14 Sep 2026) and are
// re-exported here so every Documents surface keeps its `import { T } from
// './atoms'`. Pure, prop-driven, module-scope components only (no inline
// sub-components).
// ════════════════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { T } from '../../tokens.js';
import { parseLocalDate } from '../../utils/dateLocal.js';
import { peopleMatching } from '../../utils/documentPeople.js';
import { searchKey } from '../../utils/searchMatch.js';
export { T };   // the Documents surfaces import T from here

// ── Formatters ───────────────────────────────────────────────────────────────
export function fmtSize(kb) {
    const n = Number(kb) || 0;
    if (n < 1024) return `${n} KB`;
    return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} MB`;
}

// A yyyy-mm-dd day — a task's due date, an activity's date — is the local day, read at
// local noon; a timestamp is an instant, read as-is (dateLocal.js parseLocalDate). Read as
// UTC midnight, a day showed a day early west of Greenwich (state §0.181).
export function fmtDate(d) {
    const dt = parseLocalDate(d);
    if (!dt) return '';
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function fmtDateLong(d) {
    const dt = parseLocalDate(d);
    if (!dt) return '';
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
export const fileMeta = (ext) => FILE_META[String(ext || '').toLowerCase()] || { label: (ext || 'FILE').toUpperCase().slice(0, 4), color: T.inkMid, bg: T.bg };

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
export const categoryStyle = (cat) => CATEGORY_STYLE[cat] || { color: T.inkMid, bg: T.bg };

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
                    style={{ background: 'none', border: 'none', color: T.inkMuted, cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0, flexShrink: 0 }}
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
                        <div style={{ fontSize: 10, color: T.inkMuted, marginTop: 1 }}>{o.hint}</div>
                    </button>
                );
            })}
        </div>
    );
}

// ── People a Specific document is shared with (state §0.183) ─────────────────
// The deal's Contacts field's way (Jeff: "the same style we use for attaching contacts to
// deals … A type ahead multi select instead of a prebuilt list"): the chosen as chips with
// an ×, and a search that offers the members whose names match — a list of the whole org
// would not do for a large one. `people` from sharablePeople, `chosen` their ids, `nameOf`
// a chip's name (a person no longer offered still shows).
export function PeopleChooser({ people = [], chosen = [], onToggle, nameOf }) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const label = nameOf || ((id) => (people.find((p) => p.id === id) || {}).name || 'Former member');
    // The shared matcher (state §0.194): fifty, best first, the rest announced at the list's
    // foot; the list opens for a word typed, not for punctuation alone.
    const { shown, more } = peopleMatching(people, query, chosen);
    const add = (id) => { if (onToggle) onToggle(id); setQuery(''); setOpen(false); };
    return (
        <div style={{ marginTop: 8 }}>
            {chosen.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {chosen.map((id) => (
                        <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '3px 8px', fontSize: 12, color: T.ink, fontFamily: T.sans }}>
                            {label(id)}
                            <button type="button" onClick={() => onToggle && onToggle(id)} title={`Remove ${label(id)}`}
                                style={{ background: 'none', border: 'none', color: T.inkMuted, cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                        </span>
                    ))}
                </div>
            )}
            <div style={{ position: 'relative' }}>
                <input type="text" value={query} placeholder="Search people to share with…" autoComplete="off"
                    onChange={(e) => { setQuery(e.target.value); setOpen(!!searchKey(e.target.value)); }}
                    onFocus={() => setOpen(!!searchKey(query))}
                    onBlur={() => setTimeout(() => setOpen(false), 200)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && shown[0]) { e.preventDefault(); add(shown[0].id); } }}
                    style={{ width: '100%', padding: '7px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, fontFamily: T.sans, background: T.surface, color: T.ink, boxSizing: 'border-box', outline: 'none' }} />
                {open && (
                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: '100%', marginBottom: 3, background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, maxHeight: 200, overflowY: 'auto', zIndex: 5, boxShadow: '0 4px 12px rgba(42,38,34,0.12)' }}>
                        {shown.length === 0 ? (
                            <div style={{ padding: '8px 10px', fontSize: 12, color: T.inkMuted, fontStyle: 'italic', fontFamily: T.sans }}>No one in this organization matches.</div>
                        ) : shown.map((p) => (
                            <div key={p.id} onMouseDown={(e) => e.preventDefault()} onClick={() => add(p.id)}
                                style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: `1px solid ${T.border}`, fontWeight: 600, fontSize: 13, color: T.ink, fontFamily: T.sans }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = T.surface2; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                                {p.name}
                            </div>
                        ))}
                        {more > 0 && <div onMouseDown={e => e.preventDefault()} style={{ position: 'sticky', bottom: 0, background: T.surface, padding: '6px 10px', fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>{more} more — keep typing</div>}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Linked-to chip row (compact, with +N overflow) ───────────────────────────
export function LinkedToRow({ links = [], max = 2 }) {
    if (!links.length) return <span style={{ fontSize: 12, color: T.inkMuted, fontStyle: 'italic' }}>—</span>;
    const shown = links.slice(0, max);
    const extra = links.length - shown.length;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap', overflow: 'hidden' }}>
            {shown.map((l) => <LinkChip key={l.id || `${l.type}:${l.recordId}`} link={l} />)}
            {extra > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: T.inkMuted, flexShrink: 0 }}>+{extra}</span>}
        </div>
    );
}
