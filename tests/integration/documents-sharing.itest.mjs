// tests/integration/documents-sharing.itest.mjs
// Who a document is shared with, who may change it, and what it links to (state §0.183 —
// §0.182's found (a)–(d); Jeff: "fix all 4 when you have the chance. for number 2 build a
// picker"; who may change who sees it or delete it: "Owner or an Admin"), against the real
// test database.
//
// Proves, in org A: each document tells its caller whether they may manage it; only its
// owner or an Admin changes who sees it or deletes it — a rep who can see it still changes
// its other fields; a Specific list is this org's members by their app id, at least one,
// and the people it names see it while others do not; a create checks its people and its
// links before it writes anything; a link names a record of this org that the caller can
// see — a task, a contact, a deal, an activity — under the record's own name, never the
// browser's; and a restore answers the document it left.
//
// The auth mock fakes the SIGN-IN only and re-exports the real gate and predicates; R2 is
// stubbed — nothing leaves this process.
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
            const userId = event.headers?.['x-test-user'] || 'clerk_itest_docshare_nobody';
            return { userId, orgId, userRole, managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: roleGate.requireWrite, requireRole: roleGate.requireRole,
    },
});
const command = class { constructor(input) { this.input = input; } };
mock.module('@aws-sdk/client-s3', {
    namedExports: {
        S3Client: class { async send() { return {}; } },
        PutObjectCommand: command, GetObjectCommand: command, DeleteObjectCommand: command,
    },
});
mock.module('@aws-sdk/s3-request-presigner', {
    namedExports: { getSignedUrl: async (_client, cmd) => `https://r2.test/${cmd.input.Key}` },
});

const { handler } = await import('../../netlify/functions/documents.mjs');
const { db } = await import('../../db/index.js');
const { documents, documentVersions, documentLinks, auditLog, users, tasks, contacts, opportunities, accounts, activities } = await import('../../db/schema.js');
const { eq, and, inArray } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

// ORG NAMESPACE: this file owns 'itest_docshare_*' (orgs, ids, users).
const A = 'itest_docshare_A', B = 'itest_docshare_B';
const ORGS = [A, B];
const clerk = (who) => `clerk_itest_docshare_${who}`;
const row = (who) => `usr_itest_docshare_${who}`;
const OWNER = clerk('owner'), REP = clerk('rep'), NAMED = clerk('named'), ADMIN = clerk('admin');
const TEAM_A = 'doc_itest_docshare_team_a', TEAM_B = 'doc_itest_docshare_team_b', SPEC_DOC = 'doc_itest_docshare_spec', REST = 'doc_itest_docshare_rest';
const TASK_REP = 'task_itest_docshare_rep', TASK_OWNER = 'task_itest_docshare_owner', CONTACT_FREE = 'con_itest_docshare_free';
const DEAL_REP = 'opp_itest_docshare_rep', ACT_REP = 'act_itest_docshare_rep', ACCOUNT_B = 'acc_itest_docshare_b';

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
const as = { owner: { user: OWNER }, rep: { user: REP }, named: { user: NAMED }, admin: { user: ADMIN, role: 'Admin' } };
const docRow = async (id) => (await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.orgId, A))))[0];
const linksOf = async (id) => db.select().from(documentLinks).where(and(eq(documentLinks.documentId, id), eq(documentLinks.orgId, A)));
const library = async (who) => (await call('GET', who)).body.documents || [];

