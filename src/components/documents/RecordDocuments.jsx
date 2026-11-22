// src/components/documents/RecordDocuments.jsx
// Reverse-view Documents tab body for heavy records (Account / Opportunity /
// Contact). Rendered inside those rails/modal. Props identify the host record;
// everything else comes from useApp(). Linked docs are derived reactively from
// the global documents list (filtered by link), so uploads/links show instantly.

import React, { useMemo, useState, useRef } from 'react';
import { useApp } from '../../AppContext';
import { requestOrg, stillOrg } from '../../utils/storage';
import { T, fmtSize, fmtDate, FileTypeBadge, CategoryPill, baseName } from './atoms';
import DocumentPicker from './DocumentPicker';
import { validateFile } from '../../utils/documentsStorage';
import { canEditCrm } from '../../utils/roles.js';
import { standsFor } from '../../utils/pickLink.js';
import { failureWords } from '../../utils/refusalWords.js';

// The files of a drop refused while a batch was sending, each held as [name, validateFile's words]: one the check would
// refuse said by its name and its words, and only the files that would pass named "Not sent", with when to drop them
// again (§0.249, the review, round 4; last pass: a file the check would refuse was invited back, refused when dropped).
const heldWords = (held, busy) => [...held.filter((h) => h[1]).map(([n, w]) => `${n}: ${w}`), ...(held.some((h) => !h[1]) ? [`Not sent: ${held.filter((h) => !h[1]).map((h) => h[0]).join(', ')} — ${busy ? 'wait for the current upload to finish, then drop them again' : 'drop them again'}.`] : [])].join('\n');

