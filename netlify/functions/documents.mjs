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
import { documents, documentLinks, documentVersions, users, accounts, contacts, opportunities, tasks, activities } from '../../db/schema.js';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { verifyAuth, requireWrite } from './auth.mjs';
import { serverErrorBody, allowOrigin, auditAs, getCallerName, getCallerId } from './_lib.mjs';
import { isAdmin, crmReadScope, dealVisibleTo } from '../../src/utils/roles.js';
import { dealReadContext } from './_dealAccess.mjs';
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
// reach another tenant's bytes; every mutation re-checks the key it is given.
const buildKey = (orgId, docId, v, filename) =>
  `${orgId}/${docId}/v${v}/${safeName(filename)}`;
// The key must be one upload-url could have issued — buildKey's exact shape, for
// this org, this document and this version — never a client's own path under
// the prefix (state §0.166: the check took any key below it).
const KEY_SHAPE = /^[^/]+\/[^/]+\/v\d+\/[A-Za-z0-9._-]+$/;
const keyIs = (key, orgId, docId, v) =>
  typeof key === 'string' && key.startsWith(`${orgId}/${docId}/v${v}/`) && KEY_SHAPE.test(key);

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
//
// The viewer is who asks (state §0.183): their Clerk id — a document's owner is stored
// by it — their role, and their app id (users.id), which a Specific document lists the
// people it is shared with by: the roster's id, the one the picker offers.
function canSee(doc, viewer) {
  if (doc.visibilityKind === 'team') return true;
  if (doc.ownerId && doc.ownerId === viewer.userId) return true;
  if (doc.visibilityKind === 'specific') {
    const ids = Array.isArray(doc.visibilityUserIds) ? doc.visibilityUserIds : [];
    return !!viewer.appId && ids.includes(viewer.appId);
  }
  return false; // 'private' and not owner
}

// Who may change who sees a document, or delete it (state §0.183; Jeff: "Owner or an
// Admin"): its owner, or an Admin — one who can see it, since every write reads the
// document through writableDoc first. Anyone else who can see it may still change its
// name, category and description, its links and its versions.
const mayManage = (doc, viewer) => (!!doc.ownerId && doc.ownerId === viewer.userId) || isAdmin(viewer.userRole);

// The document a write acts on — in this org, and only when the caller may see it
// (state §0.182). Every read asked canSee; no write did, so a document a user could not
// see could still be changed, versioned, restored, linked, unlinked or deleted by its id.
// Returns { doc }, or { refusal } — the answer to send, in the reads' own words.
async function writableDoc(id, orgId, viewer, headers, missing = 'Not found') {
  if (!id) return { refusal: { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) } };
  const [doc] = await db.select().from(documents)
    .where(and(eq(documents.id, id), eq(documents.orgId, orgId)));
  if (!doc) return { refusal: { statusCode: 404, headers, body: JSON.stringify({ error: missing }) } };
  if (!canSee(doc, viewer)) return { refusal: { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) } };
  return { doc };
}

// Whom a document is shown to besides its owner (state §0.183): for 'specific', the people
// it names — this org's members, by their app id, at least one; for 'private' and 'team',
// no one listed. The list was taken unchecked, and no screen could fill it (§0.182 found
// (b)), so a Specific document was its owner's alone.
const VISIBILITY_KINDS = new Set(['private', 'team', 'specific']);
async function whoMaySee(orgId, kind, ids, headers) {
  const refuse = (error) => ({ refusal: { statusCode: 400, headers, body: JSON.stringify({ error }) } });
  if (!VISIBILITY_KINDS.has(kind)) return refuse('Unknown visibility.');
  if (kind !== 'specific') return { ids: [] };
  const wanted = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))];
  if (!wanted.length) return refuse('Choose at least one person to share it with.');
  const found = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.orgId, orgId), inArray(users.id, wanted)));
  if (found.length !== wanted.length) return refuse('Choose people from this organization.');
  return { ids: wanted };
}

