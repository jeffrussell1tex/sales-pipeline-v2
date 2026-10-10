// tests/owner-kept.test.mjs
//
// PROD, 9 Oct (state §0.193; Jeff: "I am in production and I cant close lost a deal. it
// is stuck here"): two members of Jeff's org read "Jeff Russell" ('Jeff Russell' and
// 'Jeff Russell   '). Every update resolved the owner name it was sent, changed or not,
// so every save of a deal naming Jeff Russell answered 409 "Ambiguous owner"; and the
// Closed Lost dialog put that refusal in the deal window, which had closed when the
// dialog opened — it sat there without a word. Jeff unblocked it by renaming the other
// member; these hold the fix:
//   KEEP     an update that names the owner the row already names, on a row with an
//            owner id, keeps that owner (keepsOwner, run here) — every update path
//            passes its stored row (THE GUARD: a parse of every ownerIdForUpdate call)
//   WORDS    the ambiguous-owner 409 says what to do and carries no member's email
//   DIALOG   the reason dialog shows a refused save, keeps the choice, sends one save at
//            a time, and closes without saving (Jeff: "Close without saving"); a new
//            deal keeps one id across retries; N no longer opens a deal window over it
// tests/integration/owner-kept.itest.mjs proves KEEP against the real endpoints.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';
import { keepsOwner, OWNER_NAME_COLUMNS } from '../netlify/functions/_ownership.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const between = (src, from, to) => { const a = src.indexOf(from); assert.ok(a >= 0, from); const b = src.indexOf(to, a + from.length); assert.ok(b > a, to); return src.slice(a, b); };
const count = (src, s) => src.split(s).length - 1;
const walk = (node, visit) => {
    if (!node || typeof node.type !== 'string') return;
    visit(node);
    for (const k of Object.keys(node)) {
        if (k === 'loc' || k === 'start' || k === 'end' || k === 'extra') continue;
        const v = node[k];
        if (Array.isArray(v)) v.forEach((c) => walk(c, visit));
        else if (v && typeof v.type === 'string') walk(v, visit);
    }
};

const OWNER = 'usr_itest-twin';

test('KEEP: the owner named in exactly the stored text, on a row with an owner id, is kept — what every editor sends back', () => {
    assert.equal(keepsOwner({ salesRep: 'Jeff Russell', ownerId: OWNER }, { salesRep: 'Jeff Russell' }, 'opportunity'), true);
    assert.equal(keepsOwner({ salesRep: 'Jeff Russell   ', ownerId: OWNER }, { salesRep: 'Jeff Russell   ' }, 'opportunity'), true, 'the prod pair\'s spaced text, sent back as stored');
});

test('KEEP: another spelling is a pick — it resolves (and two members of one name answer 409), never keeps', () => {
    // The review (§0.193): picking the other of 'Jeff Russell' / 'Jeff Russell   ' sent the
    // other spelling, which a trimmed, any-case match KEPT — the move was silently lost.
    const stored = { salesRep: 'Jeff Russell', ownerId: OWNER };
    for (const name of ['jeff russell', '  JEFF RUSSELL   ', 'Jeff Russell   ', 'Jeff  Russell']) {
        assert.equal(keepsOwner(stored, { salesRep: name }, 'opportunity'), false, JSON.stringify(name));
    }
});

test('KEEP: a different name, a cleared name, an omitted name, or a row with no owner id is resolved as before', () => {
    const stored = { salesRep: 'Jeff Russell', ownerId: OWNER };
    assert.equal(keepsOwner(stored, { salesRep: 'Solo Rep' }, 'opportunity'), false, 'a reassignment');
    assert.equal(keepsOwner(stored, { salesRep: '' }, 'opportunity'), false, 'cleared');
    // An owned row whose name text is blank (an account saved with only its id): a save
    // that names no one either keeps it — it unassigned it (§0.193's second review).
    assert.equal(keepsOwner({ salesRep: '', ownerId: OWNER }, { salesRep: '  ' }, 'opportunity'), true, 'blank over blank keeps');
    assert.equal(keepsOwner({ accountOwner: null, ownerId: OWNER }, { accountOwner: '' }, 'account'), true);
    assert.equal(keepsOwner({ salesRep: '', ownerId: null }, { salesRep: '' }, 'opportunity'), false, '...but a row with no owner id has nothing to keep');
    assert.equal(keepsOwner(stored, { salesRep: null }, 'opportunity'), false);
    assert.equal(keepsOwner(stored, { nextSteps: 'x' }, 'opportunity'), false, 'not named: ownerIdForUpdate leaves it before this');
    assert.equal(keepsOwner({ salesRep: 'Jeff Russell', ownerId: null }, { salesRep: 'Jeff Russell' }, 'opportunity'), false, 'saved before ids: it still heals');
    assert.equal(keepsOwner({ salesRep: 'Jeff Russell', ownerId: 'user_clerk123' }, { salesRep: 'Jeff Russell' }, 'opportunity'), false, 'a Clerk id is no owner id');
    assert.equal(keepsOwner(undefined, { salesRep: 'Jeff Russell' }, 'opportunity'), false, 'no stored row');
    assert.equal(keepsOwner(stored, undefined, 'opportunity'), false);
});

