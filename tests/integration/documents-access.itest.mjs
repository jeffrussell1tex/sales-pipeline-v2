// tests/integration/documents-access.itest.mjs
// A document's writes ask what its reads ask (state §0.182 — §0.181's found (b);
// Jeff: "2. Visibility check on writes"), against the real test database. Every read
// checked canSee — a team document, the caller's own, or a 'specific' one naming
// them — and no write did: a document a user could not see could still be changed,
// versioned, restored, linked, unlinked or deleted by its id, and an upload URL could
// be minted for an existing document's version-1 object.
//
// Proves, in org A: a rep is refused every write to another rep's PRIVATE document —
// 403, the row, its versions and its link unchanged, no audit line; an Admin too
// (canSee has no Admin bypass, on a read or a write); the owner may do each; a TEAM
// document is open to any writer, a SPECIFIC one to the people it names; a link's
// DELETE asks of the link's document; a delete or an unlink of nothing is done, not
// refused; an upload URL for a new document is refused an id a document holds — this
// org's or org B's; and org B's document answers org A 404, untouched.
//
// The auth mock fakes the SIGN-IN only and re-exports the real gate and predicates;
// R2 is stubbed — an upload URL is minted here and nothing is sent.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const roles = await import('../../src/utils/roles.js');
const roleGate = await import('../../netlify/functions/_roleGate.mjs');

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            const userRole = event.headers?.['x-test-role'] || 'User';
            const userId = event.headers?.['x-test-user'] || 'clerk_itest_docacc_nobody';
            return { userId, orgId, userRole, managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: roleGate.requireWrite, requireRole: roleGate.requireRole,
    },
});
// R2: a command is a record of its input; a send is recorded and answers; a signed URL
// names its key. Nothing leaves this process.
const r2Sent = [];
const command = class { constructor(input) { this.input = input; } };
mock.module('@aws-sdk/client-s3', {
    namedExports: {
        S3Client: class { async send(cmd) { r2Sent.push(cmd.input); return {}; } },
        PutObjectCommand: command, GetObjectCommand: command, DeleteObjectCommand: command,
    },
});
mock.module('@aws-sdk/s3-request-presigner', {
    namedExports: { getSignedUrl: async (_client, cmd) => `https://r2.test/${cmd.input.Key}` },
});

const { handler } = await import('../../netlify/functions/documents.mjs');
const { db } = await import('../../db/index.js');
const { documents, documentVersions, documentLinks, auditLog } = await import('../../db/schema.js');
const { eq, and, inArray } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

// ORG NAMESPACE: this file owns 'itest_docacc_*' (orgs, ids, users).
const A = 'itest_docacc_A', B = 'itest_docacc_B';
const ORGS = [A, B];
const OWNER = 'clerk_itest_docacc_owner', REP = 'clerk_itest_docacc_rep', NAMED = 'clerk_itest_docacc_named', ADMIN = 'clerk_itest_docacc_admin';
const PRIV = 'doc_itest_docacc_priv', TEAM = 'doc_itest_docacc_team', SPEC = 'doc_itest_docacc_spec', B_DOC = 'doc_itest_docacc_b';
const LINK_PRIV = 'dlk_itest_docacc_priv', LINK_TEAM = 'dlk_itest_docacc_team';

const call = async (method, { org = A, user = REP, role = 'User', qs = {}, body } = {}) => {
    const res = await handler({
        httpMethod: method,
        headers: { 'x-test-org': org, 'x-test-user': user, 'x-test-role': role, 'content-type': 'application/json' },
        queryStringParameters: qs,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    let parsed = {};
    try { parsed = JSON.parse(res.body || '{}'); } catch { /* not JSON */ }
    return { status: res.statusCode, body: parsed };
};
const docRow = async (id, org = A) => (await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.orgId, org))))[0];
const versionsOf = async (id, org = A) => db.select().from(documentVersions).where(and(eq(documentVersions.documentId, id), eq(documentVersions.orgId, org)));
const linksOf = async (id, org = A) => db.select().from(documentLinks).where(and(eq(documentLinks.documentId, id), eq(documentLinks.orgId, org)));
const auditFor = async (id) => db.select().from(auditLog).where(and(inArray(auditLog.orgId, ORGS), eq(auditLog.entityId, id)));

