// src/components/documents/DocumentRail.jsx
// Document detail rail (handoff artboard 1). Uses the production rail shell
// (dark T.ink header, width 480, backdrop @ z10998 / panel @ z10999) so it sits
// natively beside ContactRail / AccountRail. Reads its open-state + handlers
// from useApp(); mounted once in ModalLayer.

import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../AppContext';
import {
    T, fmtSize, fmtDateLong, fileMeta, FileTypeBadge, CategoryPill,
    LinkChip, VisibilityControl, CATEGORIES,
} from './atoms';

function DetailField({ label, children }) {
    return (
        <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 13, color: T.ink }}>{children}</div>
        </div>
    );
}

function SectionHeading({ label, action }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 10, borderBottom: `1px solid ${T.border}`, paddingBottom: 5 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.gold, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
            {action}
        </div>
    );
}

const linkText = { background: 'none', border: 'none', color: T.info, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: T.sans, padding: 0 };

export default function DocumentRail() {
    const {
        documentRailId, setDocumentRailId,
        documents = [],
        updateDocument, removeDocument, restoreVersion, fetchVersions,
        downloadDoc, previewDoc, unlinkDocument,
        setShowUploadRail, setUploadRailContext,
        setShowDocLinkPicker, setDocLinkPickerContext,
    } = useApp();

    const doc = documentRailId ? (documents.find((d) => d.id === documentRailId) || null) : null;

    const [versions, setVersions] = useState([]);
    const [loadingVersions, setLoadingVersions] = useState(false);
    const [note, setNote] = useState('');

    const close = useCallback(() => setDocumentRailId && setDocumentRailId(null), [setDocumentRailId]);

    // Load version history + seed the editable note whenever the open doc changes.
    useEffect(() => {
        if (!doc) return;
        setNote(doc.note || '');
        let cancelled = false;
        setLoadingVersions(true);
        Promise.resolve(fetchVersions ? fetchVersions(doc.id) : [])
            .then((vs) => { if (!cancelled) setVersions(Array.isArray(vs) ? vs : []); })
            .catch(() => { if (!cancelled) setVersions([]); })
            .finally(() => { if (!cancelled) setLoadingVersions(false); });
        return () => { cancelled = true; };
    }, [doc?.id, fetchVersions]); // eslint-disable-line react-hooks/exhaustive-deps

    // Close if the doc disappears (deleted elsewhere).
    useEffect(() => { if (documentRailId && !doc) close(); }, [documentRailId, doc, close]);

    if (!doc) return null;

    const m = fileMeta(doc.ext);
    const saveNote = () => { if ((note || '') !== (doc.note || '')) updateDocument && updateDocument(doc.id, { note }); };
    const onNewVersion = () => {
        setUploadRailContext && setUploadRailContext({ mode: 'version', documentId: doc.id, name: doc.name, ext: doc.ext });
        setShowUploadRail && setShowUploadRail(true);
    };
    const onAddLink = () => {
        setDocLinkPickerContext && setDocLinkPickerContext({ documentId: doc.id, currentLinks: doc.links || [] });
        setShowDocLinkPicker && setShowDocLinkPicker(true);
    };
    const onDelete = () => {
        if (window.confirm(`Delete "${doc.name}"? This removes the file and all its versions.`)) {
            removeDocument && removeDocument(doc.id);
            close();
        }
    };

    const actionBtn = (label, onClick, primary) => (
        <button onClick={onClick} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            padding: '8px 6px', borderRadius: T.r, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans,
            background: primary ? T.ink : T.surface, color: primary ? '#f5f1eb' : T.ink2,
            border: primary ? 'none' : `1px solid ${T.border}`,
        }}>{label}</button>
    );

    return (
        <>
            <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 10998, background: 'rgba(42,38,34,0.25)' }} />
            <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 480, background: T.surface, borderLeft: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', zIndex: 10999, boxShadow: '-8px 0 32px rgba(42,38,34,0.12)', fontFamily: T.sans }}>

                {/* Header */}
                <div style={{ background: T.ink, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    <FileTypeBadge ext={doc.ext} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: T.gold, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Documents{doc.category ? ` · ${doc.category}` : ''}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#f5f1eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</div>
                        <div style={{ fontSize: 11, color: 'rgba(245,241,235,0.55)', marginTop: 1 }}>{m.label} · v{doc.version || 1} · {fmtSize(doc.sizeKb)}</div>
                    </div>
                    <button onClick={close} style={{ background: 'none', border: 'none', color: 'rgba(245,241,235,0.5)', fontSize: 18, cursor: 'pointer', padding: '2px 4px', lineHeight: 1, flexShrink: 0 }}>×</button>
                </div>

                {/* Action bar */}
                <div style={{ display: 'flex', gap: 8, padding: '10px 16px', background: T.surface2, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                    {actionBtn('↓ Download', () => downloadDoc && downloadDoc(doc.id), true)}
                    {actionBtn('⤢ Preview', () => previewDoc && previewDoc(doc.id))}
                    {actionBtn('＋ New version', onNewVersion)}
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '14px 18px' }}>

                    {/* Linked to */}
                    <SectionHeading label={`Linked to · ${(doc.links || []).length} records`} action={<button style={linkText} onClick={onAddLink}>＋ Add link</button>} />
                    {(doc.links || []).length === 0 ? (
                        <div style={{ fontSize: 12, color: T.ink3, fontStyle: 'italic' }}>Not linked to any records yet.</div>
                    ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {(doc.links || []).map((l) => (
                                <LinkChip key={l.id || `${l.type}:${l.recordId}`} link={l} onRemove={(lk) => unlinkDocument && unlinkDocument(doc.id, lk.id)} />
                            ))}
                        </div>
                    )}
                    <div style={{ fontSize: 11, color: T.ink3, marginTop: 8 }}>This file appears under each linked Account, Contact, Opportunity, Task &amp; Activity.</div>

                    {/* Details */}
                    <SectionHeading label="Details" />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' }}>
                        <DetailField label="Category">
                            <select value={doc.category || 'Note'} onChange={(e) => updateDocument && updateDocument(doc.id, { category: e.target.value })}
                                style={{ padding: '4px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12, background: T.surface, color: T.ink, fontFamily: T.sans, cursor: 'pointer' }}>
                                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </DetailField>
                        <DetailField label="Owner">{doc.ownerName || '—'}</DetailField>
                        <DetailField label="Uploaded">{fmtDateLong(doc.uploadedAt)}</DetailField>
                        <DetailField label="Last modified">{fmtDateLong(doc.modifiedAt)}</DetailField>
                        <DetailField label="File size">{fmtSize(doc.sizeKb)}</DetailField>
                        <DetailField label="Type">{m.label} · .{(doc.ext || '').toLowerCase()}</DetailField>
                    </div>

                    {/* Visibility */}
                    <SectionHeading label="Visibility" />
                    <VisibilityControl value={doc.visibility || doc.visibilityKind || 'team'} onChange={(v) => updateDocument && updateDocument(doc.id, { visibility: v })} />

                    {/* Description */}
                    <SectionHeading label="Description" />
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={saveNote}
                        placeholder="Add a description…" rows={3}
                        style={{ width: '100%', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans, boxSizing: 'border-box', resize: 'vertical', outline: 'none' }} />

                    {/* Version history */}
                    <SectionHeading label={`Version history${versions.length ? ` · ${versions.length} versions` : ''}`} action={<button style={linkText} onClick={onNewVersion}>↑ Upload new version</button>} />
                    {loadingVersions ? (
                        <div style={{ fontSize: 12, color: T.ink3 }}>Loading…</div>
                    ) : versions.length === 0 ? (
                        <div style={{ fontSize: 12, color: T.ink3, fontStyle: 'italic' }}>No version history.</div>
                    ) : (
                        versions.slice().sort((a, b) => b.v - a.v).map((ver) => {
                            const isCurrent = ver.v === (doc.version || 1);
                            return (
                                <div key={ver.id || ver.v} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: `1px solid ${T.border}` }}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: isCurrent ? T.gold : T.border, marginTop: 5, flexShrink: 0 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Version {ver.v}</span>
                                            {isCurrent && <span style={{ fontSize: 9, fontWeight: 800, color: T.gold, background: 'rgba(200,185,154,0.15)', border: '1px solid rgba(200,185,154,0.3)', borderRadius: 3, padding: '1px 6px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Current</span>}
                                            <span style={{ fontSize: 11, color: T.ink3 }}>{fmtSize(ver.sizeKb)}</span>
                                        </div>
                                        {ver.note && <div style={{ fontSize: 12, color: T.ink2, marginTop: 2 }}>{ver.note}</div>}
                                        <div style={{ fontSize: 11, color: T.ink3, marginTop: 2 }}>{ver.byName || 'Unknown'} · {fmtDateLong(ver.createdAt)}</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                        <button onClick={() => downloadDoc && downloadDoc(doc.id, ver.v)} title="Download this version" style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: T.r, color: T.ink2, cursor: 'pointer', fontSize: 11, padding: '3px 7px', fontFamily: T.sans }}>↓</button>
                                        {!isCurrent && <button onClick={() => restoreVersion && restoreVersion(doc.id, ver.v)} title="Restore this version" style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: T.r, color: T.ink2, cursor: 'pointer', fontSize: 11, padding: '3px 7px', fontFamily: T.sans }}>↺</button>}
                                    </div>
                                </div>
                            );
                        })
                    )}

                    {/* Danger */}
                    <div style={{ marginTop: 22, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
                        <button onClick={onDelete} style={{ background: 'none', border: `1px solid ${T.danger}`, color: T.danger, borderRadius: T.r, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                            Delete document
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