// The records a document is linked to (state §0.183): each one of this org's that the
// caller can see — the read rule of its own list: a deal by dealVisibleTo, the others by
// crmReadScope (a rep's own and the unassigned) — and stored under its own name. A link
// took the record id, name and line the browser sent, unchecked (§0.182 found (d)). A
// record that is not there and one the caller cannot see answer alike: 404.
const LINKABLE = {
  account:     { table: accounts,      name: (r) => r.name },
  contact:     { table: contacts,      name: (r) => `${r.firstName || ''} ${r.lastName || ''}`.trim() },
  opportunity: { table: opportunities, name: (r) => r.opportunityName || r.account },
  task:        { table: tasks,         name: (r) => r.title },
  activity:    { table: activities,    name: (r) => r.subject || r.type },
};
async function resolveLinks(auth, viewer, links, headers) {
  const notFound = { refusal: { statusCode: 404, headers, body: JSON.stringify({ error: 'A record to link was not found.' }) } };
  const rows = [];
  let dealCtx = null;
  for (const l of Array.isArray(links) ? links : []) {
    const type = l && l.type;
    const recordId = l ? String(l.recordId || l.id || '') : '';
    if (!RECORD_TYPES.has(type) || !recordId) return { refusal: { statusCode: 400, headers, body: JSON.stringify({ error: 'A link needs a record type and id.' }) } };
    const { table, name } = LINKABLE[type];
    const [row] = await db.select().from(table).where(and(eq(table.id, recordId), eq(table.orgId, auth.orgId)));
    if (!row) return notFound;
    let visible;
    if (type === 'opportunity') {
      dealCtx = dealCtx || await dealReadContext(auth);
      visible = dealVisibleTo(row, dealCtx);
    } else {
      const scope = crmReadScope(auth.userRole);
      visible = scope === 'all' || (scope === 'own' && (!row.ownerId || row.ownerId === viewer.appId));
    }
    if (!visible) return notFound;
    rows.push({ type, recordId, name: name(row) || null, sub: null });
  }
  return { rows };
}

