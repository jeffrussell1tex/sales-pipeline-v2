// src/components/documents/AttachmentsStrip.jsx
// Compact inline attachments strip for light records (Task / Activity) — handoff
// artboards 8/9. No tab, no drag, no link-existing: just an "Attach file" action
// (opens the upload rail pre-linked) and a tight list. Props identify the host;
// linked docs derive reactively from the global documents list.

import React, { useMemo } from 'react';
import { useApp } from '../../AppContext';
import { T, fmtSize, FileTypeBadge } from './atoms';

export default function AttachmentsStrip({ recordType, recordId, recordName, recordSub }) {
    const {
        documents = [],
        unlinkDocument, setDocumentRailId, setShowUploadRail, setUploadRailContext,
    } = useApp();

    const recordLink = { type: recordType, recordId, name: recordName, sub: recordSub };
    const docs = useMemo(
        () => documents.filter((d) => (d.links || []).some((l) => l.type === recordType && l.recordId === recordId)),
        [documents, recordType, recordId],
    );

    const attach = () => {
        setUploadRailContext && setUploadRailContext({ links: [recordLink] });
        setShowUploadRail && setShowUploadRail(true);
    };
    const unlinkHere = (doc) => {
        const mine = (doc.links || []).find((l) => l.type === recordType && l.recordId === recordId);
        if (mine && mine.id && unlinkDocument) unlinkDocument(doc.id, mine.id);
    };

    return (
        <div style={{ fontFamily: T.sans }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    Attachments{docs.length ? ` · ${docs.length}` : ''}
                </div>
                <button onClick={attach}
                    style={{ background: 'none', border: 'none', color: T.info, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: T.sans, padding: 0 }}>
                    ＋ Attach file
                </button>
            </div>
            {docs.length === 0 ? (
                <div style={{ fontSize: 12, color: T.ink3, fontStyle: 'italic' }}>No attachments.</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {docs.map((doc) => (
                        <div key={doc.id}
                            onClick={() => setDocumentRailId && setDocumentRailId(doc.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 9, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '6px 8px', cursor: 'pointer' }}>
                            <FileTypeBadge ext={doc.ext} size={24} />
                            <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
                            <span style={{ fontSize: 10, color: T.ink3, flexShrink: 0 }}>{fmtSize(doc.sizeKb)}</span>
                            <button onClick={(e) => { e.stopPropagation(); unlinkHere(doc); }} title="Remove attachment"
                                style={{ background: 'none', border: 'none', color: T.ink3, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '1px 3px', flexShrink: 0 }}>×</button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
