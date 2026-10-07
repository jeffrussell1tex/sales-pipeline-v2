// tests/escape-layers.test.mjs
//
// Escape closes the layer on top, and only that one (state §0.180; §0.178's found (a)).
//
// Before: the document layers — the document rail, the upload rail, the link picker, the
// document picker — open above the record rails and the deal modal and had no Escape of
// their own, so an Escape over a document closed the rail or the modal under it and left
// the document open (each rail's listener on document, App's on window). Now each document
// layer takes its Escape first (useEscapeLayer: document, capture phase), marks it, and
// lets it pass while a layer above it is open; every other Escape listener leaves a
// marked one alone.
//
// THE GUARD: every keydown listener under src that reacts to Escape checks
// e.defaultPrevented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';
import { takeEscape } from '../src/utils/escapeLayer.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const esc = () => ({ key: 'Escape', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } });

// ── the decision ────────────────────────────────────────────────────────────

test('takeEscape: a layer takes an Escape no one took and nothing above it holds — and marks it', () => {
    let took = 0;
    const e = esc();
    assert.equal(takeEscape(e, false, () => { took += 1; }), true);
    assert.equal(took, 1);
    assert.equal(e.defaultPrevented, true, 'marked, so everything under it leaves it alone');
    const above = esc();
    assert.equal(takeEscape(above, true, () => { took += 1; }), false, 'a layer above is open: the Escape is theirs');
    assert.equal(above.defaultPrevented, false, 'and it passes unmarked');
    const taken = esc(); taken.preventDefault();
    assert.equal(takeEscape(taken, false, () => { took += 1; }), false, 'one a layer above took');
    assert.equal(takeEscape({ key: 'Enter', defaultPrevented: false, preventDefault() {} }, false, () => { took += 1; }), false);
    assert.equal(took, 1);
});

test('one Escape, one layer: a document over a rail closes the document; the rail and App leave it', () => {
    // The order a keypress meets them: the document layers' listeners (document, capture)
    // in the order they were added, then a rail's (document, bubble), then App's (window).
    const closed = [];
    const open = { doc: true, upload: true };
    const docRail = (e) => takeEscape(e, open.upload, () => { closed.push('document'); open.doc = false; });
    const uploadRail = (e) => takeEscape(e, false, () => { closed.push('upload'); open.upload = false; });
    const recordRail = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) closed.push('record rail'); };
    const app = (e) => { if (e.defaultPrevented) return; closed.push('app'); };
    const press = () => { const e = esc(); for (const l of [docRail, uploadRail, recordRail, app]) l(e); };
    press();
    assert.deepEqual(closed, ['upload'], 'the upload rail on top, alone — the document rail under it let it pass');
    press();
    assert.deepEqual(closed, ['upload', 'document'], 'then the document — the record rail stays');
});

// ── the hook and the four layers ────────────────────────────────────────────

test('useEscapeLayer listens on document in the capture phase, while the layer is open', () => {
    const src = read('src/hooks/useEscapeLayer.js');
    assert.ok(src.includes("import { takeEscape } from '../utils/escapeLayer';"));
    assert.ok(src.includes('if (!open) return undefined;'));
    assert.ok(src.includes("document.addEventListener('keydown', onKey, true);"), 'before every listener on document and window');
    assert.ok(src.includes("return () => document.removeEventListener('keydown', onKey, true);"));
    assert.ok(src.includes('const onKey = (e) => { takeEscape(e, blocked, onEscape); };'));
});

