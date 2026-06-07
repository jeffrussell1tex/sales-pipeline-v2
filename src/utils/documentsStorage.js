// src/utils/documentsStorage.js
// ════════════════════════════════════════════════════════════════════════════
// Client-side storage adapter for the Documents feature (Cloudflare R2).
//
// File bytes go BROWSER → R2 directly via a presigned PUT — they never pass
// through a Netlify function, so the 50 MB cap is unaffected by the ~6 MB
// function-body limit. Only small JSON calls (presign request, metadata
// create/version) go through dbFetch → /.netlify/functions/documents.
//
// The rest of the Documents UI imports these four functions and never touches
// R2 details directly:
//   uploadNewDocument(dbFetch, {...})   → presign → PUT → create row
//   uploadNewVersion(dbFetch, {...})    → presign(version) → PUT → bump version
//   downloadDocument(dbFetch, {...})    → signed GET → trigger browser download
//   previewDocument(dbFetch, {...})     → signed GET (inline) → open in new tab
// ════════════════════════════════════════════════════════════════════════════

const DOCS_FN = '/.netlify/functions/documents';

// dbFetch may return a raw Response OR already-parsed JSON depending on your
// storage.js (the coding guide and state doc disagree). This normalizes both;
// once I see storage.js I'll lock it to the real shape and drop the guard.
const asJson = async (r) => (r && typeof r.json === 'function' ? r.json() : r);

const extOf = (filename = '') => (filename.split('.').pop() || '').toLowerCase();
const baseName = (filename = '') => filename.replace(/\.[^.]+$/, '');
const kbOf = (file) => Math.max(1, Math.round(file.size / 1024));

// Allow-list mirrors the server; lets the UI reject early with a friendly message.
const ALLOWED_EXT = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'csv', 'txt',
]);
const MAX_SIZE_KB = 50 * 1024;

export function validateFile(file) {
  const ext = extOf(file.name);
  if (!ALLOWED_EXT.has(ext)) return `Unsupported file type: .${ext}`;
  if (kbOf(file) > MAX_SIZE_KB) return 'File exceeds the 50 MB limit';
  return null;
}

// PUT bytes straight to R2 with upload progress. fetch() can't report upload
// progress; XHR can, which the dropzone's progress bar needs. The Content-Type
// MUST match the ContentType the presigned URL was signed with, or R2 rejects.
function putToR2(uploadUrl, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300)
      ? resolve()
      : reject(new Error(`Upload failed (HTTP ${xhr.status})`));
    xhr.onerror = () => reject(new Error('Upload failed — check your connection'));
    xhr.ontimeout = () => reject(new Error('Upload timed out'));
    xhr.send(file);
  });
}

async function requestUploadUrl(dbFetch, { documentId, filename, contentType, sizeKb, kind }) {
  const res = await dbFetch(`${DOCS_FN}?action=upload-url`, {
    method: 'POST',
    body: JSON.stringify({ documentId, filename, contentType, sizeKb, kind }),
  });
  const data = await asJson(res);
  if (!data || data.error || !data.uploadUrl) throw new Error((data && data.error) || 'Could not start the upload');
  return data; // { storageKey, uploadUrl, version }
}

// Upload a brand-new document: presign → PUT to R2 → create the metadata row.
// `links` is [{ type, recordId|id, name, sub }]. Returns the created document.
export async function uploadNewDocument(dbFetch, {
  file, name, category = 'Note', visibility = 'team', visibilityUserIds = [],
  links = [], note = '', onProgress,
}) {
  const invalid = validateFile(file);
  if (invalid) throw new Error(invalid);

  const id = 'doc_' + crypto.randomUUID();
  const contentType = file.type || 'application/octet-stream';
  const sizeKb = kbOf(file);
  const ext = extOf(file.name);

  const { storageKey, uploadUrl } = await requestUploadUrl(dbFetch, {
    documentId: id, filename: file.name, contentType, sizeKb, kind: 'new',
  });
  await putToR2(uploadUrl, file, contentType, onProgress);

  const res = await dbFetch(DOCS_FN, {
    method: 'POST',
    body: JSON.stringify({
      id, name: name || baseName(file.name), ext, category, sizeKb,
      storageKey, contentType, visibility, visibilityUserIds, note, links,
    }),
  });
  const data = await asJson(res);
  if (!data || data.error || !data.document) {
    throw new Error((data && data.error) || 'File uploaded but the record failed to save');
  }
  return data.document;
}

// Upload a new version of an existing document. Returns the new version number.
export async function uploadNewVersion(dbFetch, { file, documentId, note = '', onProgress }) {
  const invalid = validateFile(file);
  if (invalid) throw new Error(invalid);

  const contentType = file.type || 'application/octet-stream';
  const sizeKb = kbOf(file);

  const { storageKey, uploadUrl } = await requestUploadUrl(dbFetch, {
    documentId, filename: file.name, contentType, sizeKb, kind: 'version',
  });
  await putToR2(uploadUrl, file, contentType, onProgress);

  const res = await dbFetch(`${DOCS_FN}?action=new-version`, {
    method: 'POST',
    body: JSON.stringify({ id: documentId, storageKey, sizeKb, contentType, note }),
  });
  const data = await asJson(res);
  if (!data || data.error) throw new Error((data && data.error) || 'New version failed to save');
  return data.version;
}

// Get a short-lived signed URL for the current version (or a specific `v`).
export async function getSignedUrlFor(dbFetch, { id, v, inline = false }) {
  const params = new URLSearchParams({ action: 'download', id });
  if (v) params.set('v', String(v));
  if (inline) params.set('disposition', 'inline');
  const res = await dbFetch(`${DOCS_FN}?${params.toString()}`, { method: 'GET' });
  const data = await asJson(res);
  if (!data || !data.url) throw new Error((data && data.error) || 'Could not get a download link');
  return data.url;
}

export async function downloadDocument(dbFetch, { id, v }) {
  const url = await getSignedUrlFor(dbFetch, { id, v, inline: false });
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function previewDocument(dbFetch, { id, v }) {
  const url = await getSignedUrlFor(dbFetch, { id, v, inline: true });
  window.open(url, '_blank', 'noopener');
}
