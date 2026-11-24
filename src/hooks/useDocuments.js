// src/hooks/useDocuments.js
// ════════════════════════════════════════════════════════════════════════════
// Documents data hook — mirrors the useAccounts / useContacts pattern:
// takes the shared _deps object, owns the library list + load/mutation handlers,
// and is spread into appContextValue so tabs/rails read it via useApp().
//
// Every persistent mutation hits the server immediately (no local-only state):
// the storage adapter PUTs bytes to R2 + POSTs metadata, and we patch local
// state from the server's response rather than guessing it.
// ════════════════════════════════════════════════════════════════════════════

import { useState, useCallback, useRef } from 'react';
import { readList } from '../utils/listLoads.js';
import { dbFetch, waitForToken, requestOrg, stillOrg, refusalFrom, NETWORK_ERROR } from '../utils/storage.js';
import { readRefusal, failureWords, heardRefusal, maybeSaid } from '../utils/refusalWords.js';
import {
    uploadNewDocument,
    uploadNewVersion,
    downloadDocument,
    previewDocument,
} from '../utils/documentsStorage.js';

const DOCS_FN = '/.netlify/functions/documents';

// One document request's answer (state §0.181): { ok: true, data } — its body — or
// { ok: false, error } in the words dbWrite gives a refusal (storage.js refusalOf). It
// takes the dbFetch call itself, so each request stays in plain sight of the scans that
// read them. Never throws.
async function answerOf(request) {
    let res;
    // unknown since §0.261: anything but the server's own 4xx proves nothing — the edit may have landed. Its body read once:
    // its words as refusalOf says them (refusalFrom) and whether the server itself refused.
    try { res = await request; } catch { return { ok: false, error: NETWORK_ERROR, unknown: true }; }
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        return { ok: false, error: refusalFrom(res, body), unknown: !heardRefusal(res.status, body) };
    }
    try { return { ok: true, data: (await res.json()) || {} }; } catch { return { ok: true, data: {} }; }   // an empty body
}

// A refusal, in the app's message — for the org that asked only: after a switch it is
// not said under the new org's name (§0.175).
function report(deps, askedOrg, message) {
    if (!stillOrg(askedOrg)) return;
    const setUndoToast = deps.setUndoToast;
    if (setUndoToast) setUndoToast({ error: message });
}

// What a refused edit was: the field the document rail sent.
const EDIT_LABEL = { note: 'Description', category: 'Category', visibility: 'Visibility', visibilityUserIds: 'Visibility', name: 'Name' };
const editLabelOf = (patch) => EDIT_LABEL[Object.keys(patch || {})[0]] || 'Change';

// A download or a preview: a signed link from the server, opened by the browser. A link
// refused says so, as an edit does.
async function openFile(deps, open, label, id, v) {
    const askedOrg = requestOrg();
    try {
        await open(dbFetch, { id, v });
        return { ok: true };
    } catch (e) {
        // Plain words (§0.247, docs/design/refusal-sweep Part 8): documentsStorage's own words pass through; a request
        // that never left says so — it said "Download failed — Failed to fetch".
        const error = failureWords(e);
        report(deps, askedOrg, `${label} failed — ${error}`);
        return { ok: false, error };
    }
}

