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

import { requestOrg, stillOrg, stopped } from './storage.js';
import { readRefusal, refusalWords, failureWords } from './refusalWords.js';

const DOCS_FN = '/.netlify/functions/documents';

// An upload answers only in the org that asked (state §0.175). It is three
// requests — presign, the bytes to R2, the record — and one cut by an org switch
// stops there and never settles: the next request would carry the new org's
// token and file the last org's upload in it. Its callers are the upload rail and
// a record's Documents list, both remounted by a switch, so nothing waits on it.

// What a member is told (§0.249, docs/design/refusal-sweep Part 12; guide §18b125 rule 5): dbFetch always answers a
// Response (storage.js), so each request here checks res.ok before it reads a body — a refusal throws readRefusal's
// words (the server's, with their ref, else "The server returned N."), never a 502 page's parse error or a 200's
// `error` read as the answer; a request that never left throws "The server could not be reached." (failureWords). The
// upload rail and a record's Documents list say a thrown upload's words as they are (failureWords), so the words are the
// house's here. (asJson, which took either a Response or parsed JSON, is gone: dbFetch never answers parsed JSON.)
// Each upload's words name the step that stopped it (§0.249, the review): "The server returned 403." alone named neither
// the upload nor R2 — a presign refused and R2's PUT refused read the same. A file put to R2 with no record is no
// document, so the record's refusal says the document (or the new version) was not saved.
const STEP_START = 'The upload could not start';
const STEP_STORE = 'The file was not stored';
const STEP_RECORD = 'The document was not saved';
const STEP_VERSION = 'The new version was not saved';
const stepped = (step, words) => (step ? `${step} — ${words}` : words);
// A record that landed with an answer that cannot be read is made, not failed: `landed` tells the upload rail and a
// record's Documents never to offer the same press again — a second one mints a new id and writes the file twice.
const landedUnread = (words) => Object.assign(new Error(words), { landed: true });
// A record's answer that may have come after a write (§0.249, the review, round 2): the create writes the document, its
// first version and its links one after another, with no transaction, and a new version its row then the document's
// number (documents.mjs) — every 4xx the server sends with its words returns before the first write, so only those say
// "not saved". A 5xx, a gateway's page, a 4xx without the server's words or a request that threw (it may have reached the
// server before it did) may have written it: said so, with the words, as the quota board's save says it (SalesManagerTab
// sendQuotas), and marked landed — the rail and a record's Documents let the file go, never offering a second press that
// mints a new id and writes the file twice; `maybe` says it in the red box. A presign stores nothing and R2's PUT makes no
// document, so their failures stay a retry.
const MAYBE_RECORD = 'The document may have been saved — reload the page to see whether it was';
const MAYBE_VERSION = 'The new version may have been saved — reload the page to see whether it was';
const landedMaybe = (maybe, words) => Object.assign(landedUnread(`${maybe}: ${words}`), { maybe: true });
// A record's refused answer, its body read: "not saved" only for the server's own refusal (a 4xx with its words), else
// maybe saved.
const recordRefusal = (res, body, step, maybe) => {
  const why = refusalWords(res, body);
  const own = res.status >= 400 && res.status < 500 && !!body && typeof body.error === 'string' && !!body.error.trim();
  return own ? new Error(stepped(step, why)) : landedMaybe(maybe, why);
};
// An upload's own requests name the org that asked: one that failed after a switch never settles (state §0.175).
// A record's request names `maybe`: one that threw may have reached the server first — maybe saved, never "not saved".
const reached = async (request, askedOrg, step, maybe = false) => {
  try { return await request; } catch (e) {
    if (askedOrg !== undefined && !stillOrg(askedOrg)) return stopped();
    if (maybe) throw landedMaybe(step, failureWords(e));
    throw new Error(stepped(step, failureWords(e)));
  }
};
// What R2 said to a refused PUT: its words when its body is JSON that holds them, else its status.
const r2Refusal = (xhr) => {
  let body = null;
  try { body = JSON.parse(xhr.responseText); } catch { /* R2 answers XML, or nothing */ }
  return refusalWords({ status: xhr.status }, body);
};

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
      : reject(new Error(stepped(STEP_STORE, r2Refusal(xhr))));
    xhr.onerror = () => reject(new Error(stepped(STEP_STORE, 'The server could not be reached.')));
    xhr.ontimeout = () => reject(new Error('Upload timed out'));
    xhr.send(file);
  });
}