test('KEEP: each entity reads its own owner-name column', () => {
    for (const [entity, col] of Object.entries(OWNER_NAME_COLUMNS)) {
        assert.equal(keepsOwner({ [col]: 'Ann Lee', ownerId: OWNER }, { [col]: 'Ann Lee' }, entity), true, entity);
        assert.equal(keepsOwner({ [col]: 'Ann Lee', ownerId: OWNER }, { [col]: 'Bo Chen' }, entity), false, entity);
    }
    assert.throws(() => keepsOwner({}, {}, 'widget'), /no display-name column registered/);
});

test('KEEP: ownerIdForUpdate asks it first, after the omitted-name answer', () => {
    const s = read('netlify/functions/_lib.mjs');
    const fn = between(s, 'export async function ownerIdForUpdate({ payload, entity, orgId, stored }) {', '\n}\n');
    const omitted = fn.indexOf("if (!payload || !(nameKey in payload)) return { change: false };");
    const kept = fn.indexOf('if (keepsOwner(stored, payload, entity)) return { change: false };');
    const resolved = fn.indexOf('await resolveOwnerId(supplied, orgId)');
    assert.ok(omitted > 0 && kept > omitted && resolved > kept, 'omitted, then kept, then resolved');
    assert.ok(s.includes("import { ownerColumnOf, ownerKeyFor, ownerNameKeyFor, mayMutate, OWNERSHIP_FORBIDDEN, isAppUserId, keepsOwner } from './_ownership.mjs';"));
});

test('THE GUARD: every ownerIdForUpdate call passes the stored row it loaded', () => {
    const dir = new URL('netlify/functions/', ROOT);
    const calls = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.mjs'))) {
        const src = read(`netlify/functions/${f}`);
        if (!src.includes('ownerIdForUpdate(')) continue;
        walk(parse(src, { sourceType: 'module' }), (n) => {
            if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'ownerIdForUpdate') {
                const arg = n.arguments[0];
                const stored = arg?.type === 'ObjectExpression' && arg.properties.find((p) => p.key?.name === 'stored');
                calls.push(`${f} ${stored ? src.slice(stored.value.start, stored.value.end) : '(none)'}`);
            }
        });
    }
    assert.deepEqual(calls.sort(), [
        'accounts.mjs prior', 'activities.mjs target', 'contacts.mjs target',
        'leads.mjs existing', 'opportunities.mjs existing', 'tasks.mjs existing',
    ]);
    // ...and each name is the full stored row that file loaded (select() of the table, by id and org).
    for (const [f, v, table] of [['accounts', 'prior', 'accounts'], ['activities', 'target', 'activities'], ['contacts', 'target', 'contacts'],
        ['leads', 'existing', 'leads'], ['opportunities', 'existing', 'opportunities'], ['tasks', 'existing', 'tasks']]) {
        const src = read(`netlify/functions/${f}.mjs`);
        assert.ok(src.includes(`const [${v}] = await db.select().from(${table}).where(and(eq(${table}.id, data.id), eq(${table}.orgId, orgId)));`), `${f}: ${v} is the stored row`);
    }
});

test('THE GUARD finds the shape as it was', () => {
    const src = "await ownerIdForUpdate({ payload: data, entity: 'opportunity', orgId });";
    let stored = 'unseen';
    walk(parse(src, { sourceType: 'module', allowAwaitOutsideFunction: true }), (n) => {
        if (n.type === 'CallExpression' && n.callee.name === 'ownerIdForUpdate') stored = n.arguments[0].properties.find((p) => p.key?.name === 'stored') ? 'passed' : '(none)';
    });
    assert.equal(stored, '(none)');
});

