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
import { parseCoachingNote, newCoachingNote, withCoachingNote } from '../src/utils/coachingNotes.js';

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

test('parseCoachingNote: "rep: text" splits on the first colon; no colon is text only', () => {
    assert.deepEqual(parseCoachingNote('Karen Russell: great discovery call'), { rep: 'Karen Russell', text: 'great discovery call' });
    assert.deepEqual(parseCoachingNote('follow up on pricing: soon'), { rep: 'follow up on pricing', text: 'soon' });
    assert.deepEqual(parseCoachingNote('no rep here'), { rep: '', text: 'no rep here' });
    assert.deepEqual(parseCoachingNote('Karen:'), { rep: '', text: 'Karen' });
    assert.equal(parseCoachingNote('   '), null);
    assert.equal(parseCoachingNote(null), null);
});

test('newCoachingNote builds the stored row on the local day; withCoachingNote appends', () => {
    const n = newCoachingNote({ input: 'Karen Russell: nice close', author: 'Jeff', today: '2026-09-02', id: 'cn_1' });
    assert.deepEqual(n, { id: 'cn_1', rep: 'Karen Russell', text: 'nice close', date: '2026-09-02', author: 'Jeff' });
    assert.equal(newCoachingNote({ input: '', author: 'Jeff' }), null);
    assert.deepEqual(withCoachingNote([{ id: 'a' }], n), [{ id: 'a' }, n]);
    assert.deepEqual(withCoachingNote(undefined, n), [n], 'a first note on an org with none');
    // The day is the LOCAL day (18b26): the helper defaults `today` to todayLocal(), never a UTC slice.
    const helper = read('src/utils/coachingNotes.js');
    assert.ok(helper.includes('today = todayLocal()'), 'the default day is local');
    assert.ok(!helper.includes('toISOString'), 'no UTC day');
});

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
    const sm = read('src/Tabs/SalesManagerTab.jsx');
    assert.ok(sm.includes("title: 'Add coaching note',") && sm.includes('}, (input) => {'), 'the coaching note opens the house prompt');
    assert.ok(!sm.includes("prompt('Add coaching note"));
    assert.ok(sm.includes('const note = newCoachingNote({ input, author: currentUser });'));
    assert.ok(sm.includes('coachingNotes: withCoachingNote(prev.coachingNotes, note)'));
});

test('coachingNotes is in BOTH halves of settings.mjs, and a Manager may write that key alone', () => {
    const s = read('netlify/functions/settings.mjs');
    assert.ok(s.includes("coachingNotes:        row.extra?.coachingNotes        || [],"), 'GET returns it');
    assert.ok(s.includes("coachingNotes:        'coachingNotes'        in data ? (data.coachingNotes        || [])   : existingExtra.coachingNotes        || [],"), 'PUT merges it');
    assert.ok(s.includes("const managerNote = auth.userRole === 'Manager' && 'coachingNotes' in body;"));
    assert.ok(s.includes("const forbidden = managerNote ? null : requireRole(auth, ['Admin'], headers);"));
    assert.ok(s.includes("const data = managerNote ? { coachingNotes: body.coachingNotes } : body;"), 'a Manager write carries nothing else');
});
