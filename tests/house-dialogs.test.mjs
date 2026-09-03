// tests/house-dialogs.test.mjs
//
// Handoff items 13 and 14: every native confirm()/prompt() replaced by the
// app's own dialogs (confirmModal, and the new promptModal), and coaching
// notes persisted through settings — with a Manager allowed to write THAT key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(jsx?|mjs)$/.test(name)) out.push(p);
    }
    return out;
};

test('no native confirm() or prompt() survives anywhere under src/', () => {
    const offenders = [];
    for (const f of walk(fileURLToPath(new URL('src', root)))) {
        const src = readFileSync(f, 'utf8');
        for (const m of src.matchAll(/(?<![\w.$])(?:window\.)?(confirm|prompt)\(/g)) offenders.push(`${f}: ${m[0]}`);
    }
    assert.deepEqual(offenders, [], 'native dialogs');
});

test('the house prompt dialog is wired: state, opener, context, renderer', () => {
    assert.ok(read('src/hooks/useModalState.js').includes('const [promptModal, setPromptModal] = useState(null);'));
    const app = read('src/App.jsx');
    assert.ok(app.includes('promptModal, setPromptModal,'), 'App destructures the state');
    assert.ok(app.includes('const showPrompt = ('), 'App defines showPrompt');
    assert.ok(app.includes('        showPrompt,'), 'App exposes showPrompt in the context');
    assert.ok(app.includes('if (promptModal) { setPromptModal(null); return; }'), 'Escape closes it');
    const ml = read('src/components/layout/ModalLayer.jsx');
    assert.ok(ml.includes('{promptModal && ('), 'ModalLayer renders it');
    assert.ok(ml.includes("autoFocus"), 'the input takes focus');
});

test('every replaced site goes through showConfirm / showPrompt', () => {
    assert.ok(read('src/Tabs/ReportsTab.jsx').includes('showConfirm(`Delete the saved report "${r.name}"?`, async () => {'));
    assert.ok(read('src/components/documents/DocumentRail.jsx').includes('showConfirm(`Delete "${doc.name}"? This removes the file and all its versions.`, () => {'));
    assert.ok(read('src/Tabs/DocumentsTab.jsx').includes('showConfirm(`Delete "${doc.name}"? This removes the file and all its versions.`, () => {'));
    assert.ok(read('src/Tabs/settings/quoting/EditBrandModal.jsx').includes("showConfirm('Discard unsaved brand changes?', onClose, false)"));
    const pb = read('src/Tabs/settings/quoting/PriceBookDetail.jsx');
    assert.ok(pb.includes("showConfirm('Discard unsaved changes?', onClose, false)"));
    assert.ok(pb.includes('showConfirm(`Archive "${product.name}"? It will no longer appear in new quotes.`, () => {'));
    assert.ok(read('src/Tabs/settings/people/RolesDetail.jsx').includes("showPrompt({ title:'Rename role'"));
    // The coaching note moved from the house prompt to its own dialog with a
    // picker (state §0.82; tests/coaching-notes.test.mjs pins that wiring).
    const sm = read('src/Tabs/SalesManagerTab.jsx');
    assert.ok(!sm.includes("prompt('Add coaching note"));
    assert.ok(sm.includes('onClick={showCoachingNote}'));
});

test('coachingNotes is OUT of settings.mjs entirely (§0.83), and the Manager carve-out is gone (§0.82)', () => {
    const s = read('netlify/functions/settings.mjs');
    assert.doesNotMatch(s, /coachingNotes:/, 'neither half carries the key — the notes have their own table');
    assert.ok(!s.includes('managerNote'), 'no Manager may write the settings blob');
    assert.ok(s.includes("const forbidden = requireRole(auth, ['Admin'], headers);"));
});