test('WORDS: the ambiguous-owner 409 says what to do, and carries no member\'s email', () => {
    const s = read('netlify/functions/_lib.mjs');
    const fn = between(s, 'export async function resolveOwnerId(name, orgId) {', '\n}\n');
    assert.ok(fn.includes('`${matches.length} members of this organization are named "${String(name).trim()}", ` +'));
    assert.ok(fn.includes('`so the app cannot tell which one is meant. An Admin can rename one of them in ` +'));
    assert.ok(fn.includes('`Settings → Users; then choose the right person on this record and save again.`'));
    assert.ok(fn.includes('err.candidates = matches.map((m) => ({ id: m.id }));'));
    assert.ok(!fn.includes('m.email'), 'no email in the words or the candidates');
});

test('DIALOG: the Closed Lost save answers the dialog — refused, it says why and rolls back only its deal; a new deal keeps one id', () => {
    const h = read('src/hooks/useOpportunities.js');
    assert.ok(h.includes("setLostReasonModal({ pendingFormData: (editingOpp && editingOpp.id) ? enrichedData : { ...enrichedData, id: 'id_' + crypto.randomUUID() }, editingOpp });"), 'the id given once, when the dialog opens');
    const fn = between(h, 'const completeLostSave = async (', '\n    };\n');
    assert.ok(!fn.includes('setOppModalError('), 'never to the closed deal window');
    assert.ok(fn.includes('if (editingOppRef && editingOppRef.id) {'), 'a seeded deal with no id is new');
    assert.equal(count(fn, 'return { ok: false, error: `Not saved as Closed Lost — ${r.error}` };'), 2);
    // The edit branch: the stored deal taken before the optimistic write, put back before it answers.
    const cap = fn.indexOf('const before = opportunities.find(o => o.id === editingOppRef.id);');
    const opt = fn.indexOf('setOpportunities(prev => prev.map(opp => opp.id === editingOppRef.id ? updatedOpp : opp));');
    const rb = fn.indexOf('setOpportunities(prev => prev.map(o => (o.id === editingOppRef.id && before ? before : o)));');
    const ret = fn.indexOf('return { ok: false, error: `Not saved as Closed Lost');
    assert.ok(cap >= 0 && opt > cap, 'the stored deal is taken before the optimistic write');
    assert.ok(rb > opt && rb < ret, 'rolled back before it answers');
    // The new-deal branch: a refused deal leaves the board before it answers (a retry re-adds it).
    const post = fn.slice(fn.indexOf("const newId = formData.id || ('id_' + crypto.randomUUID());"));
    const prb = post.indexOf('setOpportunities(prev => prev.filter(o => o.id !== newId));');
    assert.ok(prb > 0 && prb < post.indexOf('return { ok: false, error: `Not saved as Closed Lost — ${r.error}` };'), 'a refused new deal leaves the board');
    assert.ok(fn.includes("const newId = formData.id || ('id_' + crypto.randomUUID());"), 'a retry is the same deal');
    assert.equal(count(fn, 'if (!stillOrg(askedOrg)) return stopped();'), 2);
    assert.ok(fn.includes('setLostReasonModal(null);\n        return { ok: true };'), 'closed only once stored');
});

