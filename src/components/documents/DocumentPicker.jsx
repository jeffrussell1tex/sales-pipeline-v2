// src/components/documents/DocumentPicker.jsx
// "Link existing" picker: choose documents from the library to attach to the
// current record. Prop-driven (rendered locally by RecordDocuments), reads the
// library from useApp(). Centered modal above the host rail.

import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../AppContext';
import { T, fmtSize, fmtDate, FileTypeBadge, CategoryPill } from './atoms';

export default function DocumentPicker({ open, excludeIds = [], onConfirm, onClose }) {
    const { documents = [] } = useApp();
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState({}); // id -> doc

    useEffect(() => { if (open) { setSearch(''); setSelected({}); } }, [open]);

    const exclude = useMemo(() => new Set(excludeIds), [excludeIds]);
    const rows = useMemo(() => {
        const q = search.trim().toLowerCase();
        return documents.filter((d) => !exclude.has(d.id) && (!q || (d.name || '').toLowerCase().includes(q)));
    }, [documents, exclude, search]);

    if (!open) return null;

    const count = Object.keys(selected).length;
    const toggle = (doc) => setSelected((prev) => {
        const next = { ...prev };
        if (next[doc.id]) delete next[doc.id]; else next[doc.id] = doc;
        return next;
    });

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 11000, background: 'rgba(42,38,34,0.35)' }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(520px, calc(100vw - 32px))', maxHeight: '82vh', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: '0 24px 64px rgba(42,38,34,0.28)', zIndex: 11001, display: 'flex', flexDirection: 'column', fontFamily: T.sans, overflow: 'hidden' }}>
                <div style={{ padding: '16px 18px 12px', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>Link an existing document</div>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.ink3, fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 2 }}>×</button>
                    </div>
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents…" autoFocus
                        style={{ width: '100%', marginTop: 12, padding: '8px 12px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface2, color: T.ink, fontFamily: T.sans, boxSizing: 'border-box', outline: 'none' }} />
                </div>
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, borderTop: `1px solid ${T.border}` }}>
                    {rows.length === 0 ? (
                        <div style={{ padding: '32px 18px', textAlign: 'center', fontSize: 13, color: T.ink3 }}>No other documents available.</div>
                    ) : rows.map((doc) => {
                        const on = !!selected[doc.id];
                        return (
                            <div key={doc.id} onClick={() => toggle(doc)}
                                style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 18px', cursor: 'pointer', background: on ? 'rgba(200,185,154,0.1)' : 'transparent' }}>
                                <FileTypeBadge ext={doc.ext} size={28} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 1 }}>
                                        <CategoryPill category={doc.category} />
                                        <span style={{ fontSize: 11, color: T.ink3 }}>{fmtSize(doc.sizeKb)} · {fmtDate(doc.modifiedAt)}</span>
                                    </div>
                                </div>
                                <div style={{ width: 18, height: 18, borderRadius: T.r, border: `1.5px solid ${on ? T.ink : T.border}`, background: on ? T.ink : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    {on && <span style={{ color: '#f5f1eb', fontSize: 12, lineHeight: 1 }}>✓</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: `1px solid ${T.border}`, background: T.surface2, flexShrink: 0 }}>
                    <button onClick={onClose} style={{ background: 'none', border: `1px solid ${T.border}`, color: T.ink2, borderRadius: T.r, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>Cancel</button>
                    <button onClick={() => onConfirm && onConfirm(Object.values(selected))} disabled={count === 0}
                        style={{ background: T.ink, color: '#f5f1eb', border: 'none', borderRadius: T.r, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: count === 0 ? 'default' : 'pointer', fontFamily: T.sans, opacity: count === 0 ? 0.5 : 1 }}>
                        Link {count || ''} document{count === 1 ? '' : 's'}
                    </button>
                </div>
            </div>
        </>
    );
}
