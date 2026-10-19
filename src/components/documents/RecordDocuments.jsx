// src/components/documents/RecordDocuments.jsx
// Reverse-view Documents tab body for heavy records (Account / Opportunity /
// Contact). Rendered inside those rails/modal. Props identify the host record;
// everything else comes from useApp(). Linked docs are derived reactively from
// the global documents list (filtered by link), so uploads/links show instantly.

import React, { useMemo, useState, useRef } from 'react';
import { useApp } from '../../AppContext';
import { T, fmtSize, fmtDate, FileTypeBadge, CategoryPill, baseName } from './atoms';
import DocumentPicker from './DocumentPicker';
import { validateFile } from '../../utils/documentsStorage';
import { canEditCrm } from '../../utils/roles.js';
import { standsFor } from '../../utils/pickLink.js';

export default function RecordDocuments({ recordType, recordId, recordName, recordSub }) {
    const {
        documents = [],
        createDocument, linkDocument, unlinkDocument,
        setDocumentRailId, setShowUploadRail, setUploadRailContext,
        downloadDoc, userRole,
        accounts = [], contacts = [],
    } = useApp();
    // Upload, Link existing, a dropped file and Unlink are offered to whom the server lets
    // write — canEditCrm, requireWrite's list (state §0.182); a reader sees the list and
    // downloads.
    const canEdit = canEditCrm(userRole);

    const [drag, setDrag] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [showPicker, setShowPicker] = useState(false);
    const dragDepth = useRef(0);

    const recordLink = { type: recordType, recordId, name: recordName, sub: recordSub };

    // The records this one stands for (state §0.209; Jeff, 18 Oct: "Survivor shows them"): its own id — and on an
    // account or a contact, every record merged into it, whose documents a merge leaves linked where they were
    // (OPEN_ITEMS §4.7): listed here, unlinked here. An Undo, the lists read again, takes them off.
    const ids = useMemo(() => {
        if (recordType === 'account') return new Set([recordId, ...standsFor(accounts.find((a) => a.id === recordId), accounts)]);
        if (recordType === 'contact') return new Set([recordId, ...standsFor(contacts.find((c) => c.id === recordId), contacts)]);
        return new Set([recordId]);
    }, [recordType, recordId, accounts, contacts]);
    const docs = useMemo(
        () => documents.filter((d) => (d.links || []).some((l) => l.type === recordType && ids.has(l.recordId))),
        [documents, recordType, ids],
    );

    const openUpload = () => {
        setUploadRailContext && setUploadRailContext({ links: [recordLink] });
        setShowUploadRail && setShowUploadRail(true);
    };

    const attachFiles = async (fileList) => {
        const files = Array.from(fileList || []);
        if (!files.length) return;
        for (const f of files) {
            const invalid = validateFile(f);
            if (invalid) { setError(invalid); return; }
        }
        setBusy(true); setError(null);
        try {
            for (const f of files) {
                await createDocument(f, { name: baseName(f.name), category: 'Note', visibility: 'team', links: [recordLink] });
            }
        } catch (e) {
            setError(e.message || 'Upload failed');
        } finally {
            setBusy(false);
        }
    };

    const onDrop = (e) => {
        e.preventDefault();
        dragDepth.current = 0; setDrag(false);
        attachFiles(e.dataTransfer.files);
    };

    // Every link of the document to the records this one stands for — its own and a record merged into it — stopping
    // at a refusal, which the app's message says (useDocuments). A merge's Undo does not put such a link back.
    const unlinkHere = async (doc) => {
        for (const l of (doc.links || []).filter((x) => x.type === recordType && ids.has(x.recordId))) {
            if (l.id && unlinkDocument && !(await unlinkDocument(doc.id, l.id)).ok) return;
        }
    };

    // A refused link says so in the app's message (useDocuments); the rest are not sent
    // (state §0.181).
    const linkExisting = async (picked) => {
        setShowPicker(false);
        for (const d of picked) {
            if (linkDocument && !(await linkDocument(d.id, [recordLink])).ok) return;
        }
    };

    return (
        <div
            onDragEnter={canEdit ? (e) => { e.preventDefault(); dragDepth.current += 1; setDrag(true); } : undefined}
            onDragOver={canEdit ? (e) => e.preventDefault() : undefined}
            onDragLeave={canEdit ? () => { dragDepth.current -= 1; if (dragDepth.current <= 0) setDrag(false); } : undefined}
            onDrop={canEdit ? onDrop : undefined}
            style={{ position: 'relative', fontFamily: T.sans }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.gold, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Documents · {docs.length} file{docs.length === 1 ? '' : 's'}
                </div>
                {canEdit && (
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setShowPicker(true)}
                            style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.inkMid, borderRadius: T.r, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                            🔗 Link existing
                        </button>
                        <button onClick={openUpload}
                            style={{ background: T.ink, border: 'none', color: '#f5f1eb', borderRadius: T.r, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                            ↑ Upload
                        </button>
                    </div>
                )}
            </div>

            {error && (
                <div style={{ background: `${T.danger}14`, border: `1px solid ${T.danger}`, borderRadius: T.r, padding: '7px 10px', marginBottom: 8, fontSize: 12, color: T.danger }}>{error}</div>
            )}

            {/* Drag hint */}
            {canEdit && (
                <div style={{ border: `1px dashed ${T.border}`, borderRadius: T.r, padding: '8px 12px', marginBottom: 10, fontSize: 11, color: T.inkMuted, textAlign: 'center' }}>
                    {busy ? 'Uploading…' : 'Drag files here to attach them to this record'}
                </div>
            )}

            {/* List */}
            {docs.length === 0 ? (
                <div style={{ fontSize: 12, color: T.inkMuted, fontStyle: 'italic', padding: '8px 0' }}>No documents linked yet.</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {docs.map((doc) => (
                        <div key={doc.id}
                            onClick={() => setDocumentRailId && setDocumentRailId(doc.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '8px 10px', cursor: 'pointer' }}>
                            <FileTypeBadge ext={doc.ext} size={30} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
                                    {doc.version > 1 && <span style={{ fontSize: 10, color: T.inkMuted, fontWeight: 600 }}>v{doc.version}</span>}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                                    <CategoryPill category={doc.category} />
                                    <span style={{ fontSize: 11, color: T.inkMuted }}>{fmtSize(doc.sizeKb)} · {fmtDate(doc.modifiedAt)}</span>
                                </div>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); downloadDoc && downloadDoc(doc.id); }} title="Download"
                                style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: T.r, color: T.inkMid, cursor: 'pointer', fontSize: 12, padding: '3px 7px', flexShrink: 0 }}>↓</button>
                            {canEdit && (
                                <button onClick={(e) => { e.stopPropagation(); unlinkHere(doc); }} title="Unlink from this record"
                                    style={{ background: 'none', border: 'none', color: T.inkMuted, cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '2px 4px', flexShrink: 0 }}>×</button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Drag overlay */}
            {drag && (
                <div style={{ position: 'absolute', inset: -4, borderRadius: 6, border: `2px dashed ${T.gold}`, background: 'rgba(200,185,154,0.14)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 5 }}>
                    <div style={{ fontSize: 22, color: T.gold }}>↑</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Drop to attach to {recordName}</div>
                    <div style={{ fontSize: 11, color: T.inkMuted }}>Files link to this record automatically</div>
                </div>
            )}

            {canEdit && (
                <DocumentPicker
                    open={showPicker}
                    excludeIds={docs.map((d) => d.id)}
                    onConfirm={linkExisting}
                    onClose={() => setShowPicker(false)}
                />
            )}
        </div>
    );
}