test('DIALOG: the reason dialog shows the refusal, keeps the choice, sends one save, and closes without saving', () => {
    const m = read('src/components/modals/LostReasonModal.jsx');
    assert.ok(m.includes('export default function LostReasonModal({ oppName, onSave, onSkip, onCancel }) {'));
    assert.ok(m.includes('const inFlight = useRef(false);'));
    assert.ok(m.includes('if (inFlight.current) return;\n        inFlight.current = true; setBusy(true); setRefusal(\'\');'), 'one save at a time');
    assert.ok(m.includes("try { r = await save(); } catch { r = { ok: false, error: 'The change was not saved. Try again.' }; }"), 'a thrown save never locks the dialog');
    assert.ok(m.includes('if (r && !r.ok) { inFlight.current = false; setRefusal(r.error); setBusy(false); }'));
    assert.ok(m.includes('const skip = () => send(() => onSkip());'), 'Skip, × and Escape go through the lock and the refusal');
    assert.ok(m.includes('const leave = () => { if (inFlight.current) return; if (refusal) onCancel(); else skip(); };'));
    assert.ok(m.includes("useEscapeLayer(true, leave, escapeBlocked('draggable'));"));
    assert.ok(m.includes('<button type="button" onClick={leave} aria-label="Close"'));
    const banner = between(m, '{refusal && (', '{/* Footer actions');
    assert.ok(banner.includes('role="alert"') && banner.includes('{refusal}') && banner.includes('onClick={onCancel}') && banner.includes('Close without saving'));
    assert.ok(m.includes('onClick={() => send(() => onSave(category, notes.trim()))} disabled={!category || busy}'));
    assert.ok(m.includes('<button type="button" onClick={skip} disabled={busy}'));
    assert.ok(!m.includes('onClick={onSkip}'), 'every exit goes through send or leave');
    const layer = read('src/components/layout/ModalLayer.jsx');
    assert.ok(layer.includes('onCancel={() => setLostReasonModal(null)}'));
});

test('DEAL WINDOW: a refused save is drawn inside the window, over it — and the window closes clean into the reason dialog', () => {
    // It was a fixed overlay at z 9999 under a window at 10000 and up: a refused deal save
    // said nothing on a desktop — the other half of the 9 Oct report (§0.193's review).
    const m = read('src/components/modals/OpportunityModal.jsx');
    const box = m.indexOf('{errorMessage && (');
    const container = m.indexOf('{/* Modal container */}');
    const header = m.indexOf('{/* ── Header bar');
    assert.ok(container > 0 && box > container && header > box, 'a child of the window container, before its header — drawn by the window');
    // Fixed, so it covers and centres on the screen — the window can be wider than a phone, or dragged.
    assert.ok(m.includes("<div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}"));
    assert.ok(!m.includes("position: 'fixed', inset: 0, zIndex: 9999"));
    assert.equal(count(m, '{/* Modal container */}'), 1);
    const h = read('src/hooks/useOpportunities.js');
    assert.ok(h.includes("            setOppModalError(null); setOppModalSaving(false);   // the deal window closes clean, as its onClose does\n            setShowModal(false);"));
    // Escape over the message dismisses it, not the window and its form; the handler sees the error.
    const a = read('src/App.jsx');
    assert.ok(a.includes('if (showModal && oppModalError) { setOppModalError(null); return; }'));
    assert.ok(a.indexOf('if (showModal && oppModalError) { setOppModalError(null); return; }') < a.indexOf('if (showModal) { setShowModal(false); setEditingOpp(null); setOppModalError(null); setOppModalSaving(false); return; }'));
    assert.ok(a.includes('}, [showModal, showUserModal, showActivityModal, viewingActivity, lostReasonModal, oppModalError,'));
});

test('DEAL WINDOW: a new rep\'s name is put in once — not in every deal window opened after', () => {
    const m = read('src/components/modals/OpportunityModal.jsx');
    const fx = between(m, '// Auto-populate rep when a new one is created', '}, [lastCreatedRepName]);');
    assert.ok(fx.includes('if (onLastCreatedRepUsed) onLastCreatedRepUsed();'));
    assert.ok(m.includes('lastCreatedAccountName, onAddRep, lastCreatedRepName, onLastCreatedRepUsed,'));
    assert.ok(read('src/components/layout/ModalLayer.jsx').includes('onLastCreatedRepUsed={() => setLastCreatedRepName(null)}'));
});

test('IMPORT: an overwrite that named owners reads the moved owner ids back', () => {
    const l = read('src/components/layout/ModalLayer.jsx');
    assert.ok(l.includes("if (ow.appliedIds.length && overwritesWithIds.some(r => 'assignedRep' in r)) loadContacts(() => {});"));
    assert.ok(l.includes("if (ow.appliedIds.length && overwritesWithIds.some(r => 'accountOwner' in r)) loadAccounts(() => {});"));
    assert.ok(l.includes("if (ow.appliedIds.length && overwritesBuilt.some(r => 'salesRep' in r)) loadOpportunities(() => {});"));
});

