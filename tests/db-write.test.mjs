// dbWrite is the failure path for every write in the hooks, so its behaviour on
// each response class needs to be pinned. It must NEVER throw — callers roll back
// on { ok: false } rather than in a catch.
import { test } from 'node:test';
import assert from 'node:assert';

// dbWrite reads window.__getClerkToken and calls global fetch. Stub both; import
// after so the module picks up the stubs.
globalThis.window = { __getClerkToken: async () => 'tok' };
let lastCall = null;
const respond = (status, body) => {
    globalThis.fetch = async (url, opts) => {
        lastCall = { url, opts };
        return {
            ok: status >= 200 && status < 300,
            status,
            statusText: '',
            json: async () => {
                if (body === undefined) throw new Error('not json');
                return body;
            },
        };
    };
};

const { dbWrite } = await import('../src/utils/storage.js');

test('2xx reports ok with no error', async () => {
    respond(200, {});
    const r = await dbWrite('/x', { method: 'PUT', body: '{}' });
    assert.equal(r.ok, true);
    assert.equal(r.error, null);
    assert.equal(r.status, 200);
});

test('201 counts as success', async () => {
    respond(201, {});
    assert.equal((await dbWrite('/x', { method: 'POST' })).ok, true);
});

test('403 is a permission message, not a status code dump', async () => {
    // PUT /settings is Admin-only after SVR-2, so a non-admin write lands here.
    // The old `.catch(console.error)` never saw this at all.
    respond(403, { error: 'Forbidden' });
    const r = await dbWrite('/x', { method: 'PUT' });
    assert.equal(r.ok, false);
    assert.equal(r.status, 403);
    assert.match(r.error, /permission/i);
});

test('500 surfaces the requestId so the log line can be found', async () => {
    // serverErrorBody returns { error: 'Internal server error', requestId }. The
    // import modal used to discard the requestId, leaving no way to find the log.
    respond(500, { error: 'Internal server error', requestId: 'abc-123' });
    const r = await dbWrite('/x', { method: 'POST' });
    assert.equal(r.ok, false);
    assert.match(r.error, /abc-123/);
});

test('500 without a requestId still yields a readable message', async () => {
    respond(500, { error: 'Boom' });
    assert.equal((await dbWrite('/x', {})).error, 'Boom');
});

test('non-JSON error body does not throw', async () => {
    respond(502, undefined);          // .json() rejects
    const r = await dbWrite('/x', {});
    assert.equal(r.ok, false);
    assert.match(r.error, /502/);
});

test('network failure resolves rather than throwing', async () => {
    // The whole point: callers must be able to roll back without a try/catch.
    globalThis.fetch = async () => { throw new Error('ECONNREFUSED'); };
    const r = await dbWrite('/x', { method: 'POST' });
    assert.equal(r.ok, false);
    assert.equal(r.status, 0);
    assert.match(r.error, /Network error/);
});

test('a missing Clerk token does not prevent the call', async () => {
    globalThis.window = {};           // __getClerkToken absent
    respond(200, {});
    assert.equal((await dbWrite('/x', { method: 'POST' })).ok, true);
    globalThis.window = { __getClerkToken: async () => 'tok' };
});

test('the caller\'s method and body reach fetch unchanged', async () => {
    respond(200, {});
    await dbWrite('/endpoint', { method: 'PUT', body: '{"a":1}' });
    assert.equal(lastCall.url, '/endpoint');
    assert.equal(lastCall.opts.method, 'PUT');
    assert.equal(lastCall.opts.body, '{"a":1}');
});
