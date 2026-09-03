// tests/audit-stream.test.mjs
//
// Audit streaming, built for real (state §0.87; Jeff's call on item 21's fourth
// panel). The pure half — what a valid destination is, the secret, the payload,
// the signature, the delivery-state rule, the list view — is pinned here; the
// source scans pin the four write sites, the endpoint's gate and scope, the
// retired settings keys, and the panel's honesty. Behaviour against the real
// database and a real receiver is tests/integration/audit-stream.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import {
    validateDestination, isPrivateHost, newSecret, SECRET_RE, secretHintOf,
    auditPayloadOf, testPayloadOf, bodyFor, signBody, deliveryHeaders,
    nextDeliveryState, statusOf, destinationView, MAX_CONSECUTIVE_FAILURES, DELIVERY_TIMEOUT_MS, DEST_FORMATS,
} from '../netlify/functions/_auditPayload.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

// ── validation ───────────────────────────────────────────────────────────────

test('a destination is https, public, credential-free, named, and in a known format', () => {
    const ok = validateDestination({ name: '  Datadog  ', url: 'https://http-intake.logs.datadoghq.com/api/v2/logs', fmt: 'ndjson' });
    assert.deepEqual(ok, { ok: true, value: { name: 'Datadog', url: 'https://http-intake.logs.datadoghq.com/api/v2/logs', fmt: 'NDJSON' } });
    assert.equal(validateDestination({ name: 'x', url: 'https://example.com/a' }).value.fmt, 'JSON', 'JSON is the default');
    for (const [input, why] of [
        [{ name: '', url: 'https://example.com' }, 'name'],
        [{ name: 'x'.repeat(121), url: 'https://example.com' }, 'name length'],
        [{ name: 'x', url: '' }, 'url'],
        [{ name: 'x', url: 'not a url' }, 'url shape'],
        [{ name: 'x', url: 'http://example.com/hook' }, 'REGRESSION: http'],
        [{ name: 'x', url: 's3://bucket/path' }, 's3 cannot be POSTed to'],
        [{ name: 'x', url: 'https://user:pw@example.com/hook' }, 'credentials'],
        [{ name: 'x', url: 'https://10.0.0.5/hook' }, 'private host'],
        [{ name: 'x', url: 'https://localhost/hook' }, 'localhost'],
        [{ name: 'x', url: 'https://example.com', fmt: 'CSV' }, 'format'],
    ]) assert.equal(validateDestination(input).ok, false, why);
});

test('the private-host list covers the function\'s own network, not the internet', () => {
    for (const h of ['localhost', 'api.localhost', 'foo.local', 'bar.internal', '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:10.0.0.1', '']) {
        assert.equal(isPrivateHost(h), true, h);
    }
    for (const h of ['example.com', '8.8.8.8', '172.32.0.1', '172.15.0.1', '100.128.0.1', '2606:4700::1111', 'http-intake.logs.datadoghq.com']) {
        assert.equal(isPrivateHost(h), false, h);
    }
});

// ── secrets ──────────────────────────────────────────────────────────────────

test('a secret is ast_ + 48 hex, from the CSPRNG by default; the hint is its last four', () => {
    const s = newSecret();
    assert.match(s, SECRET_RE);
    assert.notEqual(newSecret(), s, 'two secrets differ');
    assert.equal(newSecret((n) => 'ab'.repeat(n)), 'ast_' + 'ab'.repeat(24));
    assert.equal(secretHintOf('ast_abcdef1234'), '1234');
});

// ── payload, body, signature, headers ────────────────────────────────────────

const ROW = { id: 'audit_1', orgId: 'org_A', action: 'opportunity.won', entityType: 'opportunity', entityId: 'opp_9', entityName: 'Beacon Metals', detail: 'ARR 120000', userId: 'usr_k', userName: 'Karen Russell', timestamp: new Date('2026-09-03T15:04:05.000Z') };

test('the payload is the audit row in snake case with the delivery id and instant, and nothing else', () => {
    const p = auditPayloadOf(ROW, { deliveryId: 'd1', sentAt: '2026-09-03T15:04:06.000Z' });
    assert.deepEqual(p, { type: 'audit', delivery_id: 'd1', sent_at: '2026-09-03T15:04:06.000Z', id: 'audit_1', org_id: 'org_A', action: 'opportunity.won', entity_type: 'opportunity', entity_id: 'opp_9', entity_name: 'Beacon Metals', detail: 'ARR 120000', actor_id: 'usr_k', actor_name: 'Karen Russell', timestamp: '2026-09-03T15:04:05.000Z' });
    const t = testPayloadOf('org_A', { id: 'asd_1', name: 'Splunk' }, { deliveryId: 'd2', sentAt: 'x' });
    assert.equal(t.type, 'audit.test');
    assert.deepEqual(t.destination, { id: 'asd_1', name: 'Splunk' });
});

test('JSON is the payload; NDJSON is the payload and one newline', () => {
    const p = { a: 1 };
    assert.equal(bodyFor(p, 'JSON'), '{"a":1}');
    assert.equal(bodyFor(p, 'NDJSON'), '{"a":1}\n');
});

