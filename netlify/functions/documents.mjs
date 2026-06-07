// netlify/functions/documents.mjs
// ════════════════════════════════════════════════════════════════════════════
// Documents capability — CRUD + bidirectional links + versioning + visibility,
// with presigned direct-to-bucket uploads/downloads on CLOUDFLARE R2.
//
// WHY PRESIGNED URLS: Netlify Functions cap the request/response body at ~6 MB.
// The spec allows files up to 50 MB, so blob bytes must NOT pass through this
// function. The browser PUTs bytes straight to R2 using a short-lived presigned
// URL this function mints, then POSTs only metadata back here. Downloads/
// previews are short-lived presigned GET URLs (R2 egress is free).
//
// This function still runs on Netlify exactly as your others do — R2 is only
// the object store the bytes live in. @aws-sdk/client-s3 is just the standard
// S3-API client library; R2 speaks the S3 API. No AWS account/service involved.
//
// REQUIRED ENV (Netlify UI):
//   R2_ENDPOINT           https://<ACCOUNT_ID>.r2.cloudflarestorage.com
//   R2_BUCKET             your bucket name
//   R2_ACCESS_KEY_ID      from an R2 API token
//   R2_SECRET_ACCESS_KEY  from an R2 API token
//
// DEPENDENCIES: npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
//
// R2 NOTES baked into the client below:
//   • region is hardcoded 'auto' — R2 ignores region but the SDK requires one.
//   • forcePathStyle: true — required for the R2 account endpoint.
//   • requestChecksumCalculation/responseChecksumValidation: 'WHEN_REQUIRED' —
//     aws-sdk-js >= 3.729 adds default CRC checksums that aren't part of the
//     signed presigned URL, which makes R2 reject the PUT ("headers not
//     signed"). WHEN_REQUIRED turns that off. Without it, uploads fail.
//
// CONTRACT ASSUMPTIONS (correct me if your real files differ):
//   • verifyAuth(event) → { userId, orgId, userRole, managedReps, userName?, error?, status? }
//   • serverErrorBody(err, label) + allowOrigin(event) live in ./_lib.mjs
//   • db from ../../db/index.js ; tables from ../../db/schema.js
// ════════════════════════════════════════════════════════════════════════════

import { db } from '../../db/index.js';
import { documents, documentLinks, documentVersions } from '../../db/schema.js';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';
import { serverErrorBody, allowOrigin } from './_lib.mjs';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ─── Config ──────────────────────────────────────────────────────────────────
const MAX_SIZE_KB = 50 * 1024; // 50 MB
const ALLOWED_EXT = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'csv', 'txt',
]);
const PUT_TTL = 600; // presigned upload URL lifetime (s)
const GET_TTL = 300; // presigned download URL lifetime (s)
const RECORD_TYPES = new Set(['account', 'contact', 'opportunity', 'task', 'activity']);

// ─── Cloudflare R2 client (S3 API) ───────────────────────────────────────────
let _r2;
function r2() {
  if (_r2) return _r2;
  _r2 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',  // see R2 NOTES above — required
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  return _r2;
}
const BUCKET = () => process.env.R2_BUCKET;

// ─── Helpers ─────────────────────────────────────────────────────────────────
const extOf = (filename = '') => (filename.split('.').pop() || '').toLowerCase();
const safeName = (s = '') => s.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 180);

// Blob key is namespaced by orgId FIRST — so even a leaked/forged key can never
// reach another tenant's bytes; we also re-validate the prefix on every mutation.
const buildKey = (orgId, docId, v, filename) =>
  `${orgId}/${docId}/v${v}/${safeName(filename)}`;
const keyBelongsTo = (key, orgId, docId) =>
  typeof key === 'string' && key.startsWith(`${orgId}/${docId}/`);

async function presignPut(key, contentType) {
  return getSignedUrl(r2(), new PutObjectCommand({ Bucket: BUCKET(), Key: key, ContentType: contentType }), { expiresIn: PUT_TTL });
}
async function presignGet(key, filename, disposition = 'attachment') {
  const cd = `${disposition}; filename="${safeName(filename || 'download')}"`;
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: BUCKET(), Key: key, ResponseContentDisposition: cd }), { expiresIn: GET_TTL });
}

// Visibility: a doc is visible to a requester when it's team-wide, owned by
// them, or 'specific' and lists them. Visibility is a property of the DOCUMENT
// and is independent of who can see a linked record — a Private file stays
// private even on a shared Account. (No admin bypass by default; flip here if
// you want admins to see everything for governance.)
function canSee(doc, userId /* , userRole */) {
  if (doc.visibilityKind === 'team') return true;
  if (doc.ownerId && doc.ownerId === userId) return true;
  if (doc.visibilityKind === 'specific') {
    const ids = Array.isArray(doc.visibilityUserIds) ? doc.visibilityUserIds : [];
    return ids.includes(userId);
  }
  return false; // 'private' and not owner
}

