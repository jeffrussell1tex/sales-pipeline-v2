// tests/document-refusals.test.mjs
//
// A refused document request says so (state §0.181; §0.180's found (b); Jeff: "Let's fix
// those two").
//
// Before: the documents hook's edits — a document's description, category and visibility,
// its delete, a version's restore, a link, an unlink — threw 'HTTP 403' on a refusal, and
// no screen caught one. The document rail sends its edits and moves on, so a refused edit
// was an unhandled rejection with nothing on screen: the description stayed as typed while
// the library kept the old one. The rail closed on Delete before the answer; the link
// picker logged a refusal to the console and closed; a download or a preview refused threw
// the same way; and a version history that did not load said "No version history."
//
// Now each of those requests puts what was not done, and why, in the app's message, and
// resolves { ok } — it never throws; the rail closes once a delete has landed, the link
// picker stays open on a refusal, and the history says it did not load.
//
// Run here: the REAL hook, through React's own renderer (react-dom/server), its requests
// answered by a stubbed fetch. Scanned: every handler the hook returns is one of those or
// is named below with how its failure is shown, and every call to one that still throws (a
// load, an upload) is caught where it is made.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const between = (src, from, to) => { const a = src.indexOf(from); assert.ok(a >= 0, from); const b = src.indexOf(to, a + from.length); assert.ok(b > a, to); return src.slice(a, b + to.length); };

// The requests and their answers. dbFetch reads the token from window and calls fetch.
const respond = (status, body) => ({
    ok: status >= 200 && status < 300, status, statusText: '',
    json: async () => { if (body === undefined) throw new Error('not json'); return body; },
});
const sent = [];
let answer = () => respond(200, {});
globalThis.window = { __getClerkToken: async () => 'tok' };
globalThis.fetch = async (url, opts = {}) => { sent.push(`${opts.method || 'GET'} ${url}`); return answer(url, opts); };

const { setRequestOrg } = await import('../src/utils/storage.js');
const { useDocuments } = await import('../src/hooks/useDocuments.js');

// The hook, rendered once; its handlers are called after, as a screen calls them.
const messages = [];
let docs;
function Probe() {
    docs = useDocuments({ setUndoToast: (t) => messages.push(t) });
    return null;
}
renderToString(createElement(Probe));
setRequestOrg('org_qa');

const DOCS = '/.netlify/functions/documents';
// Each edit: what it sends, and what its refusal says was not done.
const EDITS = [
    ['the description', () => docs.updateDocument('doc_1', { note: 'typed' }), `PUT ${DOCS}`, 'Description not saved'],
    ['the category', () => docs.updateDocument('doc_1', { category: 'Contract' }), `PUT ${DOCS}`, 'Category not saved'],
    ['the visibility', () => docs.updateDocument('doc_1', { visibility: 'private' }), `PUT ${DOCS}`, 'Visibility not saved'],
    ['a delete', () => docs.removeDocument('doc_1'), `DELETE ${DOCS}?id=doc_1`, 'Document not deleted'],
    ['a restore', () => docs.restoreVersion('doc_1', 2), `POST ${DOCS}?action=restore-version`, 'Version 2 not restored'],
    ['a link', () => docs.linkDocument('doc_1', [{ type: 'task', recordId: 'tsk_1', name: 'Call' }]), `POST ${DOCS}?action=link`, 'Link not added'],
    ['two links', () => docs.linkDocument('doc_1', [{ type: 'task', recordId: 'tsk_1' }, { type: 'contact', recordId: 'ctc_1' }]), `POST ${DOCS}?action=link`, 'Links not added'],
    ['an unlink', () => docs.unlinkDocument('doc_1', 'dlk_1'), `DELETE ${DOCS}?action=link&linkId=dlk_1`, 'Link not removed'],
];
// How a refusal reads: dbWrite's words (storage.js refusalOf).
const REFUSALS = [
    [403, { error: 'Forbidden: read-only role' }, 'You do not have permission to make this change.'],
    [404, { error: 'Not found' }, 'Not found'],
    [500, { error: 'Internal server error', requestId: 'req-181' }, 'Internal server error (ref req-181)'],
    [502, undefined, 'The server returned 502.'],
];

test('each edit, refused, resolves { ok: false } and says what was not done, in the server\'s words', async () => {
    for (const [what, run, request, said] of EDITS) {
        for (const [status, body, words] of REFUSALS) {
            messages.length = 0; sent.length = 0;
            answer = () => respond(status, body);
            const r = await run();
            assert.equal(r.ok, false, `${what}, ${status}`);
            assert.deepEqual(sent, [request], `${what}: the request is as it was`);
            assert.deepEqual(messages, [{ error: `${said} — ${words}` }], `${what}, ${status}`);
        }
    }
});