async function requestUploadUrl(dbFetch, { documentId, filename, contentType, sizeKb, kind }, askedOrg) {
  const res = await reached(dbFetch(`${DOCS_FN}?action=upload-url`, {
    method: 'POST',
    body: JSON.stringify({ documentId, filename, contentType, sizeKb, kind }),
  }), askedOrg, STEP_START);
  if (!stillOrg(askedOrg)) return stopped();
  if (!res.ok) {
    const why = await readRefusal(res);
    if (!stillOrg(askedOrg)) return stopped();
    throw new Error(stepped(STEP_START, why));
  }
  const data = await res.json().catch(() => null);
  // A link to put the file to, or nothing can be sent (a presign stores nothing).
  if (!data || typeof data.uploadUrl !== 'string' || !data.uploadUrl) throw new Error('The upload could not start — Its answer could not be read.');
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

  const askedOrg = requestOrg();
  const id = 'doc_' + crypto.randomUUID();
  const contentType = file.type || 'application/octet-stream';
  const sizeKb = kbOf(file);
  const ext = extOf(file.name);

  const { storageKey, uploadUrl } = await requestUploadUrl(dbFetch, {
    documentId: id, filename: file.name, contentType, sizeKb, kind: 'new',
  }, askedOrg);
  if (!stillOrg(askedOrg)) return stopped();
  await putToR2(uploadUrl, file, contentType, onProgress).catch((e) => { if (!stillOrg(askedOrg)) return stopped(); throw e; });
  if (!stillOrg(askedOrg)) return stopped();

  const res = await reached(dbFetch(DOCS_FN, {
    method: 'POST',
    body: JSON.stringify({
      id, name: name || baseName(file.name), ext, category, sizeKb,
      storageKey, contentType, visibility, visibilityUserIds, note, links,
    }),
  }), askedOrg, MAYBE_RECORD, true);
  if (!stillOrg(askedOrg)) return stopped();
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (!stillOrg(askedOrg)) return stopped();
    throw recordRefusal(res, body, STEP_RECORD, MAYBE_RECORD);
  }
  const data = await res.json().catch(() => null);
  if (!stillOrg(askedOrg)) return stopped();
  // Made, with an answer that cannot be read: the document's links, owner and access are the server's, so there is no
  // row to show — said as made, never as "failed to save" (it said so over a record that was saved); marked landed, so
  // its callers let the file go.
  if (!data || !data.document || typeof data.document !== 'object') {
    throw landedUnread('The file was uploaded. Its answer could not be read — reload the page to see it.');
  }
  return data.document;
}

// Upload a new version of an existing document. Returns the new version number.
export async function uploadNewVersion(dbFetch, { file, documentId, note = '', onProgress }) {
  const invalid = validateFile(file);
  if (invalid) throw new Error(invalid);

  const askedOrg = requestOrg();
  const contentType = file.type || 'application/octet-stream';
  const sizeKb = kbOf(file);

  const { storageKey, uploadUrl, version: presigned } = await requestUploadUrl(dbFetch, {
    documentId, filename: file.name, contentType, sizeKb, kind: 'version',
  }, askedOrg);
  if (!stillOrg(askedOrg)) return stopped();
  await putToR2(uploadUrl, file, contentType, onProgress).catch((e) => { if (!stillOrg(askedOrg)) return stopped(); throw e; });
  if (!stillOrg(askedOrg)) return stopped();

  const res = await reached(dbFetch(`${DOCS_FN}?action=new-version`, {
    method: 'POST',
    body: JSON.stringify({ id: documentId, storageKey, sizeKb, contentType, note }),
  }), askedOrg, MAYBE_VERSION, true);
  if (!stillOrg(askedOrg)) return stopped();
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (!stillOrg(askedOrg)) return stopped();
    throw recordRefusal(res, body, STEP_VERSION, MAYBE_VERSION);
  }
  const data = await res.json().catch(() => null);
  if (!stillOrg(askedOrg)) return stopped();
  if (data && Number.isInteger(data.version)) return data.version;
  // Landed, with an answer that cannot be read: the version is the one presigned — the server stores a new version only
  // under the key it presigned for that number (documents.mjs keyIs) — so it is taken as landed.
  if (Number.isInteger(presigned)) return presigned;
  throw landedUnread('The new version was uploaded. Its answer could not be read — reload the page to see it.');
}

// Get a short-lived signed URL for the current version (or a specific `v`).
export async function getSignedUrlFor(dbFetch, { id, v, inline = false }) {
  const params = new URLSearchParams({ action: 'download', id });
  if (v) params.set('v', String(v));
  if (inline) params.set('disposition', 'inline');
  const res = await reached(dbFetch(`${DOCS_FN}?${params.toString()}`, { method: 'GET' }));
  if (!res.ok) throw new Error(await readRefusal(res));
  const data = await res.json().catch(() => null);
  if (!data || typeof data.url !== 'string' || !data.url) throw new Error('Its answer could not be read.');
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
