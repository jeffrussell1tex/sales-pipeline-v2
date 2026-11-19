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
    assert.ok(read('src/hooks/useModalState.js').includes('const [promptModal, setPromptModal] = useOrgBoundState(resets, null);'));
    const app = read('src/App.jsx');
    assert.ok(app.includes('promptModal, setPromptModal,'), 'App destructures the state');
    assert.ok(app.includes('const showPrompt = ('), 'App defines showPrompt');
    assert.ok(app.includes('        showPrompt,'), 'App exposes showPrompt in the context');
    assert.ok(app.includes("case 'prompt': setPromptModal(null); return;"), 'Escape closes it — when it is the layer on top (§0.189)');
    const ml = read('src/components/layout/ModalLayer.jsx');
    assert.ok(ml.includes('{promptModal && ('), 'ModalLayer renders it');
    assert.ok(ml.includes("autoFocus"), 'the input takes focus');
});

test('every replaced site goes through showConfirm / showPrompt', () => {
    assert.ok(read('src/Tabs/ReportsTab.jsx').includes('showConfirm(`Delete the saved report "${r.name}"?`, async () => {'));
    assert.ok(read('src/components/documents/DocumentRail.jsx').includes('showConfirm(`Delete "${doc.name}"? This removes the file and all its versions.`, () => {'));
    assert.ok(read('src/Tabs/DocumentsTab.jsx').includes('showConfirm(`Delete "${doc.name}"? This removes the file and all its versions.`, () => {'));
    // Since §0.232 Edit brand asks through the one close every window shares — useLocalLayer's, which asks through
    // showConfirm ("Discard changes?", tests/tab-layers.test.mjs).
    assert.ok(read('src/Tabs/settings/quoting/EditBrandModal.jsx').includes('  const close = useLocalLayer(true, { onClose, dirty, busy: saving });'));
    assert.ok(read('src/hooks/useLocalLayer.js').includes('a.showConfirm(DISCARD_MESSAGE, () => {'));
    // PriceBookDetail.jsx (two showConfirm sites) was deleted in §0.149 — the
    // Settings card now opens Quotes → Price Book, the catalog quotes draw from.
    // RolesDetail's "Rename role" prompt went with the invented roles it renamed
    // (§0.171): the page is a statement of the six real ones and renames nothing.
    assert.ok(!/\bprompt\(|\bconfirm\(/.test(read('src/Tabs/settings/people/RolesDetail.jsx')), 'no native dialog on the Roles page');
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

// §0.272: a confirm's button names its own action. ModalLayer falls back to "Delete" for a danger confirm
// with no labels — right for a delete, wrong over a Void, a Rotate, a Remove or a Deactivate (Jeff, 19 Nov:
// "Void button wording"). Every showConfirm under src/ is parsed: a danger one (third argument true or left
// out) whose message is not a literal starting "Delete" or "Permanently delete" passes labels naming its
// confirm word.
test('§0.272 every danger confirm that is not a delete names its own button', async () => {
    const { parse } = await import('@babel/parser');
    const ml = read('src/components/layout/ModalLayer.jsx');
    assert.ok(ml.includes("{confirmModal.labels?.confirm || (confirmModal.danger !== false ? 'Delete' : 'Confirm')}"),
        'the premise: an unlabelled danger confirm reads "Delete"');
    assert.ok(read('src/App.jsx').includes('const showConfirm = (message, onConfirm, danger = true, labels = null) => {'),
        'the premise: danger defaults to true');
    const calls = [], offenders = [];
    for (const f of walk(fileURLToPath(new URL('src', root)))) {
        const src = readFileSync(f, 'utf8');
        if (!src.includes('showConfirm(')) continue;
        const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
        const visit = (n) => {
            if (!n || typeof n.type !== 'string') return;
            if (n.type === 'CallExpression') {
                const c = n.callee;
                const name = c.type === 'Identifier' ? c.name : (c.type === 'MemberExpression' && !c.computed ? c.property.name : null);
                if (name === 'showConfirm' && n.arguments.length) {
                    const [msg, , danger, labels] = n.arguments;
                    const where = `${f.replace(/\\/g, '/').replace(/^.*?\/src\//, 'src/')}:${n.loc.start.line}`;
                    calls.push(where);
                    const isDanger = !danger || !(danger.type === 'BooleanLiteral' && danger.value === false);
                    const head = msg.type === 'StringLiteral' ? msg.value
                        : msg.type === 'TemplateLiteral' ? msg.quasis[0].value.cooked : null;
                    const isDelete = head != null && /^(Delete|Permanently delete) /.test(head);
                    const named = labels && (labels.type === 'Identifier'
                        || (labels.type === 'ObjectExpression' && labels.properties.some(p => p.key && (p.key.name || p.key.value) === 'confirm')));
                    if (isDanger && !isDelete && !named) offenders.push(`${where}: ${src.slice(msg.start, msg.end).slice(0, 60)}`);
                }
            }
            for (const k of Object.keys(n)) {
                if (k === 'loc') continue;
                const v = n[k];
                if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v === 'object') visit(v);
            }
        };
        visit(ast.program);
    }
    assert.ok(calls.length >= 35, `the scan reads every confirm (found ${calls.length})`);
    assert.deepEqual(offenders, [], 'a danger confirm that is not a delete shows "Delete" on its button');
    // The batch's own five, by their words.
    assert.ok(read('src/Tabs/DispatchTab.jsx').includes("a new invoice can be raised for this job.`, go, true, { confirm: 'Void invoice' });"));
    const audit = read('src/Tabs/settings/audit/AuditDetail.jsx');
    assert.ok(audit.includes("}, true, { confirm: 'Rotate secret' });"));
    assert.ok(audit.includes("}, true, { confirm: 'Remove' });"));
    assert.ok(read('src/Tabs/SalesManagerTab.jsx').includes("()=>removeSpiff(spiff),true,{ confirm: 'Remove' })"));
    assert.ok(read('src/hooks/useQuotes.js').includes("doDelete, true, { confirm: 'Deactivate' });"));
});