test('a network failure resolves too, and says so', async () => {
    for (const [what, run, , said] of EDITS) {
        messages.length = 0;
        answer = () => { throw new TypeError('Failed to fetch'); };
        const r = await run();
        assert.equal(r.ok, false, what);
        assert.deepEqual(messages, [{ error: `${said} — Network error — the change was not saved.` }], what);
    }
});

test('an edit that lands says nothing, and hands back the answer', async () => {
    messages.length = 0;
    answer = (url, opts) => {
        if (opts.method === 'PUT') return respond(200, { document: { id: 'doc_1', note: 'typed' } });
        if (url.includes('restore-version')) return respond(200, { ok: true, version: 3 });
        if (opts.method === 'POST') return respond(200, { links: [{ id: 'dlk_9', type: 'task', recordId: 'tsk_1' }] });
        return respond(200, { ok: true });
    };
    assert.deepEqual(await docs.updateDocument('doc_1', { note: 'typed' }), { ok: true, document: { id: 'doc_1', note: 'typed' } });
    assert.deepEqual(await docs.restoreVersion('doc_1', 2), { ok: true, version: 3 });
    assert.deepEqual(await docs.linkDocument('doc_1', [{ type: 'task', recordId: 'tsk_1' }]), { ok: true, links: [{ id: 'dlk_9', type: 'task', recordId: 'tsk_1' }] });
    assert.equal((await docs.removeDocument('doc_1')).ok, true);
    assert.equal((await docs.unlinkDocument('doc_1', 'dlk_9')).ok, true);
    assert.deepEqual(messages, []);
});

test('a refusal that lands after an org switch says nothing in the org on screen (§0.175)', async () => {
    for (const [what, run] of EDITS) {
        messages.length = 0;
        answer = () => { setRequestOrg('org_other'); return respond(403, { error: 'Forbidden' }); };
        const r = await run();
        setRequestOrg('org_qa');
        assert.equal(r.ok, false, what);
        assert.deepEqual(messages, [], `${what}: the last org's refusal, said under the new org's name`);
    }
});

test('a download or a preview refused says so; one that gets its link opens it', async () => {
    const clicked = [], opened = [];
    globalThis.document = { createElement: () => ({ click() { clicked.push(this.href); }, remove() {} }), body: { appendChild() {} } };
    window.open = (url) => { opened.push(url); };
    for (const [run, said] of [[() => docs.downloadDoc('doc_1'), 'Download failed'], [() => docs.previewDoc('doc_1', 2), 'Preview failed']]) {
        messages.length = 0;
        answer = () => respond(403, { error: 'Forbidden' });
        assert.equal((await run()).ok, false);
        assert.deepEqual(messages, [{ error: `${said} — Forbidden` }]);
        messages.length = 0;
        answer = () => { throw new TypeError('Failed to fetch'); };
        assert.equal((await run()).ok, false, 'a network failure resolves');
        assert.deepEqual(messages, [{ error: `${said} — Failed to fetch` }]);
        messages.length = 0;
        answer = () => respond(200, { url: 'https://files.example/doc_1' });
        assert.equal((await run()).ok, true);
        assert.deepEqual(messages, []);
    }
    assert.deepEqual(clicked, ['https://files.example/doc_1']);
    assert.deepEqual(opened, ['https://files.example/doc_1']);
});

// ── the handlers the hook returns ───────────────────────────────────────────

// Every handler the hook hands the screens, by how a failure reaches the person:
// it reports its own refusal (run above) —
const REPORTS = ['updateDocument', 'removeDocument', 'restoreVersion', 'linkDocument', 'unlinkDocument', 'downloadDoc', 'previewDoc'];
// it throws, and every call is caught where it is made (scanned below) — the uploads,
// whose screen holds the file and shows the error beside it, and the reads —
const THROWS = ['createDocument', 'addDocumentVersion', 'fetchVersions'];   // fetchRecordDocuments had no caller — removed (§0.182)
// not a request, or the library's load, which the app's banner reports (dbStatusOf).
const OTHER = ['documents', 'setDocuments', 'docsLoading', 'docsError', 'loadDocuments'];

const jsx = (src) => parse(src, { sourceType: 'module', plugins: ['jsx'] });
const walk = (node, visit, anc = []) => {
    if (!node || typeof node.type !== 'string') return;
    visit(node, anc);
    const here = [...anc, node];
    for (const k of Object.keys(node)) {
        if (k === 'loc' || k === 'start' || k === 'end' || k === 'extra') continue;
        const v = node[k];
        if (Array.isArray(v)) v.forEach((c) => walk(c, visit, here));
        else if (v && typeof v.type === 'string') walk(v, visit, here);
    }
};