test('the four document layers each take their Escape, before their early return, held by the layers above them', () => {
    const before = (src, hook, ret) => { const h = src.indexOf(hook); assert.ok(h >= 0, hook); assert.ok(h < src.indexOf(ret), `${hook.slice(0, 40)} … before ${ret}`); };
    const rail = read('src/components/documents/DocumentRail.jsx');
    before(rail, 'useEscapeLayer(!!doc, () => { document.activeElement?.blur?.(); close(); },', 'if (!doc) return null;');
    assert.ok(rail.includes('!!(showUploadRail || showDocLinkPicker || confirmModal || promptModal));'), 'the document rail waits for an upload, the link picker and the app\'s dialogs');
    const upload = read('src/components/documents/DocumentUploadRail.jsx');
    before(upload, 'useEscapeLayer(showUploadRail, () => { if (!uploading) close(); },', 'if (!showUploadRail) return null;');
    assert.ok(upload.includes('!!(showDocLinkPicker || confirmModal || promptModal));'));
    assert.equal(upload.split('onClick={!uploading ? close : undefined}').length - 1, 2, 'its backdrop and its × close nothing mid-upload, as Cancel');
    const link = read('src/components/documents/DocumentLinkPicker.jsx');
    before(link, 'useEscapeLayer(showDocLinkPicker, close, !!(confirmModal || promptModal));', 'if (!showDocLinkPicker) return null;');
    assert.equal(link.split('const close = () =>').length - 1, 1, 'one close');
    const picker = read('src/components/documents/DocumentPicker.jsx');
    before(picker, 'useEscapeLayer(open, () => onClose && onClose(), !!(confirmModal || promptModal));', 'if (!open) return null;');
});

// ── the guard ───────────────────────────────────────────────────────────────

const srcFiles = () => {
    const out = [];
    const walk = (dir) => {
        for (const e of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
            const p = dir + e.name;
            if (e.isDirectory()) walk(p + '/');
            else if (/\.jsx?$/.test(e.name)) out.push(p);
        }
    };
    walk('src/');
    return out;
};
const isFn = (n) => n && /^(ArrowFunctionExpression|FunctionExpression|FunctionDeclaration)$/.test(n.type);

// Every keydown listener added with addEventListener, with its handler's source.
const keydownListeners = (file, src) => {
    const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
    const out = [];
    const visit = (node, fns) => {
        if (!node || typeof node.type !== 'string') return;
        const inner = isFn(node) ? [...fns, node] : fns;
        if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression'
            && node.callee.property.name === 'addEventListener'
            && node.arguments[0]?.type === 'StringLiteral' && node.arguments[0].value === 'keydown') {
            const h = node.arguments[1];
            let body = null;
            if (isFn(h)) body = src.slice(h.start, h.end);
            else if (h?.type === 'Identifier') {
                // The handler's declaration in the function that adds it.
                const scope = inner[inner.length - 1];
                const find = (n) => {
                    if (!n || typeof n.type !== 'string' || body) return;
                    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === h.name && isFn(n.init)) body = src.slice(n.init.start, n.init.end);
                    for (const k of Object.keys(n)) { if (k === 'loc') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(find); else if (v && typeof v.type === 'string') find(v); }
                };
                find(scope);
            }
            out.push({ file, line: node.loc.start.line, body });
        }
        for (const k of Object.keys(node)) {
            if (k === 'loc') continue;
            const v = node[k];
            if (Array.isArray(v)) v.forEach((c) => visit(c, inner)); else if (v && typeof v.type === 'string') visit(v, inner);
        }
    };
    visit(ast.program, []);
    return out;
};

test('THE GUARD — every keydown listener under src that reacts to Escape leaves one a layer above took alone', () => {
    const all = srcFiles().flatMap((f) => keydownListeners(f, read(f)));
    assert.ok(all.length >= 16, `the walk finds the listeners (${all.length})`);
    const unread = all.filter((l) => l.body === null);
    assert.deepEqual(unread.map((l) => `${l.file}:${l.line}`), [], 'every handler found');
    const escapes = all.filter((l) => l.body.includes("'Escape'"));
    assert.ok(escapes.length >= 15, `the Escape listeners (${escapes.length})`);
    const blind = escapes.filter((l) => !l.body.includes('defaultPrevented'));
    assert.deepEqual(blind.map((l) => `${l.file}:${l.line}`), []);
});

test('the guard finds a listener as they were (HEAD before §0.180)', () => {
    const was = "function Rail() { useEffect(() => { const onKey = (e) => { if (e.key === 'Escape' && !isEditing) closeRail(); }; document.addEventListener('keydown', onKey); }, []); }";
    const [l] = keydownListeners('was.jsx', was);
    assert.ok(l.body.includes("'Escape'") && !l.body.includes('defaultPrevented'), 'found, and blind');
});
