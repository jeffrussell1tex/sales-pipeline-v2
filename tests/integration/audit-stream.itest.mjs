// tests/integration/audit-stream.itest.mjs
// Audit streaming against the real database and a real receiver (state
// §0.87). A local http server plays the customer's endpoint: a writeAudit for
// org A arrives there with a signature that verifies against the secret, and
// org B's does not; a paused destination receives nothing; the test event
// arrives; rotate invalidates the old secret; GET never carries the secret; a
// private or http:// URL is refused at create; a Manager is refused outright.
//
// The validator refuses http:// and private hosts, so delivery rows pointing
// at 127.0.0.1 are SEEDED directly (delivery does not re-validate); the
// handler's create/rotate/delete paths are exercised with public https URLs.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST and the table from
// db/apply-audit-stream.mjs --test)

if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;
// The suite's own key: encrypt/decrypt round-trip locally without the site's.
process.env.SETTINGS_ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'itest-audit-stream-key';

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            const userRole = event.headers?.['x-test-role'] || 'Admin';
            return { userId: 'u_' + orgId, orgId, userRole, managedReps: [], error: null };
        },
        canSeeAll:    (role) => role === 'Admin' || role === 'Manager',
        isReadOnly:   (role) => role === 'ReadOnly',
        isTechnician: (role) => role === 'Technician',
        requireRole: (auth, allowedRoles, headers) => (
            allowedRoles.includes(auth?.userRole)
                ? null
                : { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: insufficient role' }) }
        ),
        requireWrite: () => null,
    },
});

const { handler } = await import('../../netlify/functions/audit-stream.mjs');
const { streamAudit, invalidateAuditStream } = await import('../../netlify/functions/_auditStream.mjs');
const { writeAudit } = await import('../../netlify/functions/_lib.mjs');
const { encrypt } = await import('../../netlify/functions/crypto.mjs');
const { db } = await import('../../db/index.js');
const { auditStreamDestinations, auditLog } = await import('../../db/schema.js');
const { eq } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

// ORG NAMESPACE: this file owns 'itest_astream_*' (§18b25).
const A = 'itest_astream_A', B = 'itest_astream_B';

const ev = (org, method, body, qs, extra) => ({
    httpMethod: method,
    headers: { 'x-test-org': org, 'content-type': 'application/json', ...(extra || {}) },
    body: body ? JSON.stringify(body) : undefined,
    queryStringParameters: qs || {},
});
const call = async (...a) => { const r = await handler(ev(...a)); return { status: r.statusCode, body: JSON.parse(r.body || '{}') }; };

// ── the receiver ─────────────────────────────────────────────────────────────
const received = [];
let server, port;
const receiverStatus = { code: 200 };
const seedDest = async (org, { id, secret, paused = false, fmt = 'JSON', failures = 0 }) => {
    await db.insert(auditStreamDestinations).values({
        id, orgId: org, name: 'local ' + id, url: `http://127.0.0.1:${port}/hook/${org}`, fmt,
        secret: encrypt(secret), secretHint: secret.slice(-4), paused, failures, createdAt: new Date(), updatedAt: new Date(),
    });
    invalidateAuditStream(org);
};

const cleanup = async () => {
    for (const o of [A, B]) {
        await db.delete(auditStreamDestinations).where(eq(auditStreamDestinations.orgId, o));
        await db.delete(auditLog).where(eq(auditLog.orgId, o));
        invalidateAuditStream(o);
    }
    received.length = 0;
};

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    server = createServer((req, res) => {
        let raw = '';
        req.on('data', (c) => { raw += c; });
        req.on('end', () => {
            received.push({ url: req.url, headers: req.headers, body: raw });
            res.statusCode = receiverStatus.code;
            res.end('ok');
        });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
});
after(async () => { await cleanup(); await new Promise((r) => server.close(r)); });

// ── create / list / secret handling through the handler ──────────────────────

