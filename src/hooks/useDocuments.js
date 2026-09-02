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
import { dbStatusOf } from '../utils/fetchStatus';
import { dbFetch, waitForToken } from '../utils/storage';
import {
    uploadNewDocument,
    uploadNewVersion,
    downloadDocument,
    previewDocument,
} from '../utils/documentsStorage';

const DOCS_FN = '/.netlify/functions/documents';

export function useDocuments(_deps = {}) {
    const [documents, setDocuments] = useState([]);
    const [docsLoading, setDocsLoading] = useState(false);
    const [docsError, setDocsError] = useState(null);

    // ── Library (global Documents tab) ──────────────────────────────────────
    const loadDocuments = useCallback(async (setDbOffline) => {
        setDocsLoading(true);
        setDocsError(null);
        try {
            await waitForToken();
            const r = await dbFetch(DOCS_FN);
            if (setDbOffline) setDbOffline(dbStatusOf(r));
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const data = await r.json();
            setDocuments(Array.isArray(data.documents) ? data.documents : []);
        } catch (e) {
            console.error('Failed to load documents:', e);
            setDocsError(e.message || 'Failed to load documents');
        } finally {
            setDocsLoading(false);
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
    const createDocument = useCallback(async (file, opts = {}) => {
        const doc = await uploadNewDocument(dbFetch, { file, ...opts });
        setDocuments((prev) => [doc, ...prev.filter((d) => d.id !== doc.id)]);
        return doc;
    }, []);

    // ── New version: upload bytes, bump server, optimistically patch state ──
    const addDocumentVersion = useCallback(async (documentId, file, { note, onProgress } = {}) => {
        const version = await uploadNewVersion(dbFetch, { documentId, file, note, onProgress });
        const sizeKb = Math.max(1, Math.round(file.size / 1024));
        setDocuments((prev) => prev.map((d) =>
            d.id === documentId ? { ...d, version, sizeKb, modifiedAt: new Date().toISOString() } : d));
        return version;
    }, []);

    // ── Metadata edit (name / category / note / visibility) ─────────────────
    const updateDocument = useCallback(async (id, patch) => {
        const r = await dbFetch(DOCS_FN, { method: 'PUT', body: JSON.stringify({ id, ...patch }) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        const updated = data.document || {};
        setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, ...updated } : d)));
        return updated;
    }, []);

    const removeDocument = useCallback(async (id) => {
        const r = await dbFetch(`${DOCS_FN}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        setDocuments((prev) => prev.filter((d) => d.id !== id));
    }, []);

    const restoreVersion = useCallback(async (id, v) => {
        const r = await dbFetch(`${DOCS_FN}?action=restore-version`, {
            method: 'POST', body: JSON.stringify({ id, v }),
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        setDocuments((prev) => prev.map((d) =>
            d.id === id ? { ...d, version: data.version, modifiedAt: new Date().toISOString() } : d));
        return data.version;
    }, []);

    // ── Links (cross-entity associations) ───────────────────────────────────
    // links: [{ type, recordId|id, name, sub }]
    const linkDocument = useCallback(async (id, links) => {
        const r = await dbFetch(`${DOCS_FN}?action=link`, {
            method: 'POST', body: JSON.stringify({ id, links }),
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        const added = Array.isArray(data.links) ? data.links : [];
        setDocuments((prev) => prev.map((d) =>
            d.id === id ? { ...d, links: [...(d.links || []), ...added] } : d));
        return added;
    }, []);

    const unlinkDocument = useCallback(async (id, linkId) => {
        const r = await dbFetch(`${DOCS_FN}?action=link&linkId=${encodeURIComponent(linkId)}`, { method: 'DELETE' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        setDocuments((prev) => prev.map((d) =>
            d.id === id ? { ...d, links: (d.links || []).filter((l) => l.id !== linkId) } : d));
    }, []);

    // ── Download / preview (signed R2 URL minted server-side) ───────────────
    const downloadDoc = useCallback((id, v) => downloadDocument(dbFetch, { id, v }), []);
    const previewDoc = useCallback((id, v) => previewDocument(dbFetch, { id, v }), []);

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