// Every write a screen sends, against one document — as the given caller.
const WRITES = (id, linkId, as) => [
    ['PUT a field', () => call('PUT', { ...as, body: { id, note: 'not theirs' } })],
    ['an upload URL for a new version', () => call('POST', { ...as, qs: { action: 'upload-url' }, body: { documentId: id, filename: 'x.pdf', sizeKb: 1, kind: 'version' } })],
    ['a new version', () => call('POST', { ...as, qs: { action: 'new-version' }, body: { id, storageKey: `${A}/${id}/v3/x.pdf`, sizeKb: 1 } })],
    ['a restore', () => call('POST', { ...as, qs: { action: 'restore-version' }, body: { id, v: 1 } })],
    ['a link', () => call('POST', { ...as, qs: { action: 'link' }, body: { id, links: [{ type: 'task', recordId: 'task_itest_docacc', name: 'T' }] } })],
    ['an unlink', () => call('DELETE', { ...as, qs: { action: 'link', linkId } })],
    ['a delete', () => call('DELETE', { ...as, qs: { id } })],
];

const cleanup = async () => {
    for (const t of [documentLinks, documentVersions, documents, auditLog]) {
        await db.delete(t).where(inArray(t.orgId, ORGS));
    }
};

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    const now = new Date();
    const doc = (id, org, owner, visibilityKind, version, visibilityUserIds = []) => ({
        id, orgId: org, name: id, ext: 'pdf', category: 'Note', sizeKb: 1, ownerId: owner, ownerName: 'Owner',
        visibilityKind, visibilityUserIds, version, storageKey: `${org}/${id}/v${version}/f.pdf`, note: 'as seeded',
        uploadedAt: now, modifiedAt: now, createdAt: now, updatedAt: now,
    });
    await db.insert(documents).values([
        doc(PRIV, A, OWNER, 'private', 2),
        doc(TEAM, A, OWNER, 'team', 1),
        doc(SPEC, A, OWNER, 'specific', 1, [NAMED]),
        doc(B_DOC, B, 'clerk_itest_docacc_b', 'team', 1),
    ]);
    const ver = (docId, org, v) => ({ id: `dvr_itest_docacc_${docId.slice(-4)}_${v}`, orgId: org, documentId: docId, v, storageKey: `${org}/${docId}/v${v}/f.pdf`, sizeKb: 1, byId: OWNER, byName: 'Owner', createdAt: now });
    await db.insert(documentVersions).values([ver(PRIV, A, 1), ver(PRIV, A, 2), ver(TEAM, A, 1), ver(SPEC, A, 1), ver(B_DOC, B, 1)]);
    await db.insert(documentLinks).values([
        { id: LINK_PRIV, orgId: A, documentId: PRIV, recordType: 'task', recordId: 'task_itest_docacc_p', recordName: 'P', createdAt: now },
        { id: LINK_TEAM, orgId: A, documentId: TEAM, recordType: 'task', recordId: 'task_itest_docacc_t', recordName: 'T', createdAt: now },
    ]);
});

after(cleanup);

test('a rep is refused every write to another rep\'s private document — and nothing changes', async () => {
    for (const [what, run] of WRITES(PRIV, LINK_PRIV, { user: REP, role: 'User' })) {
        const r = await run();
        assert.equal(r.status, 403, `${what}: ${JSON.stringify(r.body)}`);
        assert.equal(r.body.error, 'Forbidden', what);
    }
    const row = await docRow(PRIV);
    assert.equal(row.note, 'as seeded');
    assert.equal(row.version, 2);
    assert.equal((await versionsOf(PRIV)).length, 2, 'no version added, none removed');
    assert.deepEqual((await linksOf(PRIV)).map((l) => l.id), [LINK_PRIV], 'no link added, none removed');
    assert.deepEqual(await auditFor(PRIV), [], 'nothing done, nothing audited');
    assert.deepEqual(r2Sent, [], 'no object deleted');
});

test('an Admin is refused too — canSee has no Admin bypass, on a read or a write', async () => {
    const asAdmin = { user: ADMIN, role: 'Admin' };
    assert.equal((await call('GET', { ...asAdmin, qs: { action: 'versions', id: PRIV } })).status, 403, 'the read, as it was');
    for (const [what, run] of WRITES(PRIV, LINK_PRIV, asAdmin)) assert.equal((await run()).status, 403, what);
    assert.equal((await docRow(PRIV)).note, 'as seeded');
});

