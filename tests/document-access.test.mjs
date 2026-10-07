// tests/document-access.test.mjs
//
// A document's edits are offered to whom the server lets write, and its writes ask what
// its reads ask (state §0.182 — §0.181's found (a)–(d); Jeff: all four).
//
// Before: documents.mjs checked canSee on every read and on no write, so a document a
// user could not see could still be changed, versioned, restored, linked, unlinked or
// deleted by its id, and an upload URL could be minted for an existing document's
// version-1 object. Every document screen offered every edit to every role — requireWrite
// refuses a ReadOnly user, a Technician and a Dispatcher each one. The rail's version
// history did not follow a restore or a new version. And the hook returned a loader no
// screen called.
//
// tests/integration/documents-access.itest.mjs proves the server's rule against the
// database. Here: each write branch reads its document through writableDoc before it
// writes (the mutation harness runs unit suites); THE GUARD — a parse of every document
// screen: each control that starts a write sits under the canEdit gate; the history
// reloads on a version; and the loader is gone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const between = (src, from, to) => { const a = src.indexOf(from); assert.ok(a >= 0, from); const b = src.indexOf(to, a + from.length); assert.ok(b > a, to); return src.slice(a, b); };
const before = (s, first, second, why) => { const a = s.indexOf(first), b = s.indexOf(second); assert.ok(a >= 0, `missing: ${first}`); assert.ok(b >= 0, `missing: ${second}`); assert.ok(a < b, why); };

// ── the server ──────────────────────────────────────────────────────────────

test('writableDoc reads the document in the caller\'s org, and answers 403 to one the caller may not see', () => {
    const fn = between(code(read('netlify/functions/documents.mjs')), 'async function writableDoc(', '\n}\n');
    assert.ok(fn.includes('.where(and(eq(documents.id, id), eq(documents.orgId, orgId)));'), 'in this org only');
    assert.ok(fn.includes("if (!doc) return { refusal: { statusCode: 404, headers, body: JSON.stringify({ error: missing }) } };"));
    assert.ok(fn.includes("if (!canSee(doc, viewer)) return { refusal: { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) } };"), 'the reads\' own rule');
});

test('each write to an existing document reads it through writableDoc before it writes', () => {
    const s = code(read('netlify/functions/documents.mjs'));
    const branches = [
        ['a version\'s upload URL', between(s, "if (kind === 'version') {", '} else {'), 'await writableDoc(documentId, orgId, viewer, headers', 'v = (doc.version || 1) + 1;'],
        ['a new version', between(s, "if (action === 'new-version') {", "if (action === 'restore-version') {"), 'await writableDoc(id, orgId, viewer, headers)', 'await db.insert(documentVersions)'],
        ['a restore', between(s, "if (action === 'restore-version') {", "if (action === 'link') {"), 'await writableDoc(id, orgId, viewer, headers)', 'await db.insert(documentVersions)'],
        ['a link', between(s, "if (action === 'link') {", "return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };"), 'await writableDoc(id, orgId, viewer, headers)', 'await insertLinks(orgId, id, linked.rows)'],
        ['a PUT', between(s, "if (event.httpMethod === 'PUT') {", "if (event.httpMethod === 'DELETE') {"), 'await writableDoc(data.id, orgId, viewer, headers)', 'await db.update(documents)'],
        ['an unlink', between(s, "if (event.httpMethod === 'DELETE') {", 'const id = qs.id;'), 'await writableDoc(link.documentId, orgId, viewer, headers)', 'await db.delete(documentLinks)'],
        ['a delete', s.slice(s.indexOf('const id = qs.id;'), s.indexOf("return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };")), 'await writableDoc(id, orgId, viewer, headers)', 'await db.delete(documentVersions)'],
    ];
    for (const [what, body, check, write] of branches) {
        before(body, check, write, `${what}: the document is checked before the write`);
        assert.ok(/if \(refusal(?: && refusal\.statusCode !== 404)?\) return refusal;/.test(body), `${what}: and a refusal is answered`);
    }
    // A delete or an unlink of nothing is done, not refused; a delete of a document the
    // caller may not see is refused before its objects are removed.
    const del = branches[6][1];
    assert.ok(del.includes('if (refusal && refusal.statusCode !== 404) return refusal;'));
    before(del, 'if (refusal && refusal.statusCode !== 404) return refusal;', 'r2().send(new DeleteObjectCommand', 'refused before the objects go');
    const unlink = branches[5][1];
    assert.ok(unlink.includes('if (link) {'), 'a link that is not there is unlinked already');
});

