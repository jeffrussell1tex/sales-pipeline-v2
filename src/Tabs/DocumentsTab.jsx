// src/Tabs/DocumentsTab.jsx
// Global Documents library (handoff artboard 6). Reads everything from useApp()
// like the other tabs; opens the detail rail / upload rail via context setters.

import React, { useMemo, useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useApp } from '../AppContext';
import {
    T, fmtSize, fmtDate, fileMeta, FileTypeBadge, CategoryPill, LinkedToRow, CATEGORIES,
} from '../components/documents/atoms';

const COLS = '1fr 120px 1.2fr 150px 92px 86px 34px';

// ── Row kebab menu (portaled to body + position:fixed, per the popover rule) ──
function RowMenu({ anchor, onClose, onPreview, onDownload, onOpen, onDelete }) {
    const ref = useRef(null);
    useEffect(() => {
        const close = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
        window.addEventListener('mousedown', close);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', onClose);
        return () => {
            window.removeEventListener('mousedown', close);
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', onClose);
        };
    }, [onClose]);
    if (!anchor) return null;
    const top = Math.min(anchor.bottom + 4, window.innerHeight - 180);
    const left = Math.min(anchor.right - 150, window.innerWidth - 160);
    const item = { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 12px', fontSize: 12, color: T.ink, cursor: 'pointer', fontFamily: T.sans };
    return ReactDOM.createPortal(
        <div ref={ref} style={{ position: 'fixed', top, left, width: 150, background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, boxShadow: '0 8px 24px rgba(42,38,34,0.16)', zIndex: 11050, overflow: 'hidden', padding: '4px 0' }}>
            <button style={item} onClick={onPreview}>Preview</button>
            <button style={item} onClick={onDownload}>Download</button>
            <button style={item} onClick={onOpen}>Open details</button>
            <div style={{ height: 1, background: T.border, margin: '4px 0' }} />
            <button style={{ ...item, color: T.danger }} onClick={onDelete}>Delete</button>
        </div>,
        document.body,
    );
}

function DocRow({ doc, onOpen, onMenu }) {
    const [hover, setHover] = useState(false);
    const m = fileMeta(doc.ext);
    return (
        <div
            onClick={() => onOpen(doc)}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
                display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center',
                padding: '11px 16px', borderBottom: `1px solid ${T.border}`, cursor: 'pointer',
                background: hover ? 'rgba(200,185,154,0.07)' : 'transparent',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                <FileTypeBadge ext={doc.ext} size={34} />
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.name}
                        {doc.version > 1 && <span style={{ fontSize: 11, color: T.ink3, fontWeight: 600, marginLeft: 6 }}>v{doc.version}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>{m.label} · .{(doc.ext || '').toLowerCase()}</div>
                </div>
            </div>
            <div><CategoryPill category={doc.category} /></div>
            <div style={{ minWidth: 0 }}><LinkedToRow links={doc.links} max={2} /></div>
            <div style={{ fontSize: 12, color: T.ink2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.ownerName || '—'}</div>
            <div style={{ fontSize: 12, color: T.ink2 }}>{fmtDate(doc.modifiedAt)}</div>
            <div style={{ fontSize: 12, color: T.ink2 }}>{fmtSize(doc.sizeKb)}</div>
            <button
                onClick={(e) => { e.stopPropagation(); onMenu(doc, e.currentTarget.getBoundingClientRect()); }}
                style={{ background: 'none', border: 'none', color: T.ink3, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '4px 6px', borderRadius: T.r, opacity: hover ? 1 : 0.5 }}
                title="More">⋯</button>
        </div>
    );
}

function Select({ value, onChange, children }) {
    return (
        <select value={value} onChange={(e) => onChange(e.target.value)}
            style={{ padding: '7px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12, background: T.surface, color: T.ink, fontFamily: T.sans, cursor: 'pointer', outline: 'none' }}>
            {children}
        </select>
    );
}

export default function DocumentsTab() {
    const {
        documents = [], docsLoading,
        setDocumentRailId, setShowUploadRail, setUploadRailContext,
        downloadDoc, previewDoc, removeDocument, showConfirm,
    } = useApp();

    const [search, setSearch] = useState('');
    const [cat, setCat] = useState('all');
    const [type, setType] = useState('all');
    const [owner, setOwner] = useState('all');
    const [menu, setMenu] = useState(null); // { doc, anchor }

    const types = useMemo(() => [...new Set(documents.map((d) => (d.ext || '').toLowerCase()).filter(Boolean))].sort(), [documents]);
    const owners = useMemo(() => [...new Set(documents.map((d) => d.ownerName).filter(Boolean))].sort(), [documents]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return documents.filter((d) => {
            if (q && !((d.name || '').toLowerCase().includes(q) || (d.links || []).some((l) => (l.name || '').toLowerCase().includes(q)))) return false;
            if (cat !== 'all' && d.category !== cat) return false;
            if (type !== 'all' && (d.ext || '').toLowerCase() !== type) return false;
            if (owner !== 'all' && d.ownerName !== owner) return false;
            return true;
        });
    }, [documents, search, cat, type, owner]);

    const totalSize = useMemo(() => documents.reduce((s, d) => s + (Number(d.sizeKb) || 0), 0), [documents]);

    const openUpload = () => { setUploadRailContext && setUploadRailContext(null); setShowUploadRail && setShowUploadRail(true); };
    const handleDelete = (doc) => {
        setMenu(null);
        showConfirm(`Delete "${doc.name}"? This removes the file and all its versions.`, () => {
            removeDocument && removeDocument(doc.id);
        });
    };

    return (
        <div style={{ padding: '20px 28px', fontFamily: T.sans, maxWidth: 1280, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18 }}>
                <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.ink3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        Documents · {documents.length} files · {fmtSize(totalSize)}
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: T.ink, marginTop: 2 }}>Documents</div>
                </div>
                <button onClick={openUpload}
                    style={{ background: T.ink, color: '#f5f1eb', border: 'none', borderRadius: T.r, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                    ↑ Upload document
                </button>
            </div>

            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents"
                    style={{ flex: '1 1 240px', minWidth: 200, padding: '8px 12px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans, outline: 'none' }} />
                <Select value={cat} onChange={setCat}>
                    <option value="all">All categories</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
                <Select value={type} onChange={setType}>
                    <option value="all">All types</option>
                    {types.map((t) => <option key={t} value={t}>.{t}</option>)}
                </Select>
                <Select value={owner} onChange={setOwner}>
                    <option value="all">Any owner</option>
                    {owners.map((o) => <option key={o} value={o}>{o}</option>)}
                </Select>
                <span style={{ fontSize: 12, color: T.ink3, marginLeft: 'auto' }}>{filtered.length} shown</span>
            </div>

            {/* Table */}
            <div style={{ border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden', background: T.surface }}>
                <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, padding: '9px 16px', background: T.surface2, borderBottom: `1px solid ${T.border}`, fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    <div>Document</div><div>Category</div><div>Linked to</div><div>Owner</div><div>Modified</div><div>Size</div><div />
                </div>
                {docsLoading && documents.length === 0 ? (
                    <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: T.ink3 }}>Loading documents…</div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: T.ink3 }}>
                        {documents.length === 0 ? 'No documents yet. Upload your first file to get started.' : 'No documents match your filters.'}
                    </div>
                ) : (
                    filtered.map((doc) => (
                        <DocRow key={doc.id} doc={doc}
                            onOpen={(d) => setDocumentRailId && setDocumentRailId(d.id)}
                            onMenu={(d, anchor) => setMenu({ doc: d, anchor })} />
                    ))
                )}
            </div>

            {menu && (
                <RowMenu anchor={menu.anchor} onClose={() => setMenu(null)}
                    onPreview={() => { setMenu(null); previewDoc && previewDoc(menu.doc.id); }}
                    onDownload={() => { setMenu(null); downloadDoc && downloadDoc(menu.doc.id); }}
                    onOpen={() => { setMenu(null); setDocumentRailId && setDocumentRailId(menu.doc.id); }}
                    onDelete={() => handleDelete(menu.doc)} />
            )}
        </div>
    );
}
