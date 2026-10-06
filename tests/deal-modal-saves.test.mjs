// tests/deal-modal-saves.test.mjs
//
// What a deal's modal logs, deletes and notes is saved (state §0.177). ModalLayer
// handed OpportunityModal five callbacks that set the screen and sent nothing:
// an activity logged in the deal's History tab was gone on reload and one deleted
// there came back; a team note posted, edited or deleted lived on the deal on
// screen until the deal was saved — closing the modal instead lost it on reload.
// They now go through the data hooks — handleLogActivity, handleDeleteActivity,
// saveDealComments — and answer { ok, error }, which the modal shows: a failed
// save keeps the form, the draft or the edit.
//
// THE GUARD below is the class: a parse of every handler under src that sets a
// shared list — the rows the server stores — with no server call anywhere in it.
// The five were all it found among the record lists; what is left is named, each
// with its reason.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const between = (src, from, to) => { const a = src.indexOf(from); assert.ok(a >= 0, from); const b = src.indexOf(to, a); assert.ok(b > a, to); return src.slice(a, b); };

// ── the five callbacks ──────────────────────────────────────────────────────

test('ModalLayer: the deal modal logs, deletes and notes through the hooks — nothing set on screen alone', () => {
    const src = read('src/components/layout/ModalLayer.jsx');
    const props = between(src, '<OpportunityModal', 'onClose={() => {');
    assert.ok(props.includes("onSaveActivity={(activityData) => handleLogActivity({ ...activityData, id: 'id_' + crypto.randomUUID(), createdAt: new Date().toISOString(), author: currentUser || '' })}"));
    assert.ok(props.includes('onDeleteActivity={(activityId) => handleDeleteActivity(activityId)}'));
    assert.ok(props.includes('onSaveComment={(oppId, comment) => saveNotes(oppId, (list) => [...list, comment])}'));
    assert.ok(props.includes('onEditComment={(oppId, commentId, newText) => saveNotes(oppId, (list) => list.map(c =>'));
    assert.ok(props.includes("showConfirm('Delete this note? It cannot be undone.', () => { saveNotes(oppId, (list) => list.filter(c => c.id !== commentId)).then(answer); });"));
    for (const setter of ['setActivities(', 'setOpportunities(']) assert.ok(!props.includes(setter), `${setter} in the deal modal's props`);
    const notes = between(src, 'const saveNotes = async (oppId, change) => {', 'return (');
    assert.ok(notes.includes('const r = await saveDealComments(oppId, next);'));
    assert.ok(notes.indexOf('if (!stillOrg(askedOrg)) return stopped();') < notes.indexOf('setEditingOpp('), 'the open deal takes the notes after the org check');
    assert.ok(notes.includes('if (r.ok) setEditingOpp('), 'and only once the server has them');
});

test('useActivities: a logged activity is POSTed and shown only once the server has it', () => {
    const src = read('src/hooks/useActivities.js');
    const log = between(src, 'const handleLogActivity = async (activity) => {', 'return { ok: true };');
    assert.ok(log.includes("const r = await dbWrite('/.netlify/functions/activities', {"));
    assert.ok(log.includes("method: 'POST',"));
    assert.ok(log.includes('if (!r.ok) return { ok: false, error: r.error };'), 'a refused POST answers its error');
    assert.ok(log.indexOf('if (!r.ok) return { ok: false, error: r.error };') < log.indexOf('setActivities(prev => [...prev, activity]);'), 'shown only after the POST landed');
    assert.ok(src.includes('handleLogActivity,'), 'returned');
});