test('the signature is HMAC-SHA256 over the exact body bytes, keyed by the secret — a receiver can verify it', () => {
    const body = bodyFor({ hello: 'world' }, 'NDJSON');
    const sig = signBody('ast_secret', body);
    assert.equal(sig, 'sha256=' + createHmac('sha256', 'ast_secret').update(body, 'utf8').digest('hex'));
    assert.notEqual(sig, signBody('ast_secret', body.trim()), 'the newline is part of what is signed');
    assert.notEqual(sig, signBody('ast_other', body));
});

test('the headers carry the signature, event type, delivery id and instant, with the right content type', () => {
    const h = deliveryHeaders({ signature: 'sha256=abc', deliveryId: 'd1', sentAt: 't', type: 'audit', fmt: 'NDJSON' });
    assert.equal(h['X-Accelerep-Signature'], 'sha256=abc');
    assert.equal(h['X-Accelerep-Event'], 'audit');
    assert.equal(h['X-Accelerep-Delivery'], 'd1');
    assert.equal(h['X-Accelerep-Timestamp'], 't');
    assert.equal(h['Content-Type'], 'application/x-ndjson');
    assert.equal(deliveryHeaders({ fmt: 'JSON' })['Content-Type'], 'application/json');
});

// ── the delivery-state rule ──────────────────────────────────────────────────

test('a 2xx resets failures and stamps delivery; a failure counts; the tenth pauses the destination', () => {
    const at = new Date('2026-09-03T15:00:00Z');
    const ok = nextDeliveryState({ failures: 4, deliveredCount: 7 }, { status: 202, at });
    assert.deepEqual(ok, { failures: 0, lastStatus: 202, lastError: null, lastAttemptAt: at, lastDeliveredAt: at, deliveredCount: 8, updatedAt: at });
    const fail = nextDeliveryState({ failures: 0 }, { status: 500, at });
    assert.equal(fail.failures, 1);
    assert.equal(fail.lastError, 'Endpoint answered 500');
    assert.equal('paused' in fail, false, 'one failure does not pause');
    const timeout = nextDeliveryState({ failures: 3 }, { status: 0, error: 'No response within 4s', at });
    assert.equal(timeout.lastStatus, 0);
    assert.equal(timeout.lastError, 'No response within 4s');
    const tenth = nextDeliveryState({ failures: MAX_CONSECUTIVE_FAILURES - 1 }, { status: 503, at });
    assert.equal(tenth.paused, true, 'REGRESSION: a dead endpoint must stop costing every write');
    assert.match(tenth.lastError, /^Paused after 10 consecutive failures — last: Endpoint answered 503$/);
    assert.equal(MAX_CONSECUTIVE_FAILURES, 10);
    assert.equal(DELIVERY_TIMEOUT_MS, 4000);
});

test('a 3xx or 4xx is not a delivery', () => {
    for (const s of [301, 302, 400, 401, 403, 404, 429]) assert.equal(nextDeliveryState({}, { status: s, at: new Date() }).failures, 1, String(s));
});

// ── the list ─────────────────────────────────────────────────────────────────

test('the view never carries the ciphertext, and the status is computed from the row', () => {
    const row = { id: 'asd_1', secret: '0a:0b:0c', secretHint: 'beef', paused: false, lastAttemptAt: new Date(), lastStatus: 200, lastDeliveredAt: new Date() };
    const v = destinationView(row);
    assert.equal('secret' in v, false);
    assert.equal(v.secretHint, 'beef');
    assert.equal(v.status, 'Active');
    assert.equal(statusOf({ paused: true, lastStatus: 200 }), 'Paused');
    assert.equal(statusOf({ lastAttemptAt: new Date(), lastStatus: 500 }), 'Failing');
    assert.equal(statusOf({ lastAttemptAt: new Date(), lastStatus: 0 }), 'Failing');
    assert.equal(statusOf({}), 'Never delivered');
    assert.deepEqual(DEST_FORMATS, ['JSON', 'NDJSON']);
});

// ── the wiring ───────────────────────────────────────────────────────────────

test('all four audit write sites stream the inserted row after the insert', () => {
    const lib = code(read('netlify/functions/_lib.mjs'));
    assert.ok(lib.includes("import { streamAudit } from './_auditStream.mjs';"));
    assert.ok(lib.includes('}).returning();\n        await streamAudit(orgId, row);'), '_lib.writeAudit');
    const users = code(read('netlify/functions/users.mjs'));
    assert.ok(users.includes("import { streamAudit } from './_auditStream.mjs';"));
    assert.ok(users.includes('await streamAudit(orgId, row);'), 'users.mjs writer');
    const al = code(read('netlify/functions/audit-log.mjs'));
    assert.ok(al.includes('await streamAudit(orgId, inserted);'), 'audit-log POST');
    const sync = code(read('netlify/functions/users-sync.mjs'));
    assert.ok(sync.includes('await streamAudit(orgId, row);'), 'users-sync');
    // Every audit_log insert in the functions directory is one of these four.
    const inserts = ['netlify/functions/_lib.mjs', 'netlify/functions/users.mjs', 'netlify/functions/audit-log.mjs', 'netlify/functions/users-sync.mjs'];
    for (const f of inserts) assert.equal((code(read(f)).match(/db\.insert\(auditLog\)/g) || []).length, 1, f);
});