const cleanup = async () => {
    for (const t of [documentLinks, documentVersions, documents, auditLog, tasks, contacts, opportunities, accounts, activities, users]) {
        await db.delete(t).where(inArray(t.orgId, ORGS));
    }
};

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    const now = new Date();
    await db.insert(users).values([
        ...['owner', 'rep', 'named', 'admin'].map((who) => ({ id: row(who), orgId: A, clerkUserId: clerk(who), name: `Docshare ${who}`, email: `${who}@itest-docshare.local`, role: who === 'admin' ? 'Admin' : 'User' })),
        { id: row('bmember'), orgId: B, clerkUserId: clerk('bmember'), name: 'Docshare B', email: 'b@itest-docshare.local', role: 'User' },
    ]);
    const doc = (id, visibilityKind = 'team', version = 1, sizeKb = 10) => ({
        id, orgId: A, name: id, ext: 'pdf', category: 'Note', sizeKb, ownerId: OWNER, ownerName: 'Docshare owner',
        visibilityKind, visibilityUserIds: [], version, storageKey: `${A}/${id}/v${version}/f.pdf`, note: 'as seeded',
        uploadedAt: now, modifiedAt: now, createdAt: now, updatedAt: now,
    });
    await db.insert(documents).values([doc(TEAM_A), doc(TEAM_B), doc(SPEC_DOC), doc(REST, 'team', 2, 9)]);
    await db.insert(documentVersions).values([
        { id: 'dvr_itest_docshare_rest_1', orgId: A, documentId: REST, v: 1, storageKey: `${A}/${REST}/v1/f.pdf`, sizeKb: 7, createdAt: now },
        { id: 'dvr_itest_docshare_rest_2', orgId: A, documentId: REST, v: 2, storageKey: `${A}/${REST}/v2/f.pdf`, sizeKb: 9, createdAt: now },
    ]);
    await db.insert(tasks).values([
        { id: TASK_REP, orgId: A, title: 'Rep task', ownerId: row('rep') },
        { id: TASK_OWNER, orgId: A, title: 'Owner task', ownerId: row('owner') },
    ]);
    await db.insert(contacts).values({ id: CONTACT_FREE, orgId: A, firstName: 'Una', lastName: 'Free' });
    await db.insert(opportunities).values({ id: DEAL_REP, orgId: A, opportunityName: 'Rep deal', pipelineId: 'pl_itest_docshare', stage: 'Lead', ownerId: row('rep') });
    await db.insert(activities).values({ id: ACT_REP, orgId: A, type: 'Call', subject: 'Rep call', ownerId: row('rep') });
    await db.insert(accounts).values({ id: ACCOUNT_B, orgId: B, name: 'B account' });
});

after(cleanup);

test('each document tells its caller whether they may manage it — its owner, or an Admin', async () => {
    const flag = async (who) => (await library(who)).find((d) => d.id === TEAM_A).canManage;
    assert.equal(await flag(as.owner), true);
    assert.equal(await flag(as.admin), true);
    assert.equal(await flag(as.rep), false, 'a rep who can see it');
});

test('only the owner or an Admin changes who sees a document, or deletes it — a rep still changes its other fields', async () => {
    assert.equal((await call('PUT', { ...as.rep, body: { id: TEAM_A, visibility: 'private' } })).status, 403);
    assert.equal((await call('PUT', { ...as.rep, body: { id: TEAM_A, visibilityUserIds: [row('named')] } })).status, 403, 'nor its people alone');
    assert.equal((await call('DELETE', { ...as.rep, qs: { id: TEAM_A } })).status, 403);
    const kept = await docRow(TEAM_A);
    assert.equal(kept.visibilityKind, 'team');
    assert.deepEqual(kept.visibilityUserIds, []);
    assert.equal((await call('PUT', { ...as.rep, body: { id: TEAM_A, note: 'a rep may describe it' } })).status, 200);
    assert.equal((await docRow(TEAM_A)).note, 'a rep may describe it');
    // An Admin may, on a document it can see.
    const shared = await call('PUT', { ...as.admin, body: { id: TEAM_B, visibility: 'specific', visibilityUserIds: [row('named'), row('admin')] } });
    assert.equal(shared.status, 200);
    assert.equal(shared.body.document.canManage, true);
    assert.equal((await call('DELETE', { ...as.admin, qs: { id: TEAM_B } })).status, 200);
    assert.equal(await docRow(TEAM_B), undefined);
});

test('a Specific list is this org\'s members by app id, at least one — and the people it names see it', async () => {
    const put = (body) => call('PUT', { ...as.owner, body: { id: SPEC_DOC, ...body } });
    assert.equal((await put({ visibility: 'specific', visibilityUserIds: [] })).status, 400, 'no one');
    assert.equal((await put({ visibility: 'specific', visibilityUserIds: [row('bmember')] })).status, 400, 'org B\'s member');
    assert.equal((await put({ visibility: 'specific', visibilityUserIds: ['usr_itest_docshare_nobody'] })).status, 400, 'no one at all');
    assert.equal((await put({ visibility: 'specific', visibilityUserIds: [NAMED] })).status, 400, 'a Clerk id is not a member\'s id');
    assert.equal((await put({ visibility: 'public' })).status, 400, 'no such visibility');
    assert.equal((await docRow(SPEC_DOC)).visibilityKind, 'team', 'every refusal left it');
    const ok = await put({ visibility: 'specific', visibilityUserIds: [row('named'), row('named')] });
    assert.equal(ok.status, 200);
    assert.deepEqual((await docRow(SPEC_DOC)).visibilityUserIds, [row('named')], 'once');
    assert.ok((await library(as.named)).some((d) => d.id === SPEC_DOC), 'the person it names sees it');
    assert.equal((await call('GET', { ...as.named, qs: { action: 'versions', id: SPEC_DOC } })).status, 200);
    assert.ok(!(await library(as.rep)).some((d) => d.id === SPEC_DOC), 'one it does not name, does not');
    assert.equal((await call('GET', { ...as.rep, qs: { action: 'versions', id: SPEC_DOC } })).status, 403);
    assert.ok((await library(as.owner)).some((d) => d.id === SPEC_DOC), 'its owner always does');
    assert.equal((await put({ visibility: 'team' })).status, 200);
    assert.deepEqual((await docRow(SPEC_DOC)).visibilityUserIds, [], 'another kind keeps no list');
});