test('every handler the hook returns is placed — a new one fails here until it is', () => {
    let keys = null;
    walk(jsx(read('src/hooks/useDocuments.js')), (n, anc) => {
        if (n.type === 'ReturnStatement' && n.argument && n.argument.type === 'ObjectExpression'
            && anc.some((a) => a.type === 'FunctionDeclaration' && a.id.name === 'useDocuments')) {
            keys = n.argument.properties.map((p) => p.key.name);
        }
    });
    assert.ok(keys, 'useDocuments returns an object');
    assert.deepEqual([...keys].sort(), [...REPORTS, ...THROWS, ...OTHER].sort());
});

// Every call under src to a handler that throws, with whether it is caught there: inside a
// try's block, or in a promise chain that ends in .catch.
const throwingCalls = (file, src) => {
    const out = [];
    walk(jsx(src), (n, anc) => {
        if (n.type !== 'CallExpression' || n.callee.type !== 'Identifier' || !THROWS.includes(n.callee.name)) return;
        const inTry = anc.some((a, i) => a.type === 'TryStatement' && anc[i + 1] === a.block);
        const inCatch = anc.some((a) => a.type === 'CallExpression' && a.callee.type === 'MemberExpression'
            && a.callee.property.name === 'catch' && a.callee.object.start <= n.start && n.end <= a.callee.object.end);
        out.push({ at: `${file}:${n.loc.start.line} ${n.callee.name}`, caught: inTry || inCatch });
    });
    return out;
};
const srcFiles = () => {
    const out = [];
    const dir = (d) => {
        for (const e of readdirSync(new URL(d, ROOT), { withFileTypes: true })) {
            if (e.isDirectory()) dir(d + e.name + '/');
            else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(d + e.name);
        }
    };
    dir('src/');
    return out;
};

test('THE GUARD: every call to a document handler that throws is caught where it is made', () => {
    const calls = srcFiles().filter((f) => f !== 'src/hooks/useDocuments.js').flatMap((f) => throwingCalls(f, read(f)));
    assert.ok(calls.length >= 4, `the scan sees the calls: ${calls.map((c) => c.at).join(', ')}`);
    assert.deepEqual(calls.filter((c) => !c.caught).map((c) => c.at), [], 'an uncaught failure is an unhandled rejection, and nothing on screen');
});

test('the guard finds the shape it guards', () => {
    const fixture = [
        'function a(f) { createDocument(f); }',                                                   // dropped
        'async function b(f) { try { await createDocument(f); } catch (e) { show(e); } }',        // caught
        'function c(id) { fetchVersions(id).then(set).catch(clear); }',                           // caught
        'async function d(f) { try { x(); } finally { await addDocumentVersion(f); } }',          // in the finally: not caught
    ].join('\n');
    assert.deepEqual(throwingCalls('fixture.js', fixture).map((c) => `${c.at} ${c.caught}`),
        ['fixture.js:1 createDocument false', 'fixture.js:2 createDocument true', 'fixture.js:3 fetchVersions true', 'fixture.js:4 addDocumentVersion false']);
});

// ── the screens ─────────────────────────────────────────────────────────────

test('the document rail closes on a delete that landed, and says when the history did not load', () => {
    const rail = read('src/components/documents/DocumentRail.jsx');
    const onDelete = between(rail, 'const onDelete = () => {', '\n    };');
    assert.ok(onDelete.includes('removeDocument && removeDocument(doc.id);'), 'the delete is sent');
    assert.ok(!onDelete.includes('close()'), 'and the rail stays until the document leaves the library — a refused delete leaves it open');
    assert.ok(rail.includes('useEffect(() => { if (documentRailId && !doc) close(); }, [documentRailId, doc, close]);'), 'what closes it: the document gone');
    assert.ok(rail.includes('.catch(() => { if (!cancelled) { setVersions([]); setVersionsFailed(true); } })'), 'a history that did not load is marked');
    assert.ok(rail.includes(') : versionsFailed ? ('), 'and shown before "No version history."');
    assert.ok(rail.includes('Version history could not be loaded.'));
});

test('the link picker stays open on a refused link; a record\'s Link existing stops at one', () => {
    const picker = read('src/components/documents/DocumentLinkPicker.jsx');
    const done = between(picker, 'const done = async () => {', '\n    };');
    assert.ok(done.includes('if (added.length && linkDocument && !(await linkDocument(ctx.documentId, added)).ok) return;'));
    assert.ok(done.includes('if (r.id && unlinkDocument && !(await unlinkDocument(ctx.documentId, r.id)).ok) return;'));
    assert.ok(!done.includes('console.error'), 'a refusal is not left in the console');
    assert.ok(done.trimEnd().endsWith('close();\n    };'), 'it closes once every change has landed');
    const record = read('src/components/documents/RecordDocuments.jsx');
    assert.ok(between(record, 'const linkExisting = async (picked) => {', '\n    };').includes('if (linkDocument && !(await linkDocument(d.id, [recordLink])).ok) return;'));
});