// `onBusy(true)` as a batch starts sending and `onBusy(false)` as it ends — from the batch itself, so it ends even when
// this has closed (state §0.252): its host holds its closes and its tab while one is out — the batch's words are said here.
export default function RecordDocuments({ recordType, recordId, recordName, recordSub, onBusy }) {
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
    // Files made whose answers could not be read: said as made, apart from the red box of a failure (§0.249).
    const [notice, setNotice] = useState(null);
    // A drop refused while a batch was sending: its files, each [name, validateFile's words], said apart from the batch's
    // words (§0.249, round 4; checked as they are held, last pass).
    const [held, setHeld] = useState(null);
    const [showPicker, setShowPicker] = useState(false);
    const dragDepth = useRef(0);
    // One batch at a time: set as a batch starts sending and cleared when it ends, read by the next drop at once (§0.249,
    // round 4: a drop while one sent ran a second batch beside it, each overwriting the other's words).
    const sending = useRef(false);

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
        // A drop while a batch is sending is refused — two batches never run at once — its files named until the next drop
        // that is taken, apart from the batch's words, which would replace them, or be replaced (§0.249, the review, round 4:
        // the second batch cleared the first one's words, and the first one's "Not sent" names were lost).
        // Each held file is checked as it is held (last pass): one the check would refuse is said with its words, never
        // invited back. A name held twice is said once, with the words of its latest drop.
        if (sending.current) { setHeld((h) => [...new Map([...(h || []), ...files.map((f) => [f.name, validateFile(f)])])]); return; }
        // A batch that stops says the file it stopped at by its name and its words, and the files never sent by theirs —
        // dropped again they are sent; a file made, or one that may have been, is never among them (§0.249, the review,
        // round 3: the words named neither, and the member who dropped the batch again wrote the made files twice).
        const stopWords = (f, words, unsent) => [`${f.name}: ${words}`, ...(unsent.length ? [`Not sent: ${unsent.map((u) => u.name).join(', ')} — drop them again`] : [])].join('\n');
        // Every file is checked before any is sent, and nothing is sent while any is refused (as before): each refused is
        // said by its name and its own words, and only the files that would pass are named "Not sent" (§0.249, the review,
        // round 4: the first refused ended the check, and every other file, refused or not, was named "drop them again").
        // A refused drop clears the last one's notice and held names, as a batch that sends does.
        const refused = files.map((f) => [f, validateFile(f)]).filter((r) => r[1]);
        if (refused.length) {
            const fine = files.filter((f) => !refused.some((r) => r[0] === f));
            const said = refused.map(([f, words], i) => stopWords(f, words, i === refused.length - 1 ? fine : [])).join('\n');
            setNotice(null); setHeld(null); setError(said);
            return;
        }
        sending.current = true;
        if (onBusy) onBusy(true);
        setBusy(true); setError(null); setNotice(null);
        setHeld(null);
        // A file made whose answer cannot be read (documentsStorage's `landed`) is made, not failed: the next file goes, and
        // it is said as made — stopping there asked for the drop again, which wrote that file twice (§0.249).
        const landed = [];
        let at = 0;
        try {
            for (; at < files.length; at += 1) {
                const f = files[at];
                try {
                    await createDocument(f, { name: baseName(f.name), category: 'Note', visibility: 'team', links: [recordLink] });
                } catch (e) {
                    if (!e || !e.landed) throw e;
                    landed.push([f.name, failureWords(e), !!e.maybe]);
                }
            }
        } catch (e) {
            setError(stopWords(files[at], failureWords(e), files.slice(at + 1)));
        } finally {
            // A file that may have been made (`maybe`: a 5xx, a gateway's page, a request that threw — §0.249, round 2) is
            // said in the red box by its name, each on its own line, before a failure that stopped the batch.
            const maybe = landed.filter((l) => l[2]).map(([n, w]) => `${n}: ${w}`);
            const made = landed.filter((l) => !l[2]);
            if (made.length === 1) setNotice(`${made[0][0]}: ${made[0][1]}`);
            else if (made.length > 1) setNotice(`${made.map(([n]) => n).join(', ')}: The files were uploaded. Their answers could not be read — reload the page to see them.`);
            if (maybe.length) setError((stop) => [...maybe, ...(stop ? [stop] : [])].join('\n'));
            setBusy(false);
            sending.current = false;
            if (onBusy) onBusy(false);
        }
    };

    const onDrop = (e) => {
        e.preventDefault();
        dragDepth.current = 0; setDrag(false);
        attachFiles(e.dataTransfer.files);
    };

    // Every link of the document to the records this one stands for — its own and a record merged into it — stopping
    // at a refusal, which the app's message says (useDocuments). A merge's Undo does not put such a link back.
    // Cut by an org switch, each loop stops (state §0.284): a link or unlink takes the org at its own start, so the next
    // one after a switch went with the new org's token — an unlink answered 200 ("unlinked already"), nothing written; a
    // link 404'd and "Link not added — Not found" was said on the new org's screen.
    const unlinkHere = async (doc) => {
        const askedOrg = requestOrg();
        for (const l of (doc.links || []).filter((x) => x.type === recordType && ids.has(x.recordId))) {
            if (!stillOrg(askedOrg)) return;   // the next unlink would carry the new org's token
            if (l.id && unlinkDocument && !(await unlinkDocument(doc.id, l.id)).ok) return;
        }
    };

    // A refused link says so in the app's message (useDocuments); the rest are not sent
    // (state §0.181).
    const linkExisting = async (picked) => {
        const askedOrg = requestOrg();
        setShowPicker(false);
        for (const d of picked) {
            if (!stillOrg(askedOrg)) return;   // the next link would carry the new org's token
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
                <div style={{ background: `${T.danger}14`, border: `1px solid ${T.danger}`, borderRadius: T.r, padding: '7px 10px', marginBottom: 8, fontSize: 12, color: T.danger, whiteSpace: 'pre-line' }}>{error}</div>
            )}
            {held && (
                <div style={{ background: `${T.danger}14`, border: `1px solid ${T.danger}`, borderRadius: T.r, padding: '7px 10px', marginBottom: 8, fontSize: 12, color: T.danger, whiteSpace: 'pre-line' }}>{heldWords(held, busy)}</div>
            )}
            {notice && (
                <div style={{ background: `${T.ok}12`, border: `1px solid ${T.ok}55`, borderRadius: T.r, padding: '7px 10px', marginBottom: 8, fontSize: 12, color: T.ink }}>{notice}</div>
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
