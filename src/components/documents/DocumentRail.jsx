// src/components/documents/DocumentRail.jsx
// Document detail rail (handoff artboard 1). Uses the production rail shell
// (dark T.ink header, width 480, backdrop @ z11100 / panel @ z11101 — above every
// record rail and the deal modal). Reads its open-state + handlers from useApp();
// mounted once in ModalLayer. Escape closes it, not what is under it (state §0.180).

import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../AppContext';
import { useEscapeLayer } from '../../hooks/useEscapeLayer';
import { canEditCrm } from '../../utils/roles.js';
import { sharablePeople, sharedNames, toggled } from '../../utils/documentPeople.js';
import {
    T, fmtSize, fmtDateLong, fileMeta, FileTypeBadge, CategoryPill,
    LinkChip, VisibilityControl, PeopleChooser, CATEGORIES,
} from './atoms';

function DetailField({ label, children }) {
    return (
        <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{label}</div>
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
        updateDocument, removeDocument, restoreVersion, fetchVersions, showConfirm,
        downloadDoc, previewDoc, unlinkDocument,
        setShowUploadRail, setUploadRailContext,
        setShowDocLinkPicker, setDocLinkPickerContext,
        escapeBlocked,
        userRole, settings, clerkUser, currentUserId,
    } = useApp();

    const doc = documentRailId ? (documents.find((d) => d.id === documentRailId) || null) : null;

    const [versions, setVersions] = useState([]);
    const [loadingVersions, setLoadingVersions] = useState(false);
    const [versionsFailed, setVersionsFailed] = useState(false);
    const [note, setNote] = useState('');
    // Choosing the people a Specific document is shared with (state §0.183): the list
    // ticked so far, saved with the visibility in one PUT.
    const [choosing, setChoosing] = useState(false);
    const [picked, setPicked] = useState([]);

    const close = useCallback(() => setDocumentRailId && setDocumentRailId(null), [setDocumentRailId]);

    // Seed the editable note, and empty the last document's history, when a document opens.
    useEffect(() => {
        if (!doc) return;
        setNote(doc.note || '');
        setVersions([]);
        setChoosing(false);
    }, [doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Load the version history when a document opens — and again when its version moves:
    // a restore or a new version adds one on the server, and the list stayed as it opened
    // until the rail was reopened, no row Current and the new version missing (state
    // §0.182). The list on screen stays while it refreshes.
    useEffect(() => {
        if (!doc) return;
        let cancelled = false;
        setLoadingVersions(true);
        setVersionsFailed(false);
        Promise.resolve(fetchVersions ? fetchVersions(doc.id) : [])
            .then((vs) => { if (!cancelled) setVersions(Array.isArray(vs) ? vs : []); })
            // A history that did not load says so (state §0.181) — it said "No version history."
            .catch(() => { if (!cancelled) { setVersions([]); setVersionsFailed(true); } })
            .finally(() => { if (!cancelled) setLoadingVersions(false); });
        return () => { cancelled = true; };
    }, [doc?.id, doc?.version, fetchVersions]); // eslint-disable-line react-hooks/exhaustive-deps

    // Close if the doc disappears (deleted elsewhere).
    useEffect(() => { if (documentRailId && !doc) close(); }, [documentRailId, doc, close]);

    // Escape closes this rail, not the record under it (state §0.180) — while no layer above
    // it is open: the one order (escapeBlocked, state §0.189), not the list it kept (an
    // upload, the link picker, the app's confirm or prompt — the coaching note, the
    // blocked-delete notice, the follow-up and the leave guard were not on it). The focused
    // field is blurred first, so the description saves as it does when the backdrop is
    // clicked (its own blur).
    useEscapeLayer(!!doc, () => { document.activeElement?.blur?.(); close(); },
        escapeBlocked('documentRail'));

    if (!doc) return null;

    const m = fileMeta(doc.ext);
    // Every edit here is offered to whom the server lets write — canEditCrm, requireWrite's
    // list (state §0.182). A ReadOnly user, a Technician or a Dispatcher saw each one and
    // was refused; they see the document, its links and its history, and download it.
    const canEdit = canEditCrm(userRole);
    // The edits here are sent and left: each says in the app's message when it is refused
    // (useDocuments, state §0.181) — a refused description stays as typed, to save again.
    const saveNote = () => { if ((note || '') !== (doc.note || '')) updateDocument && updateDocument(doc.id, { note }); };
    const onNewVersion = () => {
        setUploadRailContext && setUploadRailContext({ mode: 'version', documentId: doc.id, name: doc.name, ext: doc.ext });
        setShowUploadRail && setShowUploadRail(true);
    };
    const onAddLink = () => {
        setDocLinkPickerContext && setDocLinkPickerContext({ documentId: doc.id, currentLinks: doc.links || [] });
        setShowDocLinkPicker && setShowDocLinkPicker(true);
    };
    // Who sees it (state §0.183): its owner or an Admin changes it (doc.canManage, the
    // server's own rule). Specific opens the people to tick first, and saves them with it.
    const visibilityNow = doc.visibility || doc.visibilityKind || 'team';
    const mine = !!doc.ownerId && doc.ownerId === clerkUser?.id;
    const people = sharablePeople(settings?.users, { selfId: currentUserId, selfIsOwner: mine });
    const onVisibility = (v) => {
        if (v === 'specific') {
            setPicked(Array.isArray(doc.visibilityUserIds) ? doc.visibilityUserIds : []);
            setChoosing(true);
            return;
        }
        setChoosing(false);
        updateDocument && updateDocument(doc.id, { visibility: v });
    };
    const savePeople = async () => {
        const r = updateDocument && await updateDocument(doc.id, { visibility: 'specific', visibilityUserIds: picked });
        if (r && r.ok) setChoosing(false);   // a refusal says so in the app's message, the choice kept
    };
    // The delete is confirmed, then sent; the rail closes when the document leaves the
    // library (the effect above), so a refused one leaves it open and the app's message
    // says why (state §0.181). It closed before the answer.
    const onDelete = () => {
        showConfirm(`Delete "${doc.name}"? This removes the file and all its versions.`, () => {
            removeDocument && removeDocument(doc.id);
        });
    };

    const actionBtn = (label, onClick, primary) => (
        <button onClick={onClick} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            padding: '8px 6px', borderRadius: T.r, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans,
            background: primary ? T.ink : T.surface, color: primary ? '#f5f1eb' : T.inkMid,
            border: primary ? 'none' : `1px solid ${T.border}`,
        }}>{label}</button>
    );

    return (
        <>
            <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 11100, background: 'rgba(42,38,34,0.25)' }} />
            <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 480, background: T.surface, borderLeft: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', zIndex: 11101, boxShadow: '-8px 0 32px rgba(42,38,34,0.12)', fontFamily: T.sans }}>

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
                    {canEdit && actionBtn('＋ New version', onNewVersion)}
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '14px 18px' }}>

                    {/* Linked to */}
                    <SectionHeading label={`Linked to · ${(doc.links || []).length} records`} action={canEdit ? <button style={linkText} onClick={onAddLink}>＋ Add link</button> : null} />
                    {(doc.links || []).length === 0 ? (
                        <div style={{ fontSize: 12, color: T.inkMuted, fontStyle: 'italic' }}>Not linked to any records yet.</div>
                    ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {(doc.links || []).map((l) => (
                                <LinkChip key={l.id || `${l.type}:${l.recordId}`} link={l} onRemove={canEdit ? (lk) => unlinkDocument && unlinkDocument(doc.id, lk.id) : undefined} />
                            ))}
                        </div>
                    )}
                    <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 8 }}>This file appears under each linked Account, Contact, Opportunity, Task &amp; Activity.</div>

                    {/* Details */}
                    <SectionHeading label="Details" />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' }}>
                        <DetailField label="Category">
                            {canEdit ? (
                                <select value={doc.category || 'Note'} onChange={(e) => updateDocument && updateDocument(doc.id, { category: e.target.value })}
                                    style={{ padding: '4px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12, background: T.surface, color: T.ink, fontFamily: T.sans, cursor: 'pointer' }}>
                                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                            ) : (doc.category ? <CategoryPill category={doc.category} /> : '—')}
                        </DetailField>
                        <DetailField label="Owner">{doc.ownerName || '—'}</DetailField>
                        <DetailField label="Uploaded">{fmtDateLong(doc.uploadedAt)}</DetailField>
                        <DetailField label="Last modified">{fmtDateLong(doc.modifiedAt)}</DetailField>
                        <DetailField label="File size">{fmtSize(doc.sizeKb)}</DetailField>
                        <DetailField label="Type">{m.label} · .{(doc.ext || '').toLowerCase()}</DetailField>
                    </div>

                    {/* Visibility */}
                    <SectionHeading label="Visibility" />
                    <VisibilityControl value={choosing ? 'specific' : visibilityNow} disabled={!canEdit || !doc.canManage} onChange={onVisibility} />
                    {canEdit && doc.canManage && choosing ? (
                        <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 12, color: T.inkMid }}>Share it with:</div>
                            <PeopleChooser people={people} chosen={picked} onToggle={(id) => setPicked((prev) => toggled(prev, id))}
                                nameOf={(id) => sharedNames([id], settings?.users)[0]} />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                                <button onClick={() => setChoosing(false)} style={{ background: 'none', border: `1px solid ${T.border}`, color: T.inkMid, borderRadius: T.r, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>Cancel</button>
                                <button onClick={savePeople} disabled={picked.length === 0}
                                    style={{ background: T.ink, border: 'none', color: '#f5f1eb', borderRadius: T.r, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: picked.length ? 'pointer' : 'default', opacity: picked.length ? 1 : 0.5, fontFamily: T.sans }}>
                                    Share with {picked.length || 'no one yet'}
                                </button>
                            </div>
                        </div>
                    ) : visibilityNow === 'specific' && (
                        <div style={{ marginTop: 8, fontSize: 12, color: T.inkMid }}>
                            Shared with {sharedNames(doc.visibilityUserIds, settings?.users).join(', ') || 'no one'}
                            {canEdit && doc.canManage && (
                                <button onClick={() => onVisibility('specific')} style={{ ...linkText, marginLeft: 8 }}>Edit people</button>
                            )}
                        </div>
                    )}
                    {canEdit && !doc.canManage && (
                        <div style={{ marginTop: 6, fontSize: 11, color: T.inkMuted }}>Only its owner or an Admin can change who sees it.</div>
                    )}

                    {/* Description */}
                    <SectionHeading label="Description" />
                    {canEdit ? (
                        <textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={saveNote}
                            placeholder="Add a description…" rows={3}
                            style={{ width: '100%', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans, boxSizing: 'border-box', resize: 'vertical', outline: 'none' }} />
                    ) : doc.note ? (
                        <div style={{ fontSize: 13, color: T.ink, whiteSpace: 'pre-wrap' }}>{doc.note}</div>
                    ) : (
                        <div style={{ fontSize: 12, color: T.inkMuted, fontStyle: 'italic' }}>No description.</div>
                    )}

                    {/* Version history */}
                    <SectionHeading label={`Version history${versions.length ? ` · ${versions.length} versions` : ''}`} action={canEdit ? <button style={linkText} onClick={onNewVersion}>↑ Upload new version</button> : null} />
                    {loadingVersions && versions.length === 0 ? (
                        <div style={{ fontSize: 12, color: T.inkMuted }}>Loading…</div>
                    ) : versionsFailed ? (
                        <div style={{ fontSize: 12, color: T.inkMuted }}>Version history could not be loaded.</div>
                    ) : versions.length === 0 ? (
                        <div style={{ fontSize: 12, color: T.inkMuted, fontStyle: 'italic' }}>No version history.</div>
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
                                            <span style={{ fontSize: 11, color: T.inkMuted }}>{fmtSize(ver.sizeKb)}</span>
                                        </div>
                                        {ver.note && <div style={{ fontSize: 12, color: T.inkMid, marginTop: 2 }}>{ver.note}</div>}
                                        <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 2 }}>{ver.byName || 'Unknown'} · {fmtDateLong(ver.createdAt)}</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                        <button onClick={() => downloadDoc && downloadDoc(doc.id, ver.v)} title="Download this version" style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: T.r, color: T.inkMid, cursor: 'pointer', fontSize: 11, padding: '3px 7px', fontFamily: T.sans }}>↓</button>
                                        {canEdit && !isCurrent && <button onClick={() => restoreVersion && restoreVersion(doc.id, ver.v)} title="Restore this version" style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: T.r, color: T.inkMid, cursor: 'pointer', fontSize: 11, padding: '3px 7px', fontFamily: T.sans }}>↺</button>}
                                    </div>
                                </div>
                            );
                        })
                    )}

                    {/* Danger — its owner's or an Admin's (state §0.183) */}
                    {canEdit && doc.canManage && (
                        <div style={{ marginTop: 22, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
                            <button onClick={onDelete} style={{ background: 'none', border: `1px solid ${T.danger}`, color: T.danger, borderRadius: T.r, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                                Delete document
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