test('an upload URL for a new document is refused an id a document already holds', () => {
    const s = code(read('netlify/functions/documents.mjs'));
    const fresh = between(s, '} else {', 'const key = buildKey(orgId, documentId, v, filename);');
    assert.ok(fresh.includes('const [taken] = await db.select({ id: documents.id }).from(documents).where(eq(documents.id, documentId));'), 'any org\'s — an id is a global key');
    assert.ok(fresh.includes("if (taken) return { statusCode: 409, headers, body: JSON.stringify({ error: 'That document id is already in use.' }) };"));
});

// ── THE GUARD: the screens ──────────────────────────────────────────────────

// What starts a write: the hook's writes, and the openers of the two layers that write
// (the upload rail, the link picker) and of a record's link picker.
const WRITES = new Set(['updateDocument', 'removeDocument', 'restoreVersion', 'linkDocument', 'unlinkDocument', 'createDocument', 'addDocumentVersion',
    'setShowUploadRail', 'setUploadRailContext', 'setShowDocLinkPicker', 'setDocLinkPickerContext', 'setShowPicker']);
// Reached only through a gated opener — the layers that hold the write itself.
const ALLOWED = {
    'src/components/documents/DocumentUploadRail.jsx': 'opened only by a gated Upload, New version or Attach file',
    'src/components/documents/DocumentLinkPicker.jsx': 'opened only by a gated Add link, or from the upload rail',
};

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
const isCanEdit = (e) => !!e && ((e.type === 'Identifier' && e.name === 'canEdit')
    || (e.type === 'LogicalExpression' && e.operator === '&&' && (isCanEdit(e.left) || isCanEdit(e.right))));
// `!canEdit`, or an || whose either side is — `disabled={!canEdit || !doc.canManage}` (§0.183).
const isNotCanEdit = (e) => !!e && ((e.type === 'UnaryExpression' && e.operator === '!' && e.argument.type === 'Identifier' && e.argument.name === 'canEdit')
    || (e.type === 'LogicalExpression' && e.operator === '||' && (isNotCanEdit(e.left) || isNotCanEdit(e.right))));
// Does this ancestor hold the path below it under the gate?
const holds = (a, child) => {
    if (a.type === 'LogicalExpression' && a.operator === '&&' && child === a.right && isCanEdit(a.left)) return true;
    if (a.type === 'ConditionalExpression' && child === a.consequent && isCanEdit(a.test)) return true;
    if (a.type === 'ConditionalExpression' && child === a.alternate && isNotCanEdit(a.test)) return true;
    if (a.type === 'JSXElement') {
        return a.openingElement.attributes.some((at) => at.type === 'JSXAttribute' && /^(disabled|readOnly)$/.test(at.name.name)
            && at.value && at.value.type === 'JSXExpressionContainer' && isNotCanEdit(at.value.expression));
    }
    return false;
};

// Every reference, inside a screen's JSX, to something that starts a write — directly or
// through a local function that reaches one — and whether the canEdit gate holds it.
export const editsIn = (file, src) => {
    const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
    const fns = new Map();
    walk(ast, (n) => {
        if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && /FunctionExpression$/.test(n.init.type)) fns.set(n.id.name, n.init.body);
        if (n.type === 'FunctionDeclaration' && n.id) fns.set(n.id.name, n.body);
    });
    const writers = new Set(WRITES);
    for (let grew = true; grew;) {
        grew = false;
        for (const [name, body] of fns) {
            if (writers.has(name)) continue;
            let hit = false;
            walk(body, (m) => { if (m.type === 'Identifier' && writers.has(m.name)) hit = true; });
            if (hit) { writers.add(name); grew = true; }
        }
    }
    const out = [];
    walk(ast, (n, anc) => {
        if (n.type !== 'Identifier' || !writers.has(n.name)) return;
        const parent = anc[anc.length - 1];
        if (parent && /^(Optional)?MemberExpression$/.test(parent.type) && parent.property === n && !parent.computed) return;
        if (!anc.some((a) => a.type === 'JSXExpressionContainer')) return;   // not in a screen's markup
        const path = [...anc, n];
        const gated = anc.some((a, i) => holds(a, path[i + 1]));
        out.push({ at: `${file}:${n.loc.start.line} ${n.name}`, gated });
    });
    return out;
};