test('useActivities: a delete asks, waits for its DELETE, and offers Undo only after it landed', () => {
    const src = read('src/hooks/useActivities.js');
    const del = between(src, 'const handleDeleteActivity = (activityId) => {', 'const handleLogActivity');
    assert.ok(del.includes('const activity = activities.find(a => a.id === activityId);'), 'read from state, not through an updater');
    assert.ok(!del.includes('setActivities(prev => { activity ='), 'the updater read');
    assert.ok(del.includes("showConfirm('Delete this activity? You\\'ll have a few seconds to undo.', async () => {"));
    const awaitAt = del.indexOf("const r = await dbWrite(`/.netlify/functions/activities?id=${activityId}`, { method: 'DELETE' });");
    assert.ok(awaitAt > 0, 'the DELETE awaited');
    assert.ok(del.indexOf('softDelete(') > awaitAt, 'Undo once the DELETE has landed');
    assert.ok(del.indexOf("setUndoToast({ error: `Activity not deleted — ${r.error}` });") > awaitAt, 'a refused delete says so');
    assert.match(del, /if \(!r\.ok\) \{\s*setActivities\(prev => \(prev\.some\(a => a\.id === activityId\) \? prev : \[\.\.\.prev, activity\]\)\);/, 'and puts the row back');
});

test('App: useActivities gets the shared deps — softDelete and setUndoToast are defined in it', () => {
    const app = read('src/App.jsx');
    assert.ok(app.includes('} = useActivities(_deps);'));
    assert.ok(!app.includes('useActivities({ showConfirm'), 'handed showConfirm alone');
    for (const name of ['handleLogActivity,', 'saveDealComments,']) assert.ok(app.split(name).length - 1 >= 1, name);
});

test('useOpportunities: notes are PUT alone, and the list takes them only once the server has them', () => {
    const src = read('src/hooks/useOpportunities.js');
    const save = between(src, 'const saveDealComments = async (oppId, comments) => {', 'return { ok: true };');
    assert.ok(save.includes("method: 'PUT',"));
    assert.ok(save.includes('body: JSON.stringify({ id: oppId, comments }),'));
    assert.ok(save.includes('if (!r.ok) return { ok: false, error: r.error };'), 'a refused PUT answers its error');
    assert.ok(save.indexOf('if (!r.ok) return { ok: false, error: r.error };') < save.indexOf('setOpportunities(prev => prev.map(o => (o.id === oppId ? { ...o, comments } : o)));'));
});

test('OpportunityModal: the History tab and the notes wait for the save — a failure keeps what was typed and says why', () => {
    const src = read('src/components/modals/OpportunityModal.jsx');
    const log = between(src, 'const logActivity = async () => {', 'Save Activity</PrimaryBtn>');
    assert.ok(log.includes('const r = await onSaveActivity('));
    assert.ok(log.includes("if (!r?.ok) { setLogState({ saving: false, error: r?.error || 'The activity was not saved.' }); return; }"), 'a failed save keeps the form');
    assert.ok(log.indexOf("if (!r?.ok) { setLogState({ saving: false, error: r?.error || 'The activity was not saved.' }); return; }") < log.indexOf("setNewActivity({ type: 'Call'"), 'the form resets only after a save');
    assert.ok(src.includes('<PrimaryBtn type="button" saving={logState.saving} onClick={logActivity}>Save Activity</PrimaryBtn>'));
    assert.ok(src.includes('{logState.error && ('));
    const post = between(src, 'const postNote = async () => {', 'const saveNoteEdit');
    assert.ok(post.includes("if (!r?.ok) { setNoteState({ saving: false, error: r?.error || 'The note was not saved.' }); return; }"), 'a failed post keeps the draft');
    assert.ok(post.indexOf("if (!r?.ok) { setNoteState({ saving: false, error: r?.error || 'The note was not saved.' }); return; }") < post.indexOf("setCommentDraft(''); setMentionQuery(null);"), 'the draft clears only after a save');
    const edit = between(src, 'const saveNoteEdit = async (commentId) => {', 'const deleteNote');
    assert.ok(edit.includes("if (!r?.ok) { setNoteState({ saving: false, error: r?.error || 'The note was not saved.' }); return; }"), 'a failed edit stays open');
    assert.ok(edit.indexOf('return; }') < edit.indexOf('setEditingCommentId(null);'), 'the edit closes only after a save');
    assert.ok(src.includes('<PrimaryBtn type="button" saving={noteState.saving} onClick={postNote}>Post Note</PrimaryBtn>'));
    assert.ok(src.includes('<PrimaryBtn type="button" saving={noteState.saving} onClick={() => saveNoteEdit(c.id)}>Save</PrimaryBtn>'));
    assert.ok(src.includes('<button type="button" onClick={() => deleteNote(c.id)} title="Delete"'));
    assert.ok(src.includes('{noteState.error && ('));
    assert.equal((src.match(/onSaveComment && onSaveComment\(/g) || []).length, 0, 'a post that never waited');
});

// ── the class ───────────────────────────────────────────────────────────────

const SHARED = new Set(['setOpportunities', 'setAccounts', 'setContacts', 'setTasks', 'setActivities', 'setCoachingNotes',
    'setDocuments', 'setQuotes', 'setProducts', 'setLeads', 'setSpiffClaims', 'setSettings']);
// A server call: a request, or a helper that sends one and answers with what it saved.
const SERVER = /\b(dbFetch|dbWrite|putSettings|fetch|postNew|putBulk|saveUser|saveExtra|setMemberActive|uploadNewDocument|uploadNewVersion|handleSave\w*|handleDelete\w*|handleLog\w*|saveDeal\w*|handleMerge|reverseMerge|handleContactMerge|reverseContactMerge|softDelete|load[A-Z]\w*)\s*\(/;
// What sets a shared list without a request of its own, and why that is right.
const ALLOWED = [
    ['src/components/layout/ModalLayer.jsx', 'setLeads(prev => [...(prev||[]), lead])', 'the lead form saved it (LeadModal) and hands back the saved row'],
    ['src/hooks/useCoachingNotes.js', 'setCoachingNotes(prev => (prev.length ? [] : prev))', 'empties the list when there is no org'],
    ['src/Tabs/SalesManagerTab.jsx', 'setSettings(prev => ({...prev, __qbTerrFilter:v}))', 'a screen filter kept on the settings object, never saved'],
    ['src/Tabs/SalesManagerTab.jsx', 'setSettings(prev=>({...prev,_spiffClaimFilter:s}))', 'a screen filter kept on the settings object, never saved'],
];

const isFn = (n) => n && /^(ArrowFunctionExpression|FunctionExpression|FunctionDeclaration|ObjectMethod|ClassMethod)$/.test(n.type);
const srcFiles = () => {
    const out = [];
    const walk = (dir) => {
        for (const e of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
            const p = dir + e.name;
            if (e.isDirectory()) walk(p + '/');
            else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(p);
        }
    };
    walk('src/');
    return out;
};
const screenOnly = (file, src) => {
    const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
    const local = new Set([...src.matchAll(/const \[\w+,\s*(set\w+)\]\s*=\s*useState/g)].map((m) => m[1]));
    const owner = /^src\/(App\.jsx|hooks\/[^/]+\.js)$/.test(file);
    const hits = [];
    const visit = (node, anc) => {
        if (!node || typeof node.type !== 'string') return;
        if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && SHARED.has(node.callee.name)
            && (owner || !local.has(node.callee.name))) {
            const fns = anc.filter(isFn);
            const handler = fns.length >= 2 ? fns[1] : fns[0];
            if (handler && !SERVER.test(src.slice(handler.start, handler.end))) {
                hits.push({ file, line: node.loc.start.line, call: src.slice(node.start, node.end).replace(/\s+/g, ' ') });
            }
        }
        for (const k of Object.keys(node)) {
            if (k === 'loc' || k === 'start' || k === 'end') continue;
            const v = node[k];
            if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && visit(c, [...anc, node]));
            else if (v && typeof v.type === 'string') visit(v, [...anc, node]);
        }
    };
    visit(ast.program, []);
    return hits;
};

test('THE GUARD — no handler sets a shared list without a server call, unless it is named here with its reason', () => {
    const hits = srcFiles().flatMap((f) => screenOnly(f, read(f)));
    const unexplained = hits.filter((h) => !ALLOWED.some(([file, call]) => h.file === file && h.call.startsWith(call)));
    assert.deepEqual(unexplained.map((h) => `${h.file}:${h.line} ${h.call.slice(0, 90)}`), []);
    // and every allowance still names something — a stale one would excuse the next
    for (const [file, call] of ALLOWED) assert.ok(hits.some((h) => h.file === file && h.call.startsWith(call)), `stale allowance: ${file} ${call}`);
});

test('the guard finds the five it was written for, as they were (HEAD before §0.177)', () => {
    const before = `
        export default function ModalLayer() {
            const { setActivities, setOpportunities, setEditingOpp, currentUser } = useApp();
            return (<OpportunityModal
                onSaveActivity={(activityData) => { const newId = 'id_' + crypto.randomUUID(); setActivities(prev => [...prev, { ...activityData, id: newId }]); }}
                onDeleteActivity={(activityId) => { setActivities(prev => prev.filter(a => a.id !== activityId)); }}
                onSaveComment={(oppId, comment) => { setOpportunities(prev => prev.map(o => o)); }}
                onEditComment={(oppId) => { setOpportunities(prev => prev.map(o => o)); }}
                onDeleteComment={(oppId) => { setOpportunities(prev => prev.map(o => o)); }}
            />);
        }`;
    assert.equal(screenOnly('src/components/layout/ModalLayer.jsx', before).length, 5);
});