test('a create checks its people and its links before it writes anything', async () => {
    const create = (id, extra) => call('POST', { ...as.rep, qs: { action: 'create' }, body: { id, name: id, ext: 'pdf', sizeKb: 1, storageKey: `${A}/${id}/v1/f.pdf`, ...extra } });
    const none = 'doc_itest_docshare_none', hidden = 'doc_itest_docshare_hidden', made = 'doc_itest_docshare_made';
    assert.equal((await create(none, { visibility: 'specific', visibilityUserIds: [] })).status, 400);
    assert.equal(await docRow(none), undefined, 'no document');
    assert.equal((await create(hidden, { links: [{ type: 'task', recordId: TASK_OWNER, name: 'Owner task' }] })).status, 404, 'a task the rep cannot see');
    assert.equal(await docRow(hidden), undefined, 'no document');
    const r = await create(made, { visibility: 'specific', visibilityUserIds: [row('named')], links: [{ type: 'task', recordId: TASK_REP, name: 'Made up', sub: 'made up too' }] });
    assert.equal(r.status, 201);
    assert.equal(r.body.document.canManage, true, 'its uploader owns it');
    assert.deepEqual((await docRow(made)).visibilityUserIds, [row('named')]);
    const [link] = await linksOf(made);
    assert.equal(link.recordName, 'Rep task', 'the task\'s own title');
    assert.equal(link.recordSub, null, 'no line the browser wrote');
});

test('a link names a record of this org the caller can see, under the record\'s own name', async () => {
    const link = (who, l) => call('POST', { ...who, qs: { action: 'link' }, body: { id: TEAM_A, links: [l] } });
    const named = async (l) => { const r = await link(as.rep, { ...l, name: 'Made up' }); assert.equal(r.status, 200, l.type); return r.body.links[0].name; };
    assert.equal(await named({ type: 'task', recordId: TASK_REP }), 'Rep task');
    assert.equal(await named({ type: 'contact', recordId: CONTACT_FREE }), 'Una Free', 'an unassigned contact: any rep\'s');
    assert.equal(await named({ type: 'opportunity', recordId: DEAL_REP }), 'Rep deal', 'the rep\'s own deal');
    assert.equal(await named({ type: 'activity', recordId: ACT_REP }), 'Rep call', 'an activity by its subject');
    assert.equal((await link(as.rep, { type: 'task', recordId: TASK_OWNER })).status, 404, 'another rep\'s task');
    assert.equal((await link(as.rep, { type: 'account', recordId: ACCOUNT_B })).status, 404, 'org B\'s account');
    assert.equal((await link(as.rep, { type: 'widget', recordId: 'x' })).status, 400);
    const ids = (await linksOf(TEAM_A)).map((l) => l.recordId).sort();
    assert.deepEqual(ids, [ACT_REP, CONTACT_FREE, DEAL_REP, TASK_REP].sort(), 'no link for a refused record');
    assert.equal((await link(as.admin, { type: 'task', recordId: TASK_OWNER })).status, 200, 'an Admin reads the org');
});

test('a restore answers the document it left — its size the restored version\'s', async () => {
    const r = await call('POST', { ...as.owner, qs: { action: 'restore-version' }, body: { id: REST, v: 1 } });
    assert.equal(r.status, 200);
    assert.equal(r.body.version, 3);
    assert.equal(r.body.document.sizeKb, 7, 'version 1\'s, not version 2\'s 9');
    assert.equal(r.body.document.storageKey, `${A}/${REST}/v1/f.pdf`);
    assert.equal((await docRow(REST)).sizeKb, 7);
});