test('the owner may do each — and a delete takes its versions, its links and their objects', async () => {
    const asOwner = { user: OWNER, role: 'User' };
    const put = await call('PUT', { ...asOwner, body: { id: PRIV, note: 'mine' } });
    assert.equal(put.status, 200);
    assert.equal(put.body.document.note, 'mine');
    const link = await call('POST', { ...asOwner, qs: { action: 'link' }, body: { id: PRIV, links: [{ type: 'contact', recordId: 'con_itest_docacc', name: 'C' }] } });
    assert.equal(link.status, 200);
    assert.equal(link.body.links.length, 1);
    assert.equal((await call('DELETE', { ...asOwner, qs: { action: 'link', linkId: LINK_PRIV } })).status, 200);
    const url = await call('POST', { ...asOwner, qs: { action: 'upload-url' }, body: { documentId: PRIV, filename: 'x.pdf', sizeKb: 1, kind: 'version' } });
    assert.equal(url.status, 200);
    assert.equal(url.body.storageKey, `${A}/${PRIV}/v3/x.pdf`);
    const added = await call('POST', { ...asOwner, qs: { action: 'new-version' }, body: { id: PRIV, storageKey: url.body.storageKey, sizeKb: 2 } });
    assert.equal(added.status, 200);
    assert.equal(added.body.version, 3);
    const restored = await call('POST', { ...asOwner, qs: { action: 'restore-version' }, body: { id: PRIV, v: 1 } });
    assert.equal(restored.status, 200);
    assert.equal(restored.body.version, 4);
    assert.equal((await versionsOf(PRIV)).length, 4);
    assert.equal((await call('DELETE', { ...asOwner, qs: { id: PRIV } })).status, 200);
    assert.equal(await docRow(PRIV), undefined, 'the document is gone');
    assert.deepEqual(await versionsOf(PRIV), [], 'and its versions');
    assert.deepEqual(await linksOf(PRIV), [], 'and its links');
    assert.equal(r2Sent.length, 4, 'and each version\'s object');
    const actions = (await auditFor(PRIV)).map((a) => a.action).sort();
    assert.deepEqual(actions, ['document.deleted', 'document.linked', 'document.unlinked', 'document.updated', 'document.version_added', 'document.version_restored'].sort());
});

test('a team document is open to any writer; a specific one to the people it names', async () => {
    assert.equal((await call('PUT', { user: REP, body: { id: TEAM, category: 'Contract' } })).status, 200, 'team: a rep who is not its owner');
    assert.equal((await docRow(TEAM)).category, 'Contract');
    assert.equal((await call('PUT', { user: NAMED, body: { id: SPEC, category: 'SOW' } })).status, 200, 'specific: a person it names');
    assert.equal((await call('PUT', { user: REP, body: { id: SPEC, category: 'NDA' } })).status, 403, 'specific: a person it does not name');
    assert.equal((await docRow(SPEC)).category, 'SOW');
    assert.equal((await call('PUT', { user: REP, role: 'ReadOnly', body: { id: TEAM, note: 'x' } })).status, 403, 'a read-only role, by the role gate first');
});

test('a link\'s DELETE asks of the link\'s document; a delete or an unlink of nothing is done, not refused', async () => {
    assert.equal((await call('DELETE', { user: REP, qs: { action: 'link', linkId: LINK_TEAM } })).status, 200, 'the team document\'s link');
    assert.deepEqual(await linksOf(TEAM), []);
    assert.equal((await call('DELETE', { user: REP, qs: { action: 'link', linkId: 'dlk_itest_docacc_none' } })).status, 200);
    assert.equal((await call('DELETE', { user: REP, qs: { id: 'doc_itest_docacc_none' } })).status, 200);
});

test('an upload URL for a new document is refused an id a document holds — this org\'s or another\'s', async () => {
    const newUrl = (documentId) => call('POST', { user: REP, qs: { action: 'upload-url' }, body: { documentId, filename: 'f.pdf', sizeKb: 1, kind: 'new' } });
    for (const taken of [TEAM, B_DOC]) {
        const r = await newUrl(taken);
        assert.equal(r.status, 409, taken);
        assert.equal(r.body.uploadUrl, undefined, `${taken}: no URL minted`);
    }
    const fresh = await newUrl('doc_itest_docacc_fresh');
    assert.equal(fresh.status, 200);
    assert.equal(fresh.body.storageKey, `${A}/doc_itest_docacc_fresh/v1/f.pdf`);
});

test('org B\'s document answers org A as not there, and is untouched', async () => {
    const asA = { user: ADMIN, role: 'Admin' };
    assert.equal((await call('PUT', { ...asA, body: { id: B_DOC, note: 'from A' } })).status, 404);
    assert.equal((await call('POST', { ...asA, qs: { action: 'link' }, body: { id: B_DOC, links: [] } })).status, 404);
    assert.equal((await call('DELETE', { ...asA, qs: { id: B_DOC } })).status, 200, 'not in A: nothing to delete');
    const b = await docRow(B_DOC, B);
    assert.equal(b.note, 'as seeded');
    assert.equal((await versionsOf(B_DOC, B)).length, 1);
});
