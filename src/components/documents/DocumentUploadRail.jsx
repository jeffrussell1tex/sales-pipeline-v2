// src/components/documents/DocumentUploadRail.jsx
// Upload rail (handoff artboard 2). Production rail chrome. Mounted once in
// ModalLayer; opened via context (showUploadRail + uploadRailContext).
//
// Two modes from uploadRailContext:
//   • null / {} → new document: name + category + links + visibility.
//   • { mode:'version', documentId, name, ext } → new version of an existing doc
//     (just a file + optional note), triggered from the detail rail.

import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../AppContext';
import {
    T, fmtSize, baseName, fileMeta, FileTypeBadge, CategoryPill, LinkChip,
    VisibilityControl, CATEGORIES,
} from './atoms';
import { validateFile } from '../../utils/documentsStorage';

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.csv,.txt';

export default function DocumentUploadRail() {
    const {
        showUploadRail, setShowUploadRail, uploadRailContext, setUploadRailContext,
        createDocument, addDocumentVersion,
        setShowDocLinkPicker, setDocLinkPickerContext,
    } = useApp();

    const ctx = uploadRailContext || {};
    const isVersion = ctx.mode === 'version';

    const [file, setFile] = useState(null);
    const [name, setName] = useState('');
    const [category, setCategory] = useState('Contract');
    const [links, setLinks] = useState([]);
    const [visibility, setVisibility] = useState('team');
    const [note, setNote] = useState('');
    const [progress, setProgress] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState(null);
    const [drag, setDrag] = useState(false);
    const inputRef = useRef(null);

    // Seed from context when the rail opens — e.g. pre-linked when launched from
    // a record's Documents tab (ctx.links) so the upload attaches automatically.
    useEffect(() => {
        if (showUploadRail && !isVersion) {
            setLinks(Array.isArray(ctx.links) ? ctx.links : []);
            if (ctx.category) setCategory(ctx.category);
        }
    }, [showUploadRail]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!showUploadRail) return null;

    const close = () => {
        setShowUploadRail(false);
        setUploadRailContext && setUploadRailContext(null);
        setFile(null); setName(''); setCategory('Contract'); setLinks([]); setVisibility('team');
        setNote(''); setProgress(null); setUploading(false); setError(null); setDrag(false);
    };

    const pickFile = (f) => {
        if (!f) return;
        const invalid = validateFile(f);
        if (invalid) { setError(invalid); return; }
        setError(null);
        setFile(f);
        if (!isVersion && !name) setName(baseName(f.name));
    };

    const onDrop = (e) => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files?.[0]); };

    const openLinkPicker = () => {
        setDocLinkPickerContext && setDocLinkPickerContext({ mode: 'select', currentLinks: links, onApply: setLinks });
        setShowDocLinkPicker && setShowDocLinkPicker(true);
    };

    const submit = async () => {
        if (!file || uploading) return;
        setUploading(true); setError(null); setProgress(0);
        try {
            if (isVersion) {
                await addDocumentVersion(ctx.documentId, file, { note, onProgress: setProgress });
            } else {
                await createDocument(file, { name: name || baseName(file.name), category, visibility, links, note, onProgress: setProgress });
            }
            close();
        } catch (e) {
            setError(e.message || 'Upload failed');
            setUploading(false);
            setProgress(null);
        }
    };

    const m = file ? fileMeta(file.name.split('.').pop()) : null;

    return (
        <>
            <div onClick={!uploading ? close : undefined} style={{ position: 'fixed', inset: 0, zIndex: 10998, background: 'rgba(42,38,34,0.25)' }} />
            <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 480, background: T.surface, borderLeft: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', zIndex: 10999, boxShadow: '-8px 0 32px rgba(42,38,34,0.12)', fontFamily: T.sans }}>

                {/* Header */}
                <div style={{ background: T.ink, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: T.gold, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Documents · {isVersion ? 'New version' : 'New'}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#f5f1eb' }}>{isVersion ? 'Upload new version' : 'Upload document'}</div>
                        <div style={{ fontSize: 11, color: 'rgba(245,241,235,0.55)', marginTop: 1 }}>
                            {isVersion ? `of ${ctx.name || 'document'}` : 'Add a file, categorize it and link it to records.'}
                        </div>
                    </div>
                    <button onClick={close} style={{ background: 'none', border: 'none', color: 'rgba(245,241,235,0.5)', fontSize: 18, cursor: 'pointer', padding: '2px 4px', lineHeight: 1, flexShrink: 0 }}>×</button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '16px 18px' }}>
                    {error && (
                        <div style={{ background: '#fef2f2', border: `1px solid ${T.danger}`, borderRadius: T.r, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: T.danger }}>{error}</div>
                    )}

                    {/* Dropzone / selected file */}
                    {!file ? (
                        <div
                            onClick={() => inputRef.current?.click()}
                            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                            onDragLeave={() => setDrag(false)}
                            onDrop={onDrop}
                            style={{ border: `1.5px dashed ${drag ? T.gold : T.border}`, borderRadius: 6, background: drag ? 'rgba(200,185,154,0.1)' : T.surface2, padding: '32px 16px', textAlign: 'center', cursor: 'pointer' }}>
                            <div style={{ fontSize: 22, color: T.gold, marginBottom: 6 }}>↑</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>Drag a file here, or <span style={{ color: T.info, textDecoration: 'underline' }}>browse</span></div>
                            <div style={{ fontSize: 11, color: T.ink3, marginTop: 4 }}>PDF, Word, PowerPoint, Excel, Images — up to 50&nbsp;MB</div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 11, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '10px 12px', background: T.surface2 }}>
                            <FileTypeBadge ext={file.name.split('.').pop()} size={34} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                                {progress != null ? (
                                    <div style={{ marginTop: 5 }}>
                                        <div style={{ height: 4, background: T.surface3, borderRadius: 999, overflow: 'hidden' }}>
                                            <div style={{ width: `${progress}%`, height: '100%', background: T.gold, transition: 'width 0.2s' }} />
                                        </div>
                                        <div style={{ fontSize: 10, color: T.ink3, marginTop: 3 }}>{progress}%</div>
                                    </div>
                                ) : (
                                    <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>{m?.label} · {fmtSize(Math.round(file.size / 1024))}</div>
                                )}
                            </div>
                            {!uploading && <button onClick={() => { setFile(null); setProgress(null); }} style={{ background: 'none', border: 'none', color: T.ink3, fontSize: 16, cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}>×</button>}
                        </div>
                    )}
                    <input ref={inputRef} type="file" accept={ACCEPT} style={{ display: 'none' }} onChange={(e) => pickFile(e.target.files?.[0])} />

                    {/* Version note (version mode) */}
                    {isVersion && (
                        <div style={{ marginTop: 16 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>What changed?</div>
                            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional changelog note for this version" rows={2}
                                style={{ width: '100%', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans, boxSizing: 'border-box', resize: 'vertical', outline: 'none' }} />
                        </div>
                    )}

                    {/* New-document fields */}
                    {!isVersion && (
                        <>
                            <div style={{ marginTop: 18 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Document name</div>
                                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Document name"
                                    style={{ width: '100%', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans, boxSizing: 'border-box', outline: 'none' }} />
                            </div>

                            <div style={{ marginTop: 16 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Category</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                                    {CATEGORIES.map((c) => {
                                        const on = category === c;
                                        return (
                                            <button key={c} onClick={() => setCategory(c)}
                                                style={{ borderRadius: 999, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: T.sans, letterSpacing: '0.03em', textTransform: 'uppercase', border: `1px solid ${on ? T.ink : T.border}`, background: on ? T.ink : T.surface, color: on ? '#f5f1eb' : T.ink2 }}>
                                                {c}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div style={{ marginTop: 16 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Link to records <span style={{ color: T.ink3, textTransform: 'none', fontWeight: 500 }}>· attach one or more</span></div>
                                </div>
                                <button onClick={openLinkPicker}
                                    style={{ width: '100%', textAlign: 'left', padding: '8px 12px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink3, fontFamily: T.sans, cursor: 'pointer' }}>
                                    🔍 Search accounts, contacts, opportunities, tasks…
                                </button>
                                {links.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                        {links.map((l) => (
                                            <LinkChip key={`${l.type}:${l.recordId}`} link={l} onRemove={(lk) => setLinks((prev) => prev.filter((x) => !(x.type === lk.type && x.recordId === lk.recordId)))} />
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div style={{ marginTop: 16 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Visibility</div>
                                <VisibilityControl value={visibility} onChange={setVisibility} />
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 18px', borderTop: `1px solid ${T.border}`, background: T.surface2, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: T.ink3 }}>{!isVersion && links.length > 0 ? `Linked to ${links.length} record${links.length === 1 ? '' : 's'}` : ''}</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={close} disabled={uploading} style={{ background: 'none', border: `1px solid ${T.border}`, color: T.ink2, borderRadius: T.r, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: uploading ? 'default' : 'pointer', fontFamily: T.sans, opacity: uploading ? 0.5 : 1 }}>Cancel</button>
                        <button onClick={submit} disabled={!file || uploading}
                            style={{ background: T.ink, color: '#f5f1eb', border: 'none', borderRadius: T.r, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: (!file || uploading) ? 'default' : 'pointer', fontFamily: T.sans, opacity: (!file || uploading) ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {uploading ? 'Uploading…' : (isVersion ? '↑ Upload version' : '↑ Upload document')}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