test('BULK AND MERGE: a writer that changes the owner name moves the owner id with it', () => {
    const lib = read('netlify/functions/_lib.mjs');
    const fn = between(lib, 'export async function rekeyBulkOwners(rows, entity, { table, orgId }) {', '\n}\n');
    assert.ok(fn.includes('.where(and(eq(table.orgId, orgId), inArray(table.id, rows.map((r) => r.id))));'), 'this org only');
    assert.ok(fn.includes('if (nameKey in row && !keepsOwner(prior, row, entity)) {'), 'the stored text keeps');
    assert.ok(fn.includes('ambiguous.add(supplied);\n                    ownerId = kept;\n                    held = true;'), 'an ambiguous name keeps the stored owner');
    assert.ok(fn.includes('? { ...row, [nameKey]: prior[nameKey], [idKey]: kept }'), '...and the stored NAME with it — never one without the other');
    assert.ok(fn.includes('if (ownerId === null) unmatched.add(supplied);'));
    assert.ok(fn.includes('out.push(held && prior') && fn.includes(': { ...row, [idKey]: ownerId });'), 'every row carries the column (bulkUpsert sets the union of keys)');
    for (const [f, entity, table, rows] of [['accounts', 'account', 'accounts', 'partialRows(data, sanitize)'], ['contacts', 'contact', 'contacts', 'partialRows(data, sanitize)'], ['opportunities', 'opportunity', 'opportunities', 'partialRows(staged.rows, sanitize)']]) {
        const s = read(`netlify/functions/${f}.mjs`);
        assert.ok(s.includes(`const keyed = await rekeyBulkOwners(${rows}, '${entity}', { table: ${table}, orgId });`), f);
        assert.ok(s.includes('rows: keyed.rows,'), `${f}: the keyed rows are written`);
        assert.ok(s.includes('ambiguousOwners: keyed.ambiguousOwners, unmatchedOwners: keyed.unmatchedOwners'), `${f}: and reported`);
    }
    const merge = read('netlify/functions/merge.mjs');
    const pick = between(merge, 'const mergedOwnerId = (key, resolved, surv, arch) => {', '\n};\n');
    assert.ok(pick.includes("if (!name.trim()) return { ownerId: null };"));
    assert.ok(pick.includes("if (name === String(surv[key] ?? '')) return { ownerId: surv.ownerId ?? null };"));
    assert.ok(pick.includes("if (name === String(arch[key] ?? '')) return { ownerId: arch.ownerId ?? null };"));
    assert.ok(pick.includes("return { error: 'The owner must be one of the two records being merged.' };"), 'neither record\'s: refused');
    assert.ok(merge.includes("const owner = 'accountOwner' in resolved ? mergedOwnerId('accountOwner', resolved, surv, arch) : null;"));
    assert.ok(merge.includes("const owner = 'assignedRep' in resolved ? mergedOwnerId('assignedRep', resolved, surv, arch) : null;"));
    assert.equal(count(merge, "if (owner?.error) return { statusCode: 400, headers, body: JSON.stringify({ error: owner.error }) };"), 2);
    assert.equal(count(merge, 'if (owner) survSet.ownerId = owner.ownerId;'), 2);
    assert.ok(merge.includes("if ('accountOwner' in (log.resolvedFields || {}) && 'ownerId' in snapS) restore.ownerId = snapS.ownerId ?? null;"), 'an account undo');
    assert.ok(merge.includes("if ('assignedRep' in (log.resolvedFields || {}) && 'ownerId' in snapS) restore.ownerId = snapS.ownerId ?? null;"), 'a contact undo');
});

test('DIALOG: the number and letter shortcuts wait while the dialog is open', () => {
    const a = read('src/App.jsx');
    assert.ok(a.includes('const anyModalOpen = showModal || showUserModal || showActivityModal || confirmModal || promptModal || coachingNoteModal || viewingActivity || lostReasonModal;'));
    assert.ok(a.includes('}, [showModal, showUserModal, showActivityModal, viewingActivity, lostReasonModal,'), 'and the handler sees it change');
});

test('the suites: this file is graded by the harness; the endpoints\' integration test runs', () => {
    assert.ok(read('scripts/mutate-import.mjs').includes(' tests/owner-kept.test.mjs'));
    assert.ok(JSON.parse(read('package.json')).scripts['test:int'].includes('tests/integration/owner-kept.itest.mjs'));
});