// Attach each document's links (one query for the whole page, grouped in JS).
async function withLinks(orgId, docs) {
  if (!docs.length) return [];
  const ids = docs.map((d) => d.id);
  const links = await db.select().from(documentLinks)
    .where(and(eq(documentLinks.orgId, orgId), inArray(documentLinks.documentId, ids)));
  const byDoc = new Map();
  for (const l of links) {
    if (!byDoc.has(l.documentId)) byDoc.set(l.documentId, []);
    byDoc.get(l.documentId).push({ id: l.id, type: l.recordType, recordId: l.recordId, name: l.recordName, sub: l.recordSub });
  }
  return docs.map((d) => ({
    ...d,
    visibility: d.visibilityKind, // flatten for the UI's VisibilityControl
    links: byDoc.get(d.id) || [],
  }));
}

export const handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowOrigin(event) || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  const auth = await verifyAuth(event);
  if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
  const { userId, orgId, userRole } = auth;

  const qs = event.queryStringParameters || {};
  const action = qs.action || '';

  try {
    // ── GET ──────────────────────────────────────────────────────────────────
    if (event.httpMethod === 'GET') {
      // Presigned download / preview for one document (or a specific version)
      if (action === 'download') {
        if (!qs.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
        const [doc] = await db.select().from(documents)
          .where(and(eq(documents.id, qs.id), eq(documents.orgId, orgId)));
        if (!doc) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
        if (!canSee(doc, userId, userRole)) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };

        let key = doc.storageKey;
        let fname = `${doc.name}.${doc.ext || 'bin'}`;
        if (qs.v) {
          const [ver] = await db.select().from(documentVersions)
            .where(and(eq(documentVersions.orgId, orgId), eq(documentVersions.documentId, doc.id), eq(documentVersions.v, Number(qs.v))));
          if (!ver) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Version not found' }) };
          key = ver.storageKey;
          fname = `${doc.name}-v${ver.v}.${doc.ext || 'bin'}`;
        }
        const disposition = qs.disposition === 'inline' ? 'inline' : 'attachment';
        const url = await presignGet(key, fname, disposition);
        return { statusCode: 200, headers, body: JSON.stringify({ url, expiresIn: GET_TTL }) };
      }

      // Version history for one document (detail rail)
      if (action === 'versions') {
        if (!qs.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
        const [doc] = await db.select().from(documents)
          .where(and(eq(documents.id, qs.id), eq(documents.orgId, orgId)));
        if (!doc) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
        if (!canSee(doc, userId, userRole)) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
        const vers = await db.select().from(documentVersions)
          .where(and(eq(documentVersions.orgId, orgId), eq(documentVersions.documentId, qs.id)))
          .orderBy(desc(documentVersions.v));
        return { statusCode: 200, headers, body: JSON.stringify({ versions: vers }) };
      }

      // A record's documents (reverse view: a tab or attachments strip)
      if (qs.linkedTo) {
        const recType = qs.type;
        if (recType && !RECORD_TYPES.has(recType)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'bad type' }) };
        const linkWhere = recType
          ? and(eq(documentLinks.orgId, orgId), eq(documentLinks.recordType, recType), eq(documentLinks.recordId, qs.linkedTo))
          : and(eq(documentLinks.orgId, orgId), eq(documentLinks.recordId, qs.linkedTo));
        const links = await db.select().from(documentLinks).where(linkWhere);
        const docIds = [...new Set(links.map((l) => l.documentId))];
        if (!docIds.length) return { statusCode: 200, headers, body: JSON.stringify({ documents: [] }) };
        const docs = await db.select().from(documents)
          .where(and(eq(documents.orgId, orgId), inArray(documents.id, docIds)));
        const visible = docs.filter((d) => canSee(d, userId, userRole));
        return { statusCode: 200, headers, body: JSON.stringify({ documents: await withLinks(orgId, visible) }) };
      }

      // Global library — all docs for org the requester may see.
      // NOTE: visibility 'specific' is filtered in JS; revisit with a SQL
      // predicate + cursor pagination once an org passes a few thousand files.
      const docs = await db.select().from(documents)
        .where(eq(documents.orgId, orgId)).orderBy(desc(documents.modifiedAt));
      const visible = docs.filter((d) => canSee(d, userId, userRole));
      return { statusCode: 200, headers, body: JSON.stringify({ documents: await withLinks(orgId, visible) }) };
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body || '{}');

      // 1) Mint a presigned PUT URL (client uploads bytes straight to R2)
      if (action === 'upload-url') {
        const { documentId, filename, contentType, sizeKb, kind = 'new' } = data;
        if (!documentId || !filename) return { statusCode: 400, headers, body: JSON.stringify({ error: 'documentId and filename required' }) };
        const ext = extOf(filename);
        if (!ALLOWED_EXT.has(ext)) return { statusCode: 415, headers, body: JSON.stringify({ error: `Unsupported file type: .${ext}` }) };
        if (Number(sizeKb) > MAX_SIZE_KB) return { statusCode: 413, headers, body: JSON.stringify({ error: 'File exceeds the 50 MB limit' }) };

        let v = 1;
        if (kind === 'version') {
          const [doc] = await db.select().from(documents)
            .where(and(eq(documents.id, documentId), eq(documents.orgId, orgId)));
          if (!doc) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Document not found' }) };
          v = (doc.version || 1) + 1;
        }
        const key = buildKey(orgId, documentId, v, filename);
        const uploadUrl = await presignPut(key, contentType || 'application/octet-stream');
        return { statusCode: 200, headers, body: JSON.stringify({ storageKey: key, uploadUrl, version: v, expiresIn: PUT_TTL }) };
      }

      // 2) Create the document row (after bytes are uploaded to storageKey)
      if (!action || action === 'create') {
        const { id, name, ext, category, sizeKb, storageKey, contentType, visibility, visibilityUserIds, note, links } = data;
        if (!id || !name) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id and name required' }) };
        if (!keyBelongsTo(storageKey, orgId, id)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'storageKey/org mismatch' }) };
        if (ext && !ALLOWED_EXT.has(String(ext).toLowerCase())) return { statusCode: 415, headers, body: JSON.stringify({ error: 'Unsupported file type' }) };

        const now = new Date();
        const row = {
          id, orgId, name, ext: (ext || '').toLowerCase(), category: category || 'Note',
          sizeKb: Number(sizeKb) || 0, ownerId: userId, ownerName: auth.userName || data.ownerName || 'Unknown',
          visibilityKind: visibility || 'team', visibilityUserIds: Array.isArray(visibilityUserIds) ? visibilityUserIds : [],
          version: 1, storageKey, contentType: contentType || null, note: note || null,
          uploadedAt: now, modifiedAt: now, createdAt: now, updatedAt: now,
        };
        await db.insert(documents).values(row)
          .onConflictDoUpdate({ target: documents.id, setWhere: eq(documents.orgId, orgId), set: { ...row, createdAt: undefined } });

        // version 1
        await db.insert(documentVersions).values({
          id: 'dvr_' + crypto.randomUUID(), orgId, documentId: id, v: 1,
          storageKey, sizeKb: Number(sizeKb) || 0, contentType: contentType || null,
          byId: userId, byName: row.ownerName, note: 'Initial upload', createdAt: now,
        });

        const inserted = await insertLinks(orgId, id, links);
        return { statusCode: 201, headers, body: JSON.stringify({ document: { ...row, visibility: row.visibilityKind, links: inserted } }) };
      }

      // 3) Append a new version
      if (action === 'new-version') {
        const { id, storageKey, sizeKb, contentType, note } = data;
        const [doc] = await db.select().from(documents)
          .where(and(eq(documents.id, id), eq(documents.orgId, orgId)));
        if (!doc) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
        if (!keyBelongsTo(storageKey, orgId, id)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'storageKey/org mismatch' }) };
        const v = (doc.version || 1) + 1;
        const now = new Date();
        await db.insert(documentVersions).values({
          id: 'dvr_' + crypto.randomUUID(), orgId, documentId: id, v,
          storageKey, sizeKb: Number(sizeKb) || 0, contentType: contentType || null,
          byId: userId, byName: auth.userName || 'Unknown', note: note || null, createdAt: now,
        });
        await db.update(documents)
          .set({ version: v, storageKey, sizeKb: Number(sizeKb) || 0, contentType: contentType || doc.contentType, modifiedAt: now, updatedAt: now })
          .where(and(eq(documents.id, id), eq(documents.orgId, orgId)));
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, version: v }) };
      }

      // 4) Restore a prior version (creates a NEW version pointing at the old blob)
      if (action === 'restore-version') {
        const { id, v: targetV } = data;
        const [doc] = await db.select().from(documents)
          .where(and(eq(documents.id, id), eq(documents.orgId, orgId)));
        if (!doc) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
        const [src] = await db.select().from(documentVersions)
          .where(and(eq(documentVersions.orgId, orgId), eq(documentVersions.documentId, id), eq(documentVersions.v, Number(targetV))));
        if (!src) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Version not found' }) };
        const v = (doc.version || 1) + 1;
        const now = new Date();
        await db.insert(documentVersions).values({
          id: 'dvr_' + crypto.randomUUID(), orgId, documentId: id, v,
          storageKey: src.storageKey, sizeKb: src.sizeKb, contentType: src.contentType,
          byId: userId, byName: auth.userName || 'Unknown', note: `Restored from v${src.v}`, createdAt: now,
        });
        await db.update(documents)
          .set({ version: v, storageKey: src.storageKey, sizeKb: src.sizeKb, modifiedAt: now, updatedAt: now })
          .where(and(eq(documents.id, id), eq(documents.orgId, orgId)));
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, version: v }) };
      }

      // 5) Add one or more links to an existing document
      if (action === 'link') {
        const { id, links } = data;
        const [doc] = await db.select().from(documents)
          .where(and(eq(documents.id, id), eq(documents.orgId, orgId)));
        if (!doc) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
        const inserted = await insertLinks(orgId, id, links);
        return { statusCode: 200, headers, body: JSON.stringify({ links: inserted }) };
      }

      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };
    }

    // ── PUT — update metadata (name / category / note / visibility) ───────────
    if (event.httpMethod === 'PUT') {
      const data = JSON.parse(event.body || '{}');
      if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
      const set = { updatedAt: new Date() };
      if ('name' in data) set.name = data.name;
      if ('category' in data) set.category = data.category;
      if ('note' in data) set.note = data.note;
      if ('visibility' in data) set.visibilityKind = data.visibility;
      if ('visibilityUserIds' in data) set.visibilityUserIds = Array.isArray(data.visibilityUserIds) ? data.visibilityUserIds : [];
      const [updated] = await db.update(documents).set(set)
        .where(and(eq(documents.id, data.id), eq(documents.orgId, orgId))).returning();
      if (!updated) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
      return { statusCode: 200, headers, body: JSON.stringify({ document: { ...updated, visibility: updated.visibilityKind } }) };
    }

    // ── DELETE — remove a link, or the whole document ─────────────────────────
    if (event.httpMethod === 'DELETE') {
      if (action === 'link') {
        const linkId = qs.linkId || (JSON.parse(event.body || '{}').linkId);
        if (!linkId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'linkId required' }) };
        await db.delete(documentLinks).where(and(eq(documentLinks.id, linkId), eq(documentLinks.orgId, orgId)));
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }
      const id = qs.id;
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
      // best-effort blob cleanup (don't fail the row delete on storage error)
      try {
        const vers = await db.select().from(documentVersions)
          .where(and(eq(documentVersions.orgId, orgId), eq(documentVersions.documentId, id)));
        await Promise.allSettled(vers.map((ver) =>
          r2().send(new DeleteObjectCommand({ Bucket: BUCKET(), Key: ver.storageKey }))));
      } catch (e) { console.warn('[documents] R2 cleanup failed', e?.message); }
      await db.delete(documentVersions).where(and(eq(documentVersions.orgId, orgId), eq(documentVersions.documentId, id)));
      await db.delete(documentLinks).where(and(eq(documentLinks.orgId, orgId), eq(documentLinks.documentId, id)));
      await db.delete(documents).where(and(eq(documents.id, id), eq(documents.orgId, orgId)));
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: serverErrorBody(err, 'documents') };
  }
};

// Insert links, de-duplicating against the unique (documentId, recordType, recordId) index.
async function insertLinks(orgId, documentId, links) {
  if (!Array.isArray(links) || !links.length) return [];
  const rows = links
    .filter((l) => l && RECORD_TYPES.has(l.type) && (l.recordId || l.id))
    .map((l) => ({
      id: 'dlk_' + crypto.randomUUID(), orgId, documentId,
      recordType: l.type, recordId: String(l.recordId || l.id),
      recordName: l.name || null, recordSub: l.sub || null, createdAt: new Date(),
    }));
  if (!rows.length) return [];
  const inserted = await db.insert(documentLinks).values(rows)
    .onConflictDoNothing({ target: [documentLinks.documentId, documentLinks.recordType, documentLinks.recordId] })
    .returning();
  return inserted.map((l) => ({ id: l.id, type: l.recordType, recordId: l.recordId, name: l.recordName, sub: l.recordSub }));
}