export function useDocuments(_deps = {}) {
    const [documents, setDocuments] = useState([]);
    const [docsLoading, setDocsLoading] = useState(false);
    const [docsError, setDocsError] = useState(null);

    // ── Library (global Documents tab) ──────────────────────────────────────
    const docsGen = useRef(0);
    const loadDocuments = useCallback(async () => {
        // This org's library only, and its latest load's answer (state §0.173, §0.294): one dropped leaves the load that
        // overtook it its own state.
        setDocsLoading(true);
        setDocsError(null);
        const { current, error } = await readList('documents', {
            read: () => dbFetch(DOCS_FN),
            take: setDocuments, gen: docsGen, report: _deps.reportLoad, wait: waitForToken,
        });
        if (!current) return;
        // A read refused or failed: the library says it couldn't be opened, and why (DocumentsTab, state §0.243) — the
        // server's words, else plain ones (readList) — never a parse error's or "Failed to fetch".
        setDocsError(error);
        setDocsLoading(false);
    }, []);   // eslint-disable-line react-hooks/exhaustive-deps

    // ── Version history for one document (detail rail) ──────────────────────
    // NOTE: backed by GET ?action=versions&id= — that endpoint ships in the
    // documents.mjs update that accompanies the Documents UI batch.
    // A refused history throws the server's words, else its status (§0.243's second fix round) — it threw "HTTP 403";
    // the document rail says them (failureWords) beside "Version history could not be loaded".
    const fetchVersions = useCallback(async (id) => {
        const r = await dbFetch(`${DOCS_FN}?action=versions&id=${encodeURIComponent(id)}`);
        if (!r.ok) throw new Error(await readRefusal(r));
        const data = await r.json();
        return Array.isArray(data.versions) ? data.versions : [];
    }, []);

    // ── Create: upload bytes to R2, persist metadata, prepend to state ──────
    // opts: { name, category, visibility, visibilityUserIds, links, note, onProgress }
    // After an org switch an answer changes nothing on screen (state §0.175); the
    // caller still gets its result.
    const createDocument = useCallback(async (file, opts = {}) => {
        const askedOrg = requestOrg();
        const doc = await uploadNewDocument(dbFetch, { file, ...opts });
        if (stillOrg(askedOrg)) setDocuments((prev) => [doc, ...prev.filter((d) => d.id !== doc.id)]);
        return doc;
    }, []);

    // ── New version: upload bytes, bump server, optimistically patch state ──
    const addDocumentVersion = useCallback(async (documentId, file, { note, onProgress } = {}) => {
        const askedOrg = requestOrg();
        const version = await uploadNewVersion(dbFetch, { documentId, file, note, onProgress });
        const sizeKb = Math.max(1, Math.round(file.size / 1024));
        if (stillOrg(askedOrg)) setDocuments((prev) => prev.map((d) =>
            d.id === documentId ? { ...d, version, sizeKb, modifiedAt: new Date().toISOString() } : d));
        return version;
    }, []);

    // ── Metadata edit (name / category / note / visibility) ─────────────────
    // Each edit below — a document's fields, its delete, a restore, a link, an unlink —
    // and a download or a preview says so when it is refused (state §0.181): what was not
    // done, and why, in the app's message; and it resolves { ok } — it never throws. A
    // screen sends one and moves on (the description on blur, a chip's ×, the library's
    // Delete), so each threw 'HTTP 403' into nothing: no screen caught it.
    const updateDocument = useCallback(async (id, patch) => {
        const askedOrg = requestOrg();
        const r = await answerOf(dbFetch(DOCS_FN, { method: 'PUT', body: JSON.stringify({ id, ...patch }) }));
        if (!r.ok) { report(_deps, askedOrg, r.unknown ? maybeSaid(editLabelOf(patch), 'saved', r.error) : `${editLabelOf(patch)} not saved — ${r.error}`); return r; }   // (state §0.261, the unknown-save rule — Jeff's Q2: an answer that proves nothing keeps the change, said as maybe)
        const updated = r.data.document || {};
        if (stillOrg(askedOrg)) setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, ...updated } : d)));
        return { ok: true, document: updated };
    }, []);

    const removeDocument = useCallback(async (id) => {
        const askedOrg = requestOrg();
        const r = await answerOf(dbFetch(`${DOCS_FN}?id=${encodeURIComponent(id)}`, { method: 'DELETE' }));
        if (!r.ok) { report(_deps, askedOrg, r.unknown ? maybeSaid('The document', 'deleted', r.error) : `Document not deleted — ${r.error}`); return r; }
        if (stillOrg(askedOrg)) setDocuments((prev) => prev.filter((d) => d.id !== id));
        return { ok: true };
    }, []);

    const restoreVersion = useCallback(async (id, v) => {
        const askedOrg = requestOrg();
        const r = await answerOf(dbFetch(`${DOCS_FN}?action=restore-version`, {
            method: 'POST', body: JSON.stringify({ id, v }),
        }));
        if (!r.ok) { report(_deps, askedOrg, r.unknown ? maybeSaid(`Version ${v}`, 'restored', r.error) : `Version ${v} not restored — ${r.error}`); return r; }
        // The document as the restore left it — its size and file the restored version's
        // (state §0.183); the version and the time alone kept the size restored over.
        if (stillOrg(askedOrg)) setDocuments((prev) => prev.map((d) =>
            d.id === id ? { ...d, modifiedAt: new Date().toISOString(), ...(r.data.document || {}), version: r.data.version } : d));
        return { ok: true, version: r.data.version };
    }, []);

    // ── Links (cross-entity associations) ───────────────────────────────────
    // links: [{ type, recordId|id, name, sub }]
    const linkDocument = useCallback(async (id, links) => {
        const askedOrg = requestOrg();
        const r = await answerOf(dbFetch(`${DOCS_FN}?action=link`, {
            method: 'POST', body: JSON.stringify({ id, links }),
        }));
        if (!r.ok) { const one = (links || []).length === 1; report(_deps, askedOrg, r.unknown ? maybeSaid(one ? 'The link' : 'The links', 'added', r.error, !one) : `${one ? 'Link' : 'Links'} not added — ${r.error}`); return r; }
        const added = Array.isArray(r.data.links) ? r.data.links : [];
        if (stillOrg(askedOrg)) setDocuments((prev) => prev.map((d) =>
            d.id === id ? { ...d, links: [...(d.links || []), ...added] } : d));
        return { ok: true, links: added };
    }, []);

    const unlinkDocument = useCallback(async (id, linkId) => {
        const askedOrg = requestOrg();
        const r = await answerOf(dbFetch(`${DOCS_FN}?action=link&linkId=${encodeURIComponent(linkId)}`, { method: 'DELETE' }));
        if (!r.ok) { report(_deps, askedOrg, r.unknown ? maybeSaid('The link', 'removed', r.error) : `Link not removed — ${r.error}`); return r; }
        if (stillOrg(askedOrg)) setDocuments((prev) => prev.map((d) =>
            d.id === id ? { ...d, links: (d.links || []).filter((l) => l.id !== linkId) } : d));
        return { ok: true };
    }, []);

    // ── Download / preview (signed R2 URL minted server-side) ───────────────
    const downloadDoc = useCallback((id, v) => openFile(_deps, downloadDocument, 'Download', id, v), []);
    const previewDoc = useCallback((id, v) => openFile(_deps, previewDocument, 'Preview', id, v), []);

    return {
        documents, setDocuments,
        docsLoading, docsError,
        loadDocuments,
        fetchVersions,
        createDocument,
        addDocumentVersion,
        updateDocument,
        removeDocument,
        restoreVersion,
        linkDocument,
        unlinkDocument,
        downloadDoc, previewDoc,
    };
}