test('create returns the secret once; the list never carries it; a Manager and org B see nothing', async () => {
    // .invalid never resolves (RFC 2606): the create's own audit row is attempted
    // against it and fails at DNS — no real third party is ever contacted by a test.
    const c = await call(A, 'POST', { name: 'Datadog', url: 'https://audit-stream.example.invalid/api/v2/logs', fmt: 'NDJSON' });
    assert.equal(c.status, 201, JSON.stringify(c.body));
    assert.match(c.body.secret, /^ast_[0-9a-f]{48}$/);
    assert.equal(c.body.destination.secret, undefined);
    assert.equal(c.body.destination.secretHint, c.body.secret.slice(-4));
    assert.equal(c.body.destination.status, 'Never delivered');
    const list = await call(A, 'GET');
    assert.equal(list.status, 200);
    assert.equal(list.body.destinations.length, 1);
    assert.equal(JSON.stringify(list.body).includes(c.body.secret), false, 'the plaintext never comes back');
    assert.equal(JSON.stringify(list.body).includes('"secret"'), false, 'nor the ciphertext');
    const other = await call(B, 'GET');
    assert.deepEqual(other.body.destinations, [], 'org B sees none of A');
    const mgr = await call(A, 'GET', null, null, { 'x-test-role': 'Manager' });
    assert.equal(mgr.status, 403);
    // Audit rows were written for the create — by the endpoint's own writeAudit.
    const rows = await db.select().from(auditLog).where(eq(auditLog.orgId, A));
    assert.ok(rows.some(r => r.action === 'audit_stream.created'));
});

test('an http://, private, or credentialed URL is refused at create; a bad format too', async () => {
    for (const url of ['http://example.com/hook', 'https://10.0.0.5/hook', 'https://localhost/hook', 'https://u:p@example.com/hook']) {
        assert.equal((await call(A, 'POST', { name: 'x', url })).status, 400, url);
    }
    assert.equal((await call(A, 'POST', { name: 'x', url: 'https://example.com', fmt: 'CSV' })).status, 400);
});

// ── delivery, signed, org-scoped ─────────────────────────────────────────────

test('REGRESSION: a writeAudit for org A reaches A\'s receiver with a verifying signature, and B\'s receiver gets nothing', async () => {
    received.length = 0;
    const secretA = 'ast_' + 'a'.repeat(48), secretB = 'ast_' + 'b'.repeat(48);
    await seedDest(A, { id: 'asd_itest_A1', secret: secretA, fmt: 'NDJSON' });
    await seedDest(B, { id: 'asd_itest_B1', secret: secretB });
    await writeAudit(A, { action: 'opportunity.won', entityType: 'opportunity', entityId: 'opp_1', entityName: 'Beacon Metals', userId: 'usr_k', userName: 'Karen Russell' });
    assert.equal(received.length, 1, 'one delivery, to A');
    const d = received[0];
    assert.equal(d.url, `/hook/${A}`);
    assert.equal(d.headers['content-type'], 'application/x-ndjson');
    assert.equal(d.headers['x-accelerep-event'], 'audit');
    assert.ok(d.body.endsWith('\n'), 'NDJSON body ends with a newline');
    const expected = 'sha256=' + createHmac('sha256', secretA).update(d.body, 'utf8').digest('hex');
    assert.equal(d.headers['x-accelerep-signature'], expected, 'the customer can verify it with the secret they were shown');
    const payload = JSON.parse(d.body);
    assert.equal(payload.type, 'audit');
    assert.equal(payload.org_id, A);
    assert.equal(payload.action, 'opportunity.won');
    assert.equal(payload.entity_name, 'Beacon Metals');
    assert.equal(payload.actor_name, 'Karen Russell');
    assert.equal(payload.delivery_id, d.headers['x-accelerep-delivery']);
    const [row] = await db.select().from(auditStreamDestinations).where(eq(auditStreamDestinations.id, 'asd_itest_A1'));
    assert.equal(row.lastStatus, 200);
    assert.equal(row.deliveredCount, 1);
    assert.equal(row.failures, 0);
    assert.ok(row.lastDeliveredAt instanceof Date);
    const [rowB] = await db.select().from(auditStreamDestinations).where(eq(auditStreamDestinations.id, 'asd_itest_B1'));
    assert.equal(rowB.lastAttemptAt, null, 'B was never attempted for A\'s row');
});

test('a paused destination receives nothing; a resume through the handler starts delivering again with failures reset', async () => {
    received.length = 0;
    await seedDest(A, { id: 'asd_itest_A2', secret: 'ast_' + 'c'.repeat(48), paused: true, failures: 10 });
    await db.update(auditStreamDestinations).set({ paused: true }).where(eq(auditStreamDestinations.id, 'asd_itest_A1'));
    invalidateAuditStream(A);
    await streamAudit(A, { id: 'audit_x', orgId: A, action: 'x.y', entityType: 'x', entityId: '1', timestamp: new Date() });
    assert.equal(received.length, 0);
    const r = await call(A, 'PUT', { id: 'asd_itest_A2', paused: false });
    assert.equal(r.status, 200);
    assert.equal(r.body.destination.paused, false);
    assert.equal(r.body.destination.failures, 0, 'a resume is a fresh start');
    // The resume itself is audited, and that row streams to the just-resumed
    // destination — the endpoint's own writes are events like any other.
    assert.equal(received.length, 1);
    assert.equal(JSON.parse(received[0].body).action, 'audit_stream.updated');
    await streamAudit(A, { id: 'audit_y', orgId: A, action: 'x.y', entityType: 'x', entityId: '1', timestamp: new Date() });
    assert.equal(received.length, 2);
});

