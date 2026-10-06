// tests/layers.test.mjs
//
// The app's dialogs and toasts sit above every rail and modal (state §0.177).
// The confirm and prompt dialogs (.modal-overlay) sat at z-index 1000, under the
// draggable modals (10000), the lead form (9000) and the rails (10998 and up): the
// lead form's "Discard this lead?" opened behind the form, unseen and unclickable
// (observed), and a confirm from the deal modal could not be seen at all. The
// follow-up prompt (9991) and the Undo toast (10050) sat under the rails — the
// prompt offered after logging from a contact's rail was hidden by that rail
// (observed). The blocked-delete dialog (10200) sat under the rails too.
//
// THE GUARD: a scan of every z-index written in src — `zIndex: N` in a style,
// `z-index: N` in CSS — and each of the four is above all the others.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

const srcFiles = () => {
    const out = [];
    const walk = (dir) => {
        for (const e of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
            const p = dir + e.name;
            if (e.isDirectory()) walk(p + '/');
            else if (/\.(jsx?|mjs|css)$/.test(e.name)) out.push(p);
        }
    };
    walk('src/');
    return out;
};

// The four — the confirm and prompt share one class — each found by the line that sets it.
const APP_LAYERS = [
    ['src/index.css', 'z-index: 100100;   /* the app\'s confirm and prompt', 'the confirm and prompt dialogs (.modal-overlay)'],
    ['src/components/layout/ModalLayer.jsx', "background: 'rgba(28,25,23,0.55)', zIndex: 100100,", 'the blocked-delete dialog'],
    ['src/components/layout/ModalLayer.jsx', "transform: 'translateX(-50%)', zIndex: 100200,", 'the Undo toast'],
    ['src/components/layout/QuickLogFab.jsx', "left: isMobile ? '0.75rem' : 'auto', zIndex: 100050,", 'the follow-up prompt'],
];
const Z_RE = /(?:zIndex:\s*|z-index:\s*)(\d+)/g;

const everyZ = () => {
    const out = [];
    for (const f of srcFiles()) {
        const lines = read(f).split(/\r?\n/);
        lines.forEach((line, i) => {
            for (const m of line.matchAll(Z_RE)) out.push({ file: f, line: i + 1, z: Number(m[1]), text: line });
        });
    }
    return out;
};

test('the four are where this test reads them', () => {
    for (const [file, text, what] of APP_LAYERS) assert.equal(read(file).split(text).length - 1, 1, what);
});

test('THE GUARD — the app\'s dialogs and toasts are above every other layer in src', () => {
    const all = everyZ();
    const isApp = (z) => APP_LAYERS.some(([file, text]) => z.file === file && z.text.includes(text));
    const app = all.filter(isApp);
    assert.equal(app.length, APP_LAYERS.length, 'each of the four found once');
    const others = all.filter((z) => !isApp(z));
    const top = others.reduce((m, z) => (z.z > m.z ? z : m), { z: -1 });
    for (const a of app) assert.ok(a.z > top.z, `${a.file}:${a.line} (${a.z}) is not above ${top.file}:${top.line} (${top.z})`);
});

test('the dialogs sit above the toasts\' layers only where they must: a toast above a dialog, the confirm above the follow-up', () => {
    const [confirm, blocked, undo, followUp] = APP_LAYERS.map(([file, text]) => everyZ().find((z) => z.file === file && z.text.includes(text)).z);
    assert.ok(undo > confirm && undo > blocked, 'an Undo or error toast shows over an open dialog');
    assert.ok(confirm > followUp, 'a confirm opened over the follow-up prompt is not covered by it');
});

test('Escape: a handler that dealt with it marks it, App leaves a marked one alone, and the dialogs close first', () => {
    // The lead form's Escape opened "Discard this lead?" on document; App's handler,
    // on window, ran next in the same keypress and closed it 2 ms later (observed). And
    // App closed the deal modal before a confirm open over it.
    const app = read('src/App.jsx');
    const esc = app.slice(app.indexOf("if (e.key === 'Escape') {"), app.indexOf('// Don\'t fire shortcuts while typing'));
    assert.ok(esc.length > 0, 'the Escape branch');
    const marked = esc.indexOf('if (e.defaultPrevented) return;');
    assert.ok(marked > 0, 'a marked Escape is left alone');
    const firstClose = esc.search(/if \(\w+\) \{ set\w+\(/);
    assert.ok(marked < firstClose, 'before anything is closed');
    const confirmAt = esc.indexOf('if (confirmModal) { setConfirmModal(null); return; }');
    const promptAt = esc.indexOf('if (promptModal) { setPromptModal(null); return; }');
    assert.ok(confirmAt > 0 && promptAt > 0, 'the confirm and prompt close on Escape');
    for (const other of ['if (viewingActivity)', 'if (showActivityModal)', 'if (showModal)', 'if (taskRailId)']) {
        assert.ok(confirmAt < esc.indexOf(other) && promptAt < esc.indexOf(other), `a dialog closes before ${other}`);
    }
    assert.equal(esc.split('setConfirmModal(null)').length - 1, 1, 'once');
    const lead = read('src/components/modals/LeadModal.jsx');
    assert.match(lead, /if \(e\.key !== 'Escape'\) return;\s*e\.preventDefault\(\);/, 'the lead form marks the Escape it handles');
});