test('the delivery module never throws, filters paused destinations, times each attempt, and does not import _lib', () => {
    const s = code(read('netlify/functions/_auditStream.mjs'));
    assert.ok(!s.includes("from './_lib.mjs'"), 'a cycle: _lib imports this file');
    assert.ok(s.includes(".filter(d => !d.paused)"));
    assert.ok(s.includes('signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS)'));
    assert.ok(s.includes('Promise.allSettled('), 'destinations in parallel');
    assert.ok(s.includes("return { attempted: 0, delivered: 0 };"), 'the catch-all');
    assert.ok(s.includes('const secret = decrypt(dest.secret);'), 'the ciphertext is decrypted per attempt, never stored plain');
    assert.ok(s.includes('eq(auditStreamDestinations.orgId, orgId)'), 'org-scoped reads and writes');
});

test('the endpoint is Admin-only, org-scoped on every query, returns the secret once, and validates through the pure module', () => {
    const s = code(read('netlify/functions/audit-stream.mjs'));
    assert.ok(s.includes("const denied = requireRole(auth, ['Admin'], headers);"));
    assert.ok(s.includes('return json(201, { destination: destinationView(row), secret });'), 'shown once on create');
    assert.ok(s.includes('newSecret: newSecretPlain'), 'shown once on rotate');
    assert.ok(s.includes('const v = validateDestination(data);'));
    assert.ok(s.includes("json(503, { error: 'Key encryption is not available. Contact your administrator.' })"), 'the BYOK answer when the key is unset');
    // rowOf (used by test / PUT / DELETE), the GET list, the PUT update and the DELETE
    // each carry eq(orgId); the insert carries the org as a value.
    const scoped = (s.match(/eq\(auditStreamDestinations\.orgId, orgId\)/g) || []).length;
    assert.ok(scoped >= 4, `every read and write carries the org — found ${scoped}`);
    assert.ok(s.includes("id: 'asd_' + randomUUID(), orgId, ...v.value,"), 'the insert is stamped with the caller\'s org');
    assert.ok(!s.includes('destinationView(row).secret'), 'never the ciphertext');
    assert.ok(s.includes("if (!patch.paused) { patch.failures = 0; patch.lastError = null; }"), 'a resume is a fresh start');
});

test('the settings blob no longer carries the streaming keys — the table is the store', () => {
    const s = code(read('netlify/functions/settings.mjs'));
    assert.ok(!s.includes('streamingDestinations'));
    assert.ok(!s.includes('streamingGlobals'));
});

test('the schema, the DDL script and the guard agree on the table', () => {
    const schema = read('db/schema.ts');
    assert.ok(schema.includes("export const auditStreamDestinations = pgTable('audit_stream_destinations'"));
    assert.ok(schema.includes("index('audit_stream_destinations_org_id_idx').on(t.orgId)"));
    const ddl = code(read('db/apply-audit-stream.mjs'));
    assert.ok(ddl.includes('CREATE TABLE IF NOT EXISTS "audit_stream_destinations"'));
    assert.ok(!/DROP|ALTER TABLE/.test(ddl), 'additive only');
    assert.ok(read('tests/integration/_schema-guard.mjs').includes("['audit_stream_destinations', 'id']"));
});

test('the panel: real endpoint, secret shown once, real row actions, the inventions gone', () => {
    const s = code(read('src/Tabs/settings/audit/AuditDetail.jsx'));
    for (const ghost of ['SEC_AUDIT_EVENTS', 'Streaming to Splunk', '2 alerts triggered', 'retention 13 months', '12,847', 'Schedule recurring export', 'ManageAlertsModal', 'Manage alerts', 'Create alert from event', 'View delivery logs', 'Buffer & retry', 'streamingDestinations', 'streamingGlobals', 'Delivery log', 'NDJSON.gz', 's3://', "'IP'", 'Full retention window']) {
        assert.ok(!s.includes(ghost), `AuditDetail still carries "${ghost}"`);
    }
    assert.ok(s.includes("const STREAM_URL = '/.netlify/functions/audit-stream';"));
    assert.ok(s.includes('SecretRevealModal'), 'the secret is shown once with Copy');
    for (const action of ['Send test event', 'Rotate secret', 'Remove destination', 'Pause', 'Resume']) assert.ok(s.includes(action), action);
    assert.ok(s.includes('showConfirm('), 'destructive actions ask through the house dialog');
    assert.ok(s.includes('last 500 events'), 'the honest cap');
    assert.ok(s.includes('Streaming to ${'), 'the badge is the live count');
});