test('a failing receiver is recorded as failing, and the tenth consecutive failure pauses the destination', async () => {
    received.length = 0;
    receiverStatus.code = 500;
    try {
        await db.update(auditStreamDestinations).set({ failures: 8, paused: false }).where(eq(auditStreamDestinations.id, 'asd_itest_A2'));
        invalidateAuditStream(A);
        await streamAudit(A, { id: 'audit_f1', orgId: A, action: 'x.y', entityType: 'x', entityId: '1', timestamp: new Date() });
        let [row] = await db.select().from(auditStreamDestinations).where(eq(auditStreamDestinations.id, 'asd_itest_A2'));
        assert.equal(row.failures, 9); assert.equal(row.paused, false); assert.equal(row.lastStatus, 500);
        await streamAudit(A, { id: 'audit_f2', orgId: A, action: 'x.y', entityType: 'x', entityId: '1', timestamp: new Date() });
        [row] = await db.select().from(auditStreamDestinations).where(eq(auditStreamDestinations.id, 'asd_itest_A2'));
        assert.equal(row.failures, 10); assert.equal(row.paused, true);
        assert.match(row.lastError, /Paused after 10 consecutive failures/);
        const list = await call(A, 'GET');
        assert.equal(list.body.destinations.find(d => d.id === 'asd_itest_A2').status, 'Paused');
    } finally { receiverStatus.code = 200; }
});

test('the test event arrives signed like a real row, and the handler reports the receiver\'s real status', async () => {
    received.length = 0;
    const r = await call(A, 'POST', null, { test: 'asd_itest_A1' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.ok, true);
    assert.equal(r.body.status, 200);
    assert.equal(received.length, 1);
    assert.equal(received[0].headers['x-accelerep-event'], 'audit.test');
    assert.equal(JSON.parse(received[0].body).type, 'audit.test');
    receiverStatus.code = 503;
    try {
        const bad = await call(A, 'POST', null, { test: 'asd_itest_A1' });
        assert.equal(bad.body.ok, false); assert.equal(bad.body.status, 503); assert.match(bad.body.error, /503/);
    } finally { receiverStatus.code = 200; }
    assert.equal((await call(B, 'POST', null, { test: 'asd_itest_A1' })).status, 404, 'org B cannot test A\'s destination');
});

test('rotate returns a new secret once and the old one no longer verifies; delete is org-scoped', async () => {
    received.length = 0;
    await db.update(auditStreamDestinations).set({ paused: false }).where(eq(auditStreamDestinations.id, 'asd_itest_A1'));
    invalidateAuditStream(A);
    const r = await call(A, 'PUT', { id: 'asd_itest_A1', rotateSecret: true });
    assert.equal(r.status, 200);
    assert.match(r.body.newSecret, /^ast_[0-9a-f]{48}$/);
    await streamAudit(A, { id: 'audit_r', orgId: A, action: 'x.y', entityType: 'x', entityId: '1', timestamp: new Date() });
    const d = received.find(x => x.url === `/hook/${A}`);
    const withNew = 'sha256=' + createHmac('sha256', r.body.newSecret).update(d.body, 'utf8').digest('hex');
    const withOld = 'sha256=' + createHmac('sha256', 'ast_' + 'a'.repeat(48)).update(d.body, 'utf8').digest('hex');
    assert.equal(d.headers['x-accelerep-signature'], withNew);
    assert.notEqual(d.headers['x-accelerep-signature'], withOld);
    assert.equal((await call(B, 'DELETE', null, { id: 'asd_itest_A1' })).status, 404, 'org B cannot delete A\'s destination');
    assert.equal((await call(A, 'DELETE', null, { id: 'asd_itest_A1' })).status, 200);
    assert.equal((await call(A, 'GET')).body.destinations.some(x => x.id === 'asd_itest_A1'), false);
});
