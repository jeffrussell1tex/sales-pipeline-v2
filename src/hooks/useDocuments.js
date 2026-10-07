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

import { useState, useCallback } from 'react';
import { dbStatusOf } from '../utils/fetchStatus.js';
import { dbFetch, waitForToken, requestOrg, stillOrg, refusalOf, NETWORK_ERROR } from '../utils/storage.js';
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
    try { res = await request; } catch { return { ok: false, error: NETWORK_ERROR }; }
    if (!res.ok) return { ok: false, error: await refusalOf(res) };
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
        const error = (e && e.message) || 'Could not get a download link';
        report(deps, askedOrg, `${label} failed — ${error}`);
        return { ok: false, error };
    }
}

export function useDocuments(_deps = {}) {
    const [documents, setDocuments] = useState([]);
    const [docsLoading, setDocsLoading] = useState(false);
    const [docsError, setDocsError] = useState(null);

    // ── Library (global Documents tab) ──────────────────────────────────────
    const loadDocuments = useCallback(async (setDbOffline) => {
        // This org's library only (state §0.173): an answer for an org switched
        // away from is dropped, and leaves the new org's load its own state.
        const askedOrg = requestOrg();
        setDocsLoading(true);
        setDocsError(null);
        try {
            await waitForToken();
            const r = await dbFetch(DOCS_FN);
            if (!stillOrg(askedOrg)) return;
            if (setDbOffline) setDbOffline(dbStatusOf(r));
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const data = await r.json();
            if (!stillOrg(askedOrg)) return;
            setDocuments(Array.isArray(data.documents) ? data.documents : []);
        } catch (e) {
            if (!stillOrg(askedOrg)) return;
            console.error('Failed to load documents:', e);
            setDocsError(e.message || 'Failed to load documents');
        } finally {
            if (stillOrg(askedOrg)) setDocsLoading(false);
        }
    }, []);

    // ── Reverse view: a single record's linked docs (Account/Opp/Contact/Task/Activity) ──
    const fetchRecordDocuments = useCallback(async (recordType, recordId) => {
        const params = new URLSearchParams({ linkedTo: recordId });
        if (recordType) params.set('type', recordType);
        const r = await dbFetch(`${DOCS_FN}?${params.toString()}`);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        return Array.isArray(data.documents) ? data.documents : [];
    }, []);

    // ── Version history for one document (detail rail) ──────────────────────
    // NOTE: backed by GET ?action=versions&id= — that endpoint ships in the
    // documents.mjs update that accompanies the Documents UI batch.
    const fetchVersions = useCallback(async (id) => {
        const r = await dbFetch(`${DOCS_FN}?action=versions&id=${encodeURIComponent(id)}`);
        if (!r.ok) throw new Error('HTTP ' + r.status);
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
        if (!r.ok) { report(_deps, askedOrg, `${editLabelOf(patch)} not saved — ${r.error}`); return r; }
        const updated = r.data.document || {};
        if (stillOrg(askedOrg)) setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, ...updated } : d)));
        return { ok: true, document: updated };
    }, []);

    const removeDocument = useCallback(async (id) => {
        const askedOrg = requestOrg();
        const r = await answerOf(dbFetch(`${DOCS_FN}?id=${encodeURIComponent(id)}`, { method: 'DELETE' }));
        if (!r.ok) { report(_deps, askedOrg, `Document not deleted — ${r.error}`); return r; }
        if (stillOrg(askedOrg)) setDocuments((prev) => prev.filter((d) => d.id !== id));
        return { ok: true };
    }, []);

    const restoreVersion = useCallback(async (id, v) => {
        const askedOrg = requestOrg();
        const r = await answerOf(dbFetch(`${DOCS_FN}?action=restore-version`, {
            method: 'POST', body: JSON.stringify({ id, v }),
        }));
        if (!r.ok) { report(_deps, askedOrg, `Version ${v} not restored — ${r.error}`); return r; }
        if (stillOrg(askedOrg)) setDocuments((prev) => prev.map((d) =>
            d.id === id ? { ...d, version: r.data.version, modifiedAt: new Date().toISOString() } : d));
        return { ok: true, version: r.data.version };
    }, []);

    // ── Links (cross-entity associations) ───────────────────────────────────
    // links: [{ type, recordId|id, name, sub }]
    const linkDocument = useCallback(async (id, links) => {
        const askedOrg = requestOrg();
        const r = await answerOf(dbFetch(`${DOCS_FN}?action=link`, {
            method: 'POST', body: JSON.stringify({ id, links }),
        }));
        if (!r.ok) { report(_deps, askedOrg, `${(links || []).length === 1 ? 'Link' : 'Links'} not added — ${r.error}`); return r; }
        const added = Array.isArray(r.data.links) ? r.data.links : [];
        if (stillOrg(askedOrg)) setDocuments((prev) => prev.map((d) =>
            d.id === id ? { ...d, links: [...(d.links || []), ...added] } : d));
        return { ok: true, links: added };
    }, []);

    const unlinkDocument = useCallback(async (id, linkId) => {
        const askedOrg = requestOrg();
        const r = await answerOf(dbFetch(`${DOCS_FN}?action=link&linkId=${encodeURIComponent(linkId)}`, { method: 'DELETE' }));
        if (!r.ok) { report(_deps, askedOrg, `Link not removed — ${r.error}`); return r; }
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
        fetchRecordDocuments,
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