// Attach each document's links (one query for the whole page, grouped in JS).
async function withLinks(orgId, docs, viewer) {
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
    canManage: mayManage(d, viewer), // the screens offer Visibility and Delete by it (state §0.183)
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

  // The role gate for every write; then canSee() decides each read and — through
  // writableDoc() — each write to an existing document (state §0.182).
  const forbidden = requireWrite(auth, event, headers);
  if (forbidden) return forbidden;

  const qs = event.queryStringParameters || {};
  const action = qs.action || '';

  try {
    // Who asks (state §0.183): the app id is the roster's — null for a caller with no row
    // in this org, who then matches no Specific document.
    const viewer = { userId, userRole, appId: await getCallerId(userId, orgId) };

    // ── GET ──────────────────────────────────────────────────────────────────
    if (event.httpMethod === 'GET') {
      // Presigned download / preview for one document (or a specific version)
      if (action === 'download') {
        if (!qs.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
        const [doc] = await db.select().from(documents)
          .where(and(eq(documents.id, qs.id), eq(documents.orgId, orgId)));
        if (!doc) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
        if (!canSee(doc, viewer)) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };

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
        if (!canSee(doc, viewer)) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
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
        const visible = docs.filter((d) => canSee(d, viewer));
        return { statusCode: 200, headers, body: JSON.stringify({ documents: await withLinks(orgId, visible, viewer) }) };
      }

      // Global library — all docs for org the requester may see.
      // NOTE: visibility 'specific' is filtered in JS; revisit with a SQL
      // predicate + cursor pagination once an org passes a few thousand files.
      const docs = await db.select().from(documents)
        .where(eq(documents.orgId, orgId)).orderBy(desc(documents.modifiedAt));
      const visible = docs.filter((d) => canSee(d, viewer));
      return { statusCode: 200, headers, body: JSON.stringify({ documents: await withLinks(orgId, visible, viewer) }) };
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
          const { doc, refusal } = await writableDoc(documentId, orgId, viewer, headers, 'Document not found');
          if (refusal) return refusal;
          v = (doc.version || 1) + 1;
        } else {
          // A new document's id is new (state §0.182): an id a document already holds —
          // this org's or another's — is refused, so an upload URL is never minted for an
          // existing document's version-1 object, which a PUT to it would overwrite.
          const [taken] = await db.select({ id: documents.id }).from(documents).where(eq(documents.id, documentId));
          if (taken) return { statusCode: 409, headers, body: JSON.stringify({ error: 'That document id is already in use.' }) };
        }
        const key = buildKey(orgId, documentId, v, filename);
        const uploadUrl = await presignPut(key, contentType || 'application/octet-stream');
        return { statusCode: 200, headers, body: JSON.stringify({ storageKey: key, uploadUrl, version: v, expiresIn: PUT_TTL }) };
      }

      // 2) Create the document row (after bytes are uploaded to storageKey)
      if (!action || action === 'create') {
        const { id, name, ext, category, sizeKb, storageKey, contentType, visibility, visibilityUserIds, note, links: asked } = data;
        if (!id || !name) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id and name required' }) };
        if (!keyIs(storageKey, orgId, id, 1)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'storageKey/org mismatch' }) };
        if (ext && !ALLOWED_EXT.has(String(ext).toLowerCase())) return { statusCode: 415, headers, body: JSON.stringify({ error: 'Unsupported file type' }) };
        // Who sees it, and what it is linked to, are checked before anything is written
        // (state §0.183): the people this org's, the records ones the caller can see.
        const who = await whoMaySee(orgId, visibility || 'team', visibilityUserIds, headers);
        if (who.refusal) return who.refusal;
        const linked = await resolveLinks(auth, viewer, asked, headers);
        if (linked.refusal) return linked.refusal;
        const links = linked.rows;

        const now = new Date();
        const row = {
          id, orgId, name, ext: (ext || '').toLowerCase(), category: category || 'Note',
          // The caller's roster name (state §0.166). verifyAuth has never carried a
          // userName, so every document and version read "Unknown"; a name the
          // client sends is not taken for who did it.
          sizeKb: Number(sizeKb) || 0, ownerId: userId, ownerName: (await getCallerName(userId, orgId)) || 'Unknown',
          visibilityKind: visibility || 'team', visibilityUserIds: who.ids,
          version: 1, storageKey, contentType: contentType || null, note: note || null,
          uploadedAt: now, modifiedAt: now, createdAt: now, updatedAt: now,
        };
        // A create never takes over an id (state §0.166). The upsert this was wrote
        // nothing for an id another org holds — and the version and link rows below
        // went in anyway, against that org's document (the links' unique index
        // ignores the org, so one could block that org's own link). An id this org
        // holds is refused too: a create resets a document to version 1, and
        // changing one is PUT, a new file is new-version.
        const [created] = await db.insert(documents).values(row)
          .onConflictDoNothing({ target: documents.id })
          .returning({ id: documents.id });
        if (!created) return { statusCode: 409, headers, body: JSON.stringify({ error: 'That document id is already in use.' }) };

        // version 1
        await db.insert(documentVersions).values({
          id: 'dvr_' + crypto.randomUUID(), orgId, documentId: id, v: 1,
          storageKey, sizeKb: Number(sizeKb) || 0, contentType: contentType || null,
          byId: userId, byName: row.ownerName, note: 'Initial upload', createdAt: now,
        });

        const inserted = await insertLinks(orgId, id, links);
        await auditAs(orgId, userId, { action: 'document.created', entityType: 'document', entityId: id, entityName: name, detail: `${row.category} · ${row.ext || 'file'} · ${row.sizeKb} KB · ${row.visibilityKind}${inserted.length ? ` · linked to ${inserted.length}` : ''}` });
        return { statusCode: 201, headers, body: JSON.stringify({ document: { ...row, visibility: row.visibilityKind, canManage: mayManage(row, viewer), links: inserted } }) };
      }

      // 3) Append a new version
      if (action === 'new-version') {
        const { id, storageKey, sizeKb, contentType, note } = data;
        const { doc, refusal } = await writableDoc(id, orgId, viewer, headers);
        if (refusal) return refusal;
        const v = (doc.version || 1) + 1;
        if (!keyIs(storageKey, orgId, id, v)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'storageKey/org mismatch' }) };
        const now = new Date();
        await db.insert(documentVersions).values({
          id: 'dvr_' + crypto.randomUUID(), orgId, documentId: id, v,
          storageKey, sizeKb: Number(sizeKb) || 0, contentType: contentType || null,
          byId: userId, byName: (await getCallerName(userId, orgId)) || 'Unknown', note: note || null, createdAt: now,
        });
        await db.update(documents)
          .set({ version: v, storageKey, sizeKb: Number(sizeKb) || 0, contentType: contentType || doc.contentType, modifiedAt: now, updatedAt: now })
          .where(and(eq(documents.id, id), eq(documents.orgId, orgId)));
        await auditAs(orgId, userId, { action: 'document.version_added', entityType: 'document', entityId: id, entityName: doc.name, detail: `v${v} · ${Number(sizeKb) || 0} KB${note ? ' · ' + String(note).slice(0, 120) : ''}` });
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, version: v }) };
      }

      // 4) Restore a prior version (creates a NEW version pointing at the old blob)
      if (action === 'restore-version') {
        const { id, v: targetV } = data;
        const { doc, refusal } = await writableDoc(id, orgId, viewer, headers);
        if (refusal) return refusal;
        const [src] = await db.select().from(documentVersions)
          .where(and(eq(documentVersions.orgId, orgId), eq(documentVersions.documentId, id), eq(documentVersions.v, Number(targetV))));
        if (!src) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Version not found' }) };
        const v = (doc.version || 1) + 1;
        const now = new Date();
        await db.insert(documentVersions).values({
          id: 'dvr_' + crypto.randomUUID(), orgId, documentId: id, v,
          storageKey: src.storageKey, sizeKb: src.sizeKb, contentType: src.contentType,
          byId: userId, byName: (await getCallerName(userId, orgId)) || 'Unknown', note: `Restored from v${src.v}`, createdAt: now,
        });
        const [restored] = await db.update(documents)
          .set({ version: v, storageKey: src.storageKey, sizeKb: src.sizeKb, modifiedAt: now, updatedAt: now })
          .where(and(eq(documents.id, id), eq(documents.orgId, orgId))).returning();
        await auditAs(orgId, userId, { action: 'document.version_restored', entityType: 'document', entityId: id, entityName: doc.name, detail: `v${v} restored from v${src.v}` });
        // The document as the restore left it (state §0.183): its size and file are the
        // restored version's — the answer was the number alone, and the screens kept the
        // size of the version restored over.
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, version: v, document: restored ? { ...restored, visibility: restored.visibilityKind } : null }) };
      }

      // 5) Add one or more links to an existing document
      if (action === 'link') {
        const { id, links: asked } = data;
        const { doc, refusal } = await writableDoc(id, orgId, viewer, headers);
        if (refusal) return refusal;
        const linked = await resolveLinks(auth, viewer, asked, headers);
        if (linked.refusal) return linked.refusal;
        const inserted = await insertLinks(orgId, id, linked.rows);
        if (inserted.length) await auditAs(orgId, userId, { action: 'document.linked', entityType: 'document', entityId: id, entityName: doc.name, detail: inserted.map(l => `${l.type} ${l.name || l.recordId}`).join(', ').slice(0, 300) });
        return { statusCode: 200, headers, body: JSON.stringify({ links: inserted }) };
      }

      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };
    }

    // ── PUT — update metadata (name / category / note / visibility) ───────────
    if (event.httpMethod === 'PUT') {
      const data = JSON.parse(event.body || '{}');
      if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
      const { doc, refusal } = await writableDoc(data.id, orgId, viewer, headers);
      if (refusal) return refusal;
      const set = { updatedAt: new Date() };
      if ('name' in data) set.name = data.name;
      if ('category' in data) set.category = data.category;
      if ('note' in data) set.note = data.note;
      // Who sees it is changed by its owner or an Admin (state §0.183), to a list this
      // org's members fill — and a kind other than Specific keeps no list.
      if ('visibility' in data || 'visibilityUserIds' in data) {
        if (!mayManage(doc, viewer)) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Only the document\'s owner or an Admin can change who sees it.' }) };
        const kind = 'visibility' in data ? data.visibility : doc.visibilityKind;
        const who = await whoMaySee(orgId, kind, 'visibilityUserIds' in data ? data.visibilityUserIds : doc.visibilityUserIds, headers);
        if (who.refusal) return who.refusal;
        set.visibilityKind = kind;
        set.visibilityUserIds = who.ids;
      }
      const [updated] = await db.update(documents).set(set)
        .where(and(eq(documents.id, data.id), eq(documents.orgId, orgId))).returning();
      if (!updated) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
      await auditAs(orgId, userId, { action: 'document.updated', entityType: 'document', entityId: updated.id, entityName: updated.name, detail: Object.keys(set).filter(k => k !== 'updatedAt').join(', ') || null });
      return { statusCode: 200, headers, body: JSON.stringify({ document: { ...updated, visibility: updated.visibilityKind, canManage: mayManage(updated, viewer) } }) };
    }

    // ── DELETE — remove a link, or the whole document ─────────────────────────
    if (event.httpMethod === 'DELETE') {
      if (action === 'link') {
        const linkId = qs.linkId || (JSON.parse(event.body || '{}').linkId);
        if (!linkId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'linkId required' }) };
        // The link's document must be one the caller may see (state §0.182); a link that
        // is not there is not refused — it is unlinked already.
        const [link] = await db.select({ documentId: documentLinks.documentId }).from(documentLinks)
          .where(and(eq(documentLinks.id, linkId), eq(documentLinks.orgId, orgId)));
        if (link) {
          const { refusal } = await writableDoc(link.documentId, orgId, viewer, headers);
          if (refusal) return refusal;
        }
        const [unlinked] = await db.delete(documentLinks).where(and(eq(documentLinks.id, linkId), eq(documentLinks.orgId, orgId)))
          .returning({ documentId: documentLinks.documentId, recordType: documentLinks.recordType, recordName: documentLinks.recordName, recordId: documentLinks.recordId });
        if (unlinked) await auditAs(orgId, userId, { action: 'document.unlinked', entityType: 'document', entityId: unlinked.documentId, entityName: null, detail: `${unlinked.recordType} ${unlinked.recordName || unlinked.recordId}` });
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }
      const id = qs.id;
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
      // Only a document the caller may see is deleted (state §0.182); one that is not
      // there is not refused — it is deleted already, as before.
      const { doc: doomed, refusal } = await writableDoc(id, orgId, viewer, headers);
      if (refusal && refusal.statusCode !== 404) return refusal;
      // ...by its owner or an Admin (state §0.183; Jeff: "Owner or an Admin").
      if (doomed && !mayManage(doomed, viewer)) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Only the document\'s owner or an Admin can delete it.' }) };
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
      if (doomed) await auditAs(orgId, userId, { action: 'document.deleted', entityType: 'document', entityId: id, entityName: doomed.name, detail: `${doomed.version || 1} version${(doomed.version || 1) === 1 ? '' : 's'} removed` });
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