const SCREENS = [
    ...readdirSync(new URL('src/components/documents/', ROOT)).filter((f) => f.endsWith('.jsx')).map((f) => `src/components/documents/${f}`),
    'src/Tabs/DocumentsTab.jsx',
];

test('THE GUARD: every document control that starts a write is offered under canEdit — the server\'s write list', () => {
    const found = SCREENS.filter((f) => !(f in ALLOWED)).flatMap((f) => editsIn(f, read(f)));
    for (const f of ['src/components/documents/DocumentRail.jsx', 'src/components/documents/RecordDocuments.jsx', 'src/components/documents/AttachmentsStrip.jsx', 'src/Tabs/DocumentsTab.jsx']) {
        assert.ok(found.some((e) => e.at.startsWith(f + ':')), `the scan sees the edits in ${f}`);
        const s = read(f);
        assert.ok(s.includes("import { canEditCrm } from '"), `${f}: the gate is roles.js's`);
        assert.ok(s.includes('const canEdit = canEditCrm(userRole);'), `${f}: from the caller's role`);
    }
    assert.deepEqual(found.filter((e) => !e.gated).map((e) => e.at), [], 'an edit a reader is offered and the server refuses');
    for (const f of Object.keys(ALLOWED)) assert.ok(editsIn(f, read(f)).length > 0, `stale allowance: ${f}`);
});

test('the gate is the server\'s: canEditCrm is requireWrite\'s list, and documents.mjs takes no Technician opt-in', () => {
    const gate = code(read('netlify/functions/_roleGate.mjs'));
    assert.ok(gate.includes('if (CRM_WRITE_ROLES.includes(auth?.userRole)) return null;'));
    assert.ok(code(read('src/utils/roles.js')).includes('export const canEditCrm = (role) => CRM_WRITE_ROLES.includes(role);'));
    assert.ok(code(read('netlify/functions/documents.mjs')).includes('const forbidden = requireWrite(auth, event, headers);'), 'no allowTechnician');
});

test('the guard finds the shape it guards', () => {
    const fixture = [
        'function Screen({ canEdit }) {',
        '    const go = () => updateDocument(1);',
        '    const later = () => go();',
        '    return (<div>',
        '        <button onClick={go} />',                                  // offered to every role
        '        {canEdit && <button onClick={later} />}',                  // gated, through a local function
        '        {canEdit ? null : <a onClick={go} />}',                    // the reader's branch: not gated
        '        <select disabled={!canEdit} onChange={go} />',            // disabled for a reader
        '        {canEdit && !busy && <b onClick={() => setShowUploadRail(true)} />}',
        '        <i onClick={() => setDocumentRailId(1)} />',               // opening a document is a read
        '        <s disabled={!canEdit || !mine} onChange={go} />',         // disabled for a reader, and for one who may not manage it (§0.183)
        '        <u disabled={!mine} onChange={go} />',                     // a gate that is not the write list
        '    </div>);',
        '}',
    ].join('\n');
    assert.deepEqual(editsIn('fixture.jsx', fixture).map((e) => `${e.at.split(':')[1]} ${e.gated}`),
        ['5 go false', '6 later true', '7 go false', '8 go true', '9 setShowUploadRail true', '11 go true', '12 go false']);
});

// ── the history; the loader ─────────────────────────────────────────────────

test('the rail reloads its version history when the document\'s version moves, keeping the list while it does', () => {
    const rail = read('src/components/documents/DocumentRail.jsx');
    assert.ok(rail.includes('}, [doc?.id, doc?.version, fetchVersions]); // eslint-disable-line react-hooks/exhaustive-deps'), 'a restore or a new version reloads it');
    const seed = between(rail, '    useEffect(() => {\n        if (!doc) return;\n        setNote(doc.note || \'\');', '}, [doc?.id]);');
    assert.ok(seed.includes('setVersions([]);'), 'another document starts from an empty list');
    assert.ok(!seed.includes('fetchVersions'), 'and the note is seeded when a document opens, not when its version moves');
    assert.ok(rail.includes('{loadingVersions && versions.length === 0 ? ('), 'the list stays on screen while it refreshes');
});

test('the hook returns no loader nothing calls — the screens read a record\'s documents from the library', () => {
    const hook = read('src/hooks/useDocuments.js');
    assert.ok(!hook.includes('fetchRecordDocuments'));
    assert.ok(!hook.includes('linkedTo'));
});
