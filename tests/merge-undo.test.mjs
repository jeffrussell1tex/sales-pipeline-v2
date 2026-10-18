// tests/merge-undo.test.mjs
//
// A merge's Undo on screen (state §0.207; guide §18b100 — OPEN_ITEMS §1). Jeff, 16 Oct: "Undo as its own batch next";
// 17 Oct: "Undo, cleanup, profile", and his nine answers: Q1 "Past merges on each page"; Q2 "No limit, safety checks
// decide"; Q3 "Keep later edits" — a deal's account id and account name always move together; Q4 "Undo refuses and
// explains" — deleting stays as it is; Q5 the toast five seconds, as the delete toasts (stated, no objection); Q6 "Drop
// the screen's row"; Q7 "Fix all four now"; Q8 "Approve as written"; Q9 "Yes, real merge and Undo" (the browser's).
//
// Before: every merge screen said a merge was reversible, and no screen sent the server's reverse. The reverse wrote
// over everything since — it moved links back to a record deleted since, pulled a later merge's rows back from its
// survivor, put the survivor's fields back over later edits — and two sent together both wrote. The merge hook set its
// list, wrote its own audit row and read the lists again after an org switch (`x?.()` hid the four from the
// late-answers scan), read no contacts, tasks or activities again after a merge, and said "Merge failed" over a merge
// whose answer was lost.
//
// Now: src/utils/mergeUndo.js decides, pure — merge.mjs reads it on the server, the hook and Past merges on the
// screen: undoRefusal, survivorRestore, undoPlaces (the house parent rule), keptLinksOf / undoKept, and the words.
// merge.mjs's Undo is one batch whose claim and un-archive each abort it unless they wrote their row, every link and
// the survivor's fields conditioned on still holding what the merge wrote; GET /merge lists Past merges. The hook
// offers the toast through App's offerUndo, sends { reverse, mergeLogId } alone, and reads the five lists again; each
// list load, Past merges' list and each scan drops an answer a later one overtook.
//
// The review (17 Oct, b13/wf-reviews.json) added: the parent rule on what an Undo puts back under the record merged away
// (T17); a deal on the survivor by id under its name no change kept (T18); the merge windows' default survivor set only
// when they open (T19); Past merges' list and the scans dropping an overtaken answer (T20); Past merges' Undo run as
// written (T15); an answer whose body could not be read (T7, T8, T10); and its names for what each mutant breaks.
//
// The re-check (17 Oct, b13/recheck): a contact's company put back by name only while the contact is not linked to the
// survivor by id, and one on the survivor at the merge read last (T9, T18); a deal the merge moved up never put back by
// its id (T9); a row whose own tier changed since the merge put back under the record merged away only where it ranks
// above it — the merge logs each sub-account's tier (T9, T17); a deal or contact by name alone linked to the survivor
// since counted kept — the merge logs which stood on the survivor by id (T6, T9, T18); Past merges' rows and both scans'
// overtaken errors pinned (T15, T20); and the words its messages quote as the screen shows them.
//
// Jeff's second set (18 Oct, b13/jeff-answers.md): an Undo never puts a deal on a site — "Leave such deals and count
// them": a survivor that would go back a site while a deal stands on it by id keeps its place, each such deal counted
// (T21, T6, T9), and no deal goes back to the record merged away by its id or its lift while that is a site (T9, T21);
// the done words — "New words": "N records were left as they are now." (T10, T8); the keep rules ("Yes, both") and the
// limits of merges logged before this batch ("Accept the limits"), as built, cited in the code's comments.
//
// The last fix round (18 Oct, b13/recheck5): the done words count the survivor once, whatever of it was kept — a field
// is no record (T10); the audit row in their sense, never "changed since" of what nobody changed (T6); a deal by name
// alone goes back to the record merged away only while that is no site, as by its id and its lift (T9; I22).
//
// Jeff's third set (18 Oct, b13/jeff-answers.md): Past merges' confirm in his corrected text — "Use the corrected
// text": what the merge moved goes back except what cannot go back where it was, which stays and is counted (T10).
//
// Run here: mergeUndo.js on made-up rows (T1-T6, T10, T17, T18, T21), held to the merge's own code where it models it
// (T4, T5); the REAL hook through React's own renderer, fetch stubbed, an org switch while a request is out among the
// answers (T7, T8); the five loads, each loader's lines run as written (T16), and Past merges' and the scans' (T20);
// Past merges' rules and its Undo parsed and run (T15); the merge windows' default run as written (T19). Pinned, line
// for line: merge.mjs's Undo, each pin in its own function's slice (T9 — the server runs on the test database in
// tests/integration/merge-undo.itest.mjs, I1-I22), the toast and App's wiring (T11), the scan pages (T12), the copy
// (T13). The new modules are imported inside the tests that run them, so on the code before this batch (no
// mergeUndo.js; the hook imported storage without its extension, which node cannot resolve) each test fails on its
// own rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { isMergeArchived } from '../src/utils/pickLink.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
// The code a pin reads: whole-line comments dropped, so a comment quoting a line never stands in for it.
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const count = (s, sub) => s.split(sub).length - 1;
// From `from` to the first `to` after it, both included — each there.
const between = (s, from, to) => {
    const a = s.indexOf(from);
    assert.ok(a >= 0, `missing: ${from}`);
    const b = s.indexOf(to, a + from.length);
    assert.ok(b > a, `missing after it: ${to}`);
    return s.slice(a, b + to.length);
};
// Each a WHOLE line of s, each after the one before it: a line changed, gone or moved fails it.
const order = (s, ...lines) => {
    const t = `\n${s}\n`;
    let at = 0;
    for (const line of lines) {
        const i = t.indexOf(`\n${line}\n`, at);
        assert.ok(i >= 0, `missing, changed or out of order: ${line.trim()}`);
        at = i + 1 + line.length;
    }
};
// A whole line of s, exactly once.
const once = (s, line, why) => assert.equal(s.split('\n').filter((l) => l === line).length, 1, why || `once, as a whole line: ${line.trim()}`);
const ind = (n, line) => ' '.repeat(n) + line;
// Whole lines run as written: `names` are the free names they read, handed `values`; `result` is what comes back.
const run = (lines, names, values, result) => new Function(...names, `${lines.join('\n')}\nreturn ${result};`)(...values);
const tick = () => new Promise((r) => setImmediate(r));   // after every promise already settled (setTimeout waits ~16 ms on Windows)

const MU = 'src/utils/mergeUndo.js', MJ = 'netlify/functions/merge.mjs', UM = 'src/hooks/useMerge.js', APP = 'src/App.jsx';
const ML = 'src/components/layout/ModalLayer.jsx', DS = 'src/Tabs/DuplicateScanView.jsx', CS = 'src/Tabs/ContactDuplicateScanView.jsx';
const PM = 'src/Tabs/PastMerges.jsx';
const mergeUndo = () => import('../src/utils/mergeUndo.js');

// ── made-up rows: "Resinall, Inc." merged into "Resinall" (UKG's pair, 16 Oct) ────────────────────────────────────
const LOG = { id: 'mrg_1', entityType: 'account', status: 'merged', survivorId: 'acc_y', archivedId: 'acc_x', survivorName: 'Resinall', archivedName: 'Resinall, Inc.' };
const X = { id: 'acc_x', name: 'Resinall, Inc.', mergeArchived: true, mergedIntoId: 'acc_y' };
const Y = { id: 'acc_y', name: 'Resinall', mergeArchived: false };
const ALOG = {
    ...LOG,
    resolvedFields: { phone: '555-0101', accountOwner: 'Ravi Shah', website: 'resinall.com' },
    survivorSnapshot: { id: 'acc_y', name: 'Resinall', phone: null, accountOwner: 'Karen Lee', ownerId: 'usr_karen', website: 'resinall.com', parentAccountId: null, accountTier: 'account' },
    archivedSnapshot: { id: 'acc_x', name: 'Resinall, Inc.', phone: '555-0101', accountOwner: 'Ravi Shah', ownerId: 'usr_ravi', parentAccountId: null },
};
// the survivor as the merge left it
const AS_MERGED = { id: 'acc_y', name: 'Resinall', phone: '555-0101', accountOwner: 'Ravi Shah', ownerId: 'usr_ravi', website: 'resinall.com', parentAccountId: null, accountTier: 'account' };

test('T1 — undoRefusal: an Undo is refused, in the server\'s words, when the merge was undone already, either record was deleted since, the survivor was merged into another record since, or the record merged away is no longer merged into the survivor; null when it can be undone (Q4: "Undo refuses and explains")', async () => {
    const U = await mergeUndo();
    assert.equal(U.ALREADY_UNDONE, 'This merge has already been undone.');
    assert.equal(U.UNDO_CHANGED, 'One of these records changed while the merge was being undone. Please try again.', 'a race that leaves nothing to name (amend 12.1)');
    assert.equal(U.undoRefusal({ log: LOG, archived: X, survivor: Y }), null, 'both standing, the record merged away still merged into the survivor');
    assert.equal(U.undoRefusal({ log: LOG, archived: X, survivor: { ...Y, mergeArchived: null } }), null, 'a survivor never merged (merge_archived null)');
    assert.equal(U.undoRefusal({ log: { ...LOG, status: 'reversed' }, archived: X, survivor: Y }), 'This merge has already been undone.',
        'REGRESSION: a second Undo of a merge already undone says "no longer merged into" (or, the merge made again since, "changed… try again") — never "already been undone"');
    assert.equal(U.undoRefusal({ log: LOG, survivor: Y }), '“Resinall, Inc.” was deleted after this merge, so the merge can no longer be undone.',
        'REGRESSION: the record merged away deleted since — undoRefusal throws: the Undo, and Past merges for the whole org, answer 500');
    assert.equal(U.undoRefusal({ log: LOG, archived: X }), '“Resinall” was deleted after this merge, so the merge can no longer be undone.',
        'REGRESSION: the survivor deleted since — undoRefusal throws: the Undo, and Past merges for the whole org, answer 500');
    assert.equal(U.undoRefusal({ log: LOG, archived: X, survivor: { ...Y, mergeArchived: true, mergedIntoId: 'acc_z' }, survivorInto: { id: 'acc_z', name: 'Resinall Holdings' } }),
        '“Resinall” was merged into “Resinall Holdings” after this merge — undo that merge first.', 'REGRESSION: the survivor merged since — Past merges offers an Undo that always answers "changed… try again"');
    assert.equal(U.undoRefusal({ log: LOG, archived: X, survivor: { ...Y, mergeArchived: true, mergedIntoId: 'acc_z' } }),
        '“Resinall” was merged into another record after this merge — undo that merge first.', '... into a record gone since');
    assert.equal(U.undoRefusal({ log: { ...LOG, entityType: 'contact', survivorName: 'Lee Ng', archivedName: 'Lee Ng' }, archived: X, survivor: { ...Y, mergeArchived: true }, survivorInto: { id: 'con_z', firstName: 'Lee', lastName: 'Ngo' } }),
        '“Lee Ng” was merged into “Lee Ngo” after this merge — undo that merge first.', 'a contact named as merge.mjs names one');
    assert.equal(U.contactNameOf({ id: 'con_9', email: 'lee@example.com' }), 'lee@example.com', 'no name: the email, as merge.mjs nameOf');
    assert.equal(U.undoRefusal({ log: LOG, archived: { ...X, mergeArchived: false, mergedIntoId: null }, survivor: Y }),
        '“Resinall, Inc.” is no longer merged into “Resinall”, so this merge can no longer be undone.', 'live again (a delete\'s Undo of it)');
    assert.equal(U.undoRefusal({ log: LOG, archived: { ...X, mergedIntoId: 'acc_w' }, survivor: Y }),
        '“Resinall, Inc.” is no longer merged into “Resinall”, so this merge can no longer be undone.',
        'REGRESSION: the record merged away merged into another since — Past merges offers an Undo that always answers "changed… try again"');
});

test('T2 — survivorRestore, an account: each field the merge changed goes back only while it still holds what the merge wrote — one edited since is kept and named, one the merge left as it was is never written, the owner id goes and stays with its name, and a lift\'s parent and tier come back (Q3: "Keep later edits")', async () => {
    const U = await mergeUndo();
    assert.deepEqual(U.survivorRestore('account', ALOG, AS_MERGED), { set: { phone: null, accountOwner: 'Karen Lee', ownerId: 'usr_karen' }, keptFields: [] },
        'nothing edited since: the phone and the owner the merge filled, the owner id with its name; the website the merge left as it was, not written');
    assert.deepEqual(U.survivorRestore('account', ALOG, { ...AS_MERGED, phone: '555-9999' }), { set: { accountOwner: 'Karen Lee', ownerId: 'usr_karen' }, keptFields: ['phone'] },
        'REGRESSION: a survivor field edited since the merge is put back over the edit');
    assert.deepEqual(U.survivorRestore('account', ALOG, { ...AS_MERGED, accountOwner: 'Bo Diaz' }), { set: { phone: null }, keptFields: ['accountOwner'] },
        'the owner edited since: kept, and its id with it');
    assert.deepEqual(U.survivorRestore('account', ALOG, { ...AS_MERGED, website: 'example.com' }), { set: { phone: null, accountOwner: 'Karen Lee', ownerId: 'usr_karen' }, keptFields: [] },
        'REGRESSION: a field the merge left as it was is written back (and counted as kept when edited since)');
    const { ownerId: _gone, ...OLD_SNAP } = ALOG.survivorSnapshot;
    assert.deepEqual(U.survivorRestore('account', { ...ALOG, survivorSnapshot: OLD_SNAP }, AS_MERGED), { set: { phone: null, accountOwner: 'Karen Lee' }, keptFields: [] },
        'REGRESSION: an old log, its snapshot from before the owner id column, blanks the owner id — the row\'s own is kept');
    assert.deepEqual(U.survivorRestore('account', { ...ALOG, resolvedFields: { name: 'Resinall, Inc.' }, survivorName: 'Resinall, Inc.' }, { ...AS_MERGED, name: 'Resinall, Inc.' }),
        { set: { name: 'Resinall' }, keptFields: [] }, 'a rename put back');
    // H6: a top-level account merged into its own site — the merge lifted the site to the top and made it an account
    const H6 = { ...LOG, survivorId: 'acc_dock', archivedId: 'acc_plant', survivorName: 'H6 Dock', resolvedFields: {},
        survivorSnapshot: { id: 'acc_dock', name: 'H6 Dock', parentAccountId: 'acc_plant', accountTier: 'site' }, archivedSnapshot: { id: 'acc_plant', parentAccountId: null } };
    assert.deepEqual(U.survivorRestore('account', H6, { id: 'acc_dock', name: 'H6 Dock', parentAccountId: null, accountTier: 'account' }),
        { set: { parentAccountId: 'acc_plant', accountTier: 'site' }, keptFields: [] }, 'REGRESSION (H6): the undo leaves a lifted survivor an account');
    assert.deepEqual(U.survivorRestore('account', { ...H6, archivedSnapshot: { id: 'acc_plant', parentAccountId: 'acc_shell' } }, { id: 'acc_dock', name: 'H6 Dock', parentAccountId: 'acc_shell', accountTier: 'site' }),
        { set: { parentAccountId: 'acc_plant' }, keptFields: [] }, 'lifted under another account: the parent alone');
});

// A contact merge: Lee Ng merged into Lee Ng, the phone and the rep taken from the record merged away. Its snapshots
// whole rows, as merge.mjs stores them (the review, 17 Oct): an org chart list is always there.
const CLOG = { id: 'mrg_3', entityType: 'contact', status: 'merged', survivorId: 'con_1', archivedId: 'con_2', survivorName: 'Lee Ng', archivedName: 'Lee Ng',
    resolvedFields: { phone: '555-0102', assignedRep: 'Ravi Shah' },
    survivorSnapshot: { id: 'con_1', firstName: 'Lee', lastName: 'Ng', phone: null, assignedRep: 'Karen Lee', ownerId: 'usr_karen', managers: [], directReports: [] },
    archivedSnapshot: { id: 'con_2', firstName: 'Lee', lastName: 'Ng', phone: '555-0102', assignedRep: 'Ravi Shah', ownerId: 'usr_ravi', managers: [{ id: 'con_m', name: 'Mo Diaz' }, { id: 'con_1', name: 'Lee Ng' }], directReports: [] } };
const C_MERGED = { id: 'con_1', firstName: 'Lee', lastName: 'Ng', phone: '555-0102', assignedRep: 'Ravi Shah', ownerId: 'usr_ravi', managers: [{ id: 'con_m', name: 'Mo Diaz' }], directReports: [] };

test('T3 — survivorRestore, a contact: the phone, the rep with its owner id, the names only when resolved, and the org chart compared with the merge\'s own union — a list stored null before the merge put back as [], the column\'s default', async () => {
    const U = await mergeUndo();
    assert.deepEqual(U.survivorRestore('contact', CLOG, C_MERGED), { set: { phone: null, assignedRep: 'Karen Lee', managers: [], ownerId: 'usr_karen' }, keptFields: [] },
        'REGRESSION: a contact merge undo leaves the merged owner id (a contact\'s owner is its rep)');
    // A list stored null before the merge — a contact saved before contacts.mjs wrote `|| []` — under the union the merge
    // wrote: back as [], the column's default (a normalisation; the review, 17 Oct).
    const legacy = { ...CLOG, survivorSnapshot: { ...CLOG.survivorSnapshot, managers: null } };
    assert.deepEqual(U.survivorRestore('contact', legacy, C_MERGED).set.managers, [],
        'REGRESSION: an org chart stored null before the merge is put back null, not [] (the column\'s default)');
    assert.deepEqual(U.survivorRestore('contact', CLOG, { ...C_MERGED, managers: [] }).keptFields, ['managers'], 'a manager list edited since: kept');
    assert.deepEqual(U.survivorRestore('contact', CLOG, { ...C_MERGED, assignedRep: 'Bo Diaz' }), { set: { phone: null, managers: [] }, keptFields: ['assignedRep'] },
        'the rep edited since: kept, its owner id with it');
    const named = { ...CLOG, resolvedFields: { firstName: 'Leigh' }, survivorName: 'Leigh Ng' };
    assert.deepEqual(U.survivorRestore('contact', named, { ...C_MERGED, firstName: 'Leigh', phone: null, assignedRep: 'Karen Lee' }), { set: { firstName: 'Lee', managers: [] }, keptFields: [] },
        'a first name resolved: put back; the last name, never resolved, never written');
    const reports = { ...CLOG, resolvedFields: {}, archivedSnapshot: { ...CLOG.archivedSnapshot, managers: [], directReports: [{ id: 'con_r', name: 'Ria Kay' }] } };
    assert.deepEqual(U.survivorRestore('contact', reports, { ...C_MERGED, phone: null, assignedRep: 'Karen Lee', managers: [], directReports: [{ id: 'con_r', name: 'Ria Kay' }] }),
        { set: { directReports: [] }, keptFields: [] }, 'the direct reports the union added, back to none — [] (the column\'s default), never null');
});

// The contact merge's own union, as it stood in merge.mjs before this batch (dev 2c204dd + §0.206, :435-445) —
// mergeUndo.js orgChartUnion is its copy, called by the merge for both lists and read by the Undo.
const UNION_AS_IT_STOOD = [
    '    const unionObjArr = (a, b) => {',
    '        const out = []; const seen = new Set();',
    '        for (const item of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {',
    '            if (!item || !item.id) continue;',
    '            const id = item.id === archivedId ? survivorId : item.id;',
    "            if (id === survivorId) continue;   // survivor can't reference itself",
    '            if (seen.has(id)) continue;',
    '            seen.add(id); out.push(item);',
    '        }',
    '        return out;',
    '    };',
];

test('T4 — orgChartUnion is the contact merge\'s own union, run on the same lists as the union as it stood; the merge writes both lists through it, so an Undo compares with exactly what the merge wrote', async () => {
    const U = await mergeUndo();
    const asItStood = run(UNION_AS_IT_STOOD, ['archivedId', 'survivorId'], ['con_2', 'con_1'], 'unionObjArr');
    for (const [a, b] of [
        [[{ id: 'con_m', name: 'Mo' }], [{ id: 'con_2', name: 'Lee' }, { id: 'con_m', name: 'Mo' }, { id: 'con_k', name: 'Kai' }]],
        [undefined, [{ id: 'con_1', name: 'Lee' }, null, { name: 'no id' }, { id: 'con_k' }]],
        [[{ id: 'con_k' }, { id: 'con_k' }], 'not a list'],
        [[{ id: 'con_1' }, { id: 'con_2' }], [{ id: 'con_r' }]],
        [[], []],
    ]) assert.deepEqual(U.orgChartUnion(a, b, 'con_2', 'con_1'), asItStood(a, b), 'REGRESSION: the union keeps the survivor in its own org chart, or reads the merged-away id as itself');
    const g = code(read(MJ));
    once(g, ind(8, 'managers: orgChartUnion(surv.managers, arch.managers, archivedId, survivorId),'),
        'REGRESSION: the merge\'s managers are not the Undo\'s union — every Undo keeps them as "edited since"');
    once(g, ind(8, 'directReports: orgChartUnion(surv.directReports, arch.directReports, archivedId, survivorId),'));
    assert.ok(!g.includes('unionObjArr'), 'one union, shared — never a second copy to drift');
});

test('T5 — upIdOf is the merge\'s own upId line — the account the deals moved up to (D22) — read from merge.mjs and run on the same snapshots', async () => {
    const U = await mergeUndo();
    const UP_ID = ind(8, 'const upId = surv.parentAccountId === archivedId ? (arch.parentAccountId || null) : (surv.parentAccountId || null);');
    once(code(read(MJ)), UP_ID, "the merge's line, as it stands");
    for (const [surv, arch] of [
        [{ parentAccountId: 'acc_x' }, { parentAccountId: 'acc_shell' }], [{ parentAccountId: 'acc_x' }, { parentAccountId: null }],
        [{ parentAccountId: 'acc_shell' }, { parentAccountId: 'acc_other' }], [{ parentAccountId: null }, {}], [{}, {}],
    ]) {
        assert.equal(U.upIdOf({ archivedId: 'acc_x', survivorSnapshot: surv, archivedSnapshot: arch }), run([UP_ID], ['surv', 'arch', 'archivedId'], [surv, arch, 'acc_x'], 'upId'),
            `REGRESSION: the deals moved up looked for on the survivor's own parent where it stood under the account merged away — ${JSON.stringify([surv, arch])}`);
    }
});

test('T6 — keptLinksOf and undoKept: what an Undo kept is each record a restore named that no statement put back, counted once — a deal its lift put back is not kept, one the survivor\'s name cascade reached that the merge never left on the survivor is; a survivor restore an edit stopped keeps every field it meant to put back, and its name cascade puts nothing back; the audit row says what it left as it is now, in the done words\' sense', async () => {
    const U = await mergeUndo();
    // [claim, un-archive, survivor assert, ...]: a deal moved by id and up by the lift (d1), a task named twice and never
    // put back (t1), a task put back (t2), a deal put back by the id restore (d2)
    const restores = [
        { table: 'opportunities', ids: ['d1', 'd2'], at: 3 },
        { table: 'tasks', ids: ['t1', 't2'], at: 4 },
        { table: 'tasks', ids: ['t1'], at: 5 },
        { table: 'opportunities', ids: ['d1'], at: 6 },
    ];
    const results = [[{ ok: 1 }], [{ ok: 1 }], [{ ok: 1 }], [{ id: 'd2' }], [{ id: 't2' }], [], [{ id: 'd1' }], [{ id: 'acc_y' }], [{ id: 'd9' }], [{ id: 'c9' }]];
    assert.equal(U.keptLinksOf(restores, results), 1, 'REGRESSION: a deal its lift put back is counted as kept — t1 alone, once');
    assert.equal(U.keptLinksOf([{ table: 'tasks', ids: ['t1'], at: 0 }, { table: 'opportunities', ids: ['t1'], at: 1 }], [[], [{ id: 't1' }]]), 1, 'a task and a deal of one id are two records');
    // a deal by name alone (n1) linked to the survivor since: the name restore leaves it, the survivor's name cascade
    // takes it with the survivor's own deal (y1) — not put back by that cascade (since; the re-check, 17 Oct)
    assert.equal(U.keptLinksOf([{ table: 'opportunities', ids: ['n1'], at: 0 }, { table: 'opportunities', ids: [], at: 1, since: ['n1'] }], [[], [{ id: 'n1' }, { id: 'y1' }]]), 1,
        'REGRESSION: a deal or contact by name alone linked to the survivor since, its name cascaded, counted as put back — "no change kept" said over a change kept');
    // held (Jeff, 18 Oct: "the deal stays where it is, and it is counted"): the survivor's own deal (h1) keeps it from
    // going back a site — its name cascade and the twins' read (at 1, 2) both answer it, still counted; once, beside
    // the same id named by another restore; a held entry names no statement (at -1)
    const heldRestores = [{ table: 'opportunities', ids: ['h1', 'h2'], at: -1, held: true }, { table: 'opportunities', ids: ['h2'], at: 0 }, { table: 'opportunities', ids: ['h1'], at: 2 }];
    const heldCascade = [{ table: 'opportunities', ids: [], at: 1 }];
    assert.equal(U.keptLinksOf([...heldRestores, ...heldCascade], [[], [{ id: 'h1' }, { id: 'h2' }, { id: 'y1' }], [{ id: 'h1' }]]), 2,
        'REGRESSION: a deal that keeps the survivor from going back a site, read again by its name cascade or the twins\' read, counted as put back — "Leave such deals and count them" not counted');
    assert.equal(U.keptLinksOf([{ table: 'opportunities', ids: ['h1'], at: -1 }], [[{ id: 'h1' }]]), 1, 'at -1: named, no statement read');
    const built = { restores: [{ table: 'opportunities', ids: ['d9'], at: 3 }, { table: 'contacts', ids: ['c9'], at: 4 }], cascades: [{ table: 'opportunities', ids: [], at: 8 }, { table: 'contacts', ids: [], at: 9 }],
        survivorAt: 7, set: { name: 'Resinall', phone: null }, keptFields: ['website'] };
    const landed = [[{ ok: 1 }], [{ ok: 1 }], [{ ok: 1 }], [], [], [], [], [{ id: 'acc_y' }], [{ id: 'd9' }], [{ id: 'c9' }]];
    assert.deepEqual(U.undoKept(built, landed), { keptLinks: 0, keptFields: ['website'] }, "the survivor's restore landed: its name cascade put its deal and contact back");
    const stopped = landed.map((r, i) => (i === 7 ? [] : r));
    assert.deepEqual(U.undoKept(built, stopped), { keptLinks: 2, keptFields: ['website', 'name', 'phone'] },
        "REGRESSION: an edit stopped the survivor's restore — the answer says its fields came back, and counts what its cascade reached as put back");
    assert.deepEqual(U.undoKept({ ...built, survivorAt: -1, cascades: [], set: {} }, landed), { keptLinks: 2, keptFields: ['website'] }, 'nothing to put back on the survivor: landed');
    // the audit row in the done words' sense (the re-check, 18 Oct): what the Undo left as it is now — never "changed
    // since" of a deal held off a site or a place the parent rule kept, which nobody changed
    assert.equal(U.undoDetail({ archivedName: 'Resinall, Inc.' }, 'mrg_1', 1, ['phone']), 'Resinall, Inc. restored · undo of mrg_1 · 1 linked record was left as it is now · kept: phone',
        'REGRESSION (the re-check, 18 Oct): the audit row says what the Undo left "changed since, kept" — a deal held off a site, a place the parent rule kept: nobody changed them');
    assert.equal(U.undoDetail({ archivedName: 'Resinall, Inc.' }, 'mrg_1', 2, ['parentAccountId', 'accountTier']), 'Resinall, Inc. restored · undo of mrg_1 · 2 linked records were left as they are now · kept: parentAccountId, accountTier',
        'REGRESSION: two linked records said as one — "2 linked record was left as it is now"');
    assert.equal(U.undoDetail({ archivedName: 'Resinall, Inc.' }, 'mrg_1', 0, []), 'Resinall, Inc. restored · undo of mrg_1', 'nothing kept: the line as before');
});

// ── the REAL hook (T7, T8): dbWrite reads the token from window and calls fetch ───────────────────────────────────
const respond = (status, body) => ({
    ok: status >= 200 && status < 300, status, statusText: '',
    json: async () => { if (body === undefined) throw new Error('not json'); return body; },
});
const log = [];
let answer = () => respond(200, {});
let release = null;
const held = (status, body) => () => new Promise((res) => { release = () => res(respond(status, body)); });
globalThis.window = { __getClerkToken: async () => 'tok' };
globalThis.fetch = async (url, opts = {}) => { log.push(`${opts.method || 'GET'} ${url}${opts.body ? ' ' + opts.body : ''}`); return answer(url, opts); };
const offers = [];
let hooked = null;
// useMerge rendered once, as App renders it; its handlers called after, as a screen calls them.
const theHook = async () => {
    if (hooked) return hooked;
    const storage = await import('../src/utils/storage.js');
    const { useMerge } = await import('../src/hooks/useMerge.js');
    const deps = {
        setAccounts: () => log.push('set accounts'), setContacts: () => log.push('set contacts'),
        loadAccounts: () => log.push('load accounts'), loadContacts: () => log.push('load contacts'), loadOpportunities: () => log.push('load opportunities'),
        loadTasks: () => log.push('load tasks'), loadActivities: () => log.push('load activities'),
        offerUndo: (t) => { offers.push(t); log.push(`offer ${JSON.stringify({ ...t, restore: t.restore ? 'fn' : undefined })}`); },
        setUndoToast: (t) => log.push(`toast ${JSON.stringify(t)}`),
        currentUser: { name: 'Jeff Russell' },
    };
    let api;
    const Probe = () => { api = useMerge(deps); return null; };
    renderToString(createElement(Probe));
    storage.setRequestOrg('org_qa');
    hooked = { api, storage };
    return hooked;
};
const reset = () => { log.length = 0; offers.length = 0; release = null; };
// A held answer's request went out (its token read first): then it can be released.
const sentHeld = async () => { for (let i = 0; i < 200 && !release; i++) await tick(); assert.ok(release, 'the request went out'); };
// dbFetch logs each refusal to the console; the tests read the answers instead.
const quietly = async (f) => { const was = console.error; console.error = () => {}; try { return await f(); } finally { console.error = was; } };
const MERGE = 'POST /.netlify/functions/merge';
const UNDO = `${MERGE} {"reverse":true,"mergeLogId":"mrg_x"}`;
const FIVE = ['load accounts', 'load contacts', 'load opportunities', 'load tasks', 'load activities'];
const FOUR = FIVE.slice(1);
const PAYLOAD = { survivorId: 'acc_y', archivedId: 'acc_x', survivorName: 'Resinall', archivedName: 'Resinall, Inc.', resolvedFields: {} };
const C_PAYLOAD = { survivorId: 'con_1', archivedId: 'con_2', survivorName: 'Lee Ng', archivedName: 'Lee Ng (2)' };
const MERGED = { account: { id: 'acc_y', name: 'Resinall' }, archivedId: 'acc_x', mergeLogId: 'mrg_x', rewriteSummary: {} };
const shown = (l) => l.replace(/^offer .*/, 'offer');

test('T7 — the merge hook, run (react-dom/server, fetch stubbed): a merge that landed drops the row, reads accounts, contacts, deals, tasks and activities again (a contact merge: no accounts) and offers its Undo once; a refusal sets the window\'s words alone; a 500 or no answer may have landed — the lists read again, no toast; an answer after an org switch sets, reads and offers nothing; a merge whose answer names no log id offers a notice, no Undo; no audit row of its own (Q6); Past merges\' list, its answer unread, is no list — never "No merges yet."', async () => {
    const { api, storage } = await theHook();
    await quietly(async () => {
        reset(); answer = () => respond(200, MERGED);
        const d = await api.handleMerge(PAYLOAD);
        assert.equal(d?.mergeLogId, 'mrg_x', 'the window closes on the answer');
        assert.equal(log.filter((l) => l.startsWith('POST ')).length, 1, 'one request');
        const sent = JSON.parse(log[0].slice(MERGE.length + 1));
        assert.deepEqual([sent.entityType, sent.performedBy, 'reverse' in sent, sent.archivedId], ['account', 'Jeff Russell', false, 'acc_x']);
        assert.deepEqual(log.slice(1).map(shown), ['set accounts', ...FIVE, 'offer'],
            'REGRESSION: a merge reads its tasks and activities no more (a whole-row save sends the old link back), or offers no Undo');
        assert.deepEqual({ merged: offers[0].merged, into: offers[0].into, restore: typeof offers[0].restore }, { merged: 'Resinall, Inc.', into: 'Resinall', restore: 'function' },
            'the toast: "Merged “Resinall, Inc.” into “Resinall” · ↩ Undo"');

        reset(); answer = () => respond(409, { error: 'That record has already been merged.' });
        assert.equal(await api.handleMerge(PAYLOAD), null, 'refused: the window stays open');
        assert.deepEqual(log.slice(1), [], 'nothing set, read or offered');
        for (const [why, a] of [['a 500', () => respond(500, { error: 'Internal server error', requestId: 'req-2' })], ['no answer', () => Promise.reject(new TypeError('Failed to fetch'))]]) {
            reset(); answer = a;
            assert.equal(await api.handleMerge(PAYLOAD), null, why);
            assert.deepEqual(log.slice(1), FIVE, `REGRESSION: ${why} — the merge may have been made, and Past merges, where its words send the user, keeps its old list (nothing read again)`);
            reset(); answer = a;
            assert.equal(await api.handleContactMerge(C_PAYLOAD), null, `a contact merge, ${why}`);
            assert.deepEqual(log.slice(1), FOUR, `REGRESSION: a contact merge, ${why} — no list read again`);
        }

        // an org switch while the merge is out (F1): its answer belongs to the org that merged
        for (const [kind, call] of [['an account', () => api.handleMerge(PAYLOAD)], ['a contact', () => api.handleContactMerge(C_PAYLOAD)]]) {
            reset(); answer = held(200, { ...MERGED, contact: { id: 'con_1' }, archivedId: 'con_2', mergeLogId: 'mrg_y' });
            const m = call();
            await sentHeld();
            storage.setRequestOrg('org_b'); release();
            assert.equal(await m, null, `${kind} merge answered after an org switch`);
            assert.deepEqual(log.slice(1), [], `REGRESSION: ${kind} merge's answer after an org switch sets the new org's list, reads its lists and offers its Undo there`);
            storage.setRequestOrg('org_qa');
        }

        reset(); answer = () => respond(200, { account: { id: 'acc_y', name: 'Resinall' }, archivedId: 'acc_x' });
        await api.handleMerge(PAYLOAD);
        assert.deepEqual(offers, [{ notice: 'Merged “Resinall, Inc.” into “Resinall” — its Undo is under Past merges on this page.' }],
            'REGRESSION: a merge whose answer names no log id offers an Undo that sends none (400, or the wrong kind\'s reverse)');

        reset(); answer = () => respond(200, { contact: { id: 'con_1' }, archivedId: 'con_2', mergeLogId: 'mrg_c' });
        await api.handleContactMerge(C_PAYLOAD);
        assert.equal(JSON.parse(log[0].slice(MERGE.length + 1)).entityType, 'contact');
        assert.deepEqual(log.slice(1).map(shown), ['set contacts', ...FOUR, 'offer'], 'a contact merge: no accounts read');
        assert.deepEqual([offers[0].merged, offers[0].into, typeof offers[0].restore], ['Lee Ng (2)', 'Lee Ng', 'function'], 'its toast');

        // Past merges' list: this org's, and a refusal or a lost answer in words (amend 63)
        reset(); answer = () => respond(200, { merges: [], more: false });
        assert.deepEqual(await api.findMerges('contact'), { merges: [], more: false });
        assert.deepEqual(log, ['GET /.netlify/functions/merge?entityType=contact']);
        const thrown = async () => { try { await api.findMerges('account'); return null; } catch (e) { return e.message; } };
        answer = () => respond(403, { error: 'Only admins and managers can merge records.' });
        assert.equal(await thrown(), 'Only admins and managers can merge records.');
        answer = () => respond(500, { error: 'Internal server error', requestId: 'req-3' });
        assert.equal(await thrown(), 'Internal server error (ref req-3)');
        answer = () => Promise.reject(new TypeError('Failed to fetch'));
        assert.equal(await thrown(), 'No answer from the server.', 'never the browser\'s "Failed to fetch"');
        answer = () => respond(200, undefined);   // a 200 whose body could not be read (the review, 17 Oct)
        assert.equal(await thrown(), 'No answer from the server.', 'REGRESSION: a list whose answer could not be read — Past merges says "No merges yet." over a list it never read');
    });
    // the window's words: mergeError is the hook's own state, unread after a server render — each handler sets it from
    // mergeWords (run in T10) on a refusal, once
    const h = code(read(UM));
    for (const [from, to] of [['const handleMerge = async (payload) => {', 'const findContactDuplicates'], ['const handleContactMerge = async (payload) => {', 'const findMerges']]) {
        const s = between(h, from, to);
        order(s, ind(12, 'if (!r.ok) {'), ind(16, 'setMergeError(mergeWords(r));'));
        assert.equal(count(s, 'setMergeError(mergeWords(r));'), 1);
    }
    once(h, "import { dbFetch, dbWrite, requestOrg, stillOrg } from '../utils/storage.js';", "storage.js with its extension: node's resolver, which this suite imports the hook through, needs it");
    assert.ok(!h.includes('addAudit'), 'REGRESSION: the screen\'s own merge audit row — two rows per merge (Q6: "Drop the screen\'s row")');
    assert.ok(!log.some((l) => l.includes('audit')), 'no audit request');
});

test('T8 — the toast\'s Undo, run: it clears the toast before its one request, which sends { reverse, mergeLogId } alone; done — a notice in words with what it kept, and the lists read again; refused — its words, nothing read; a 500 or no answer — it may have landed: the lists read again, and words that say to look; an answer after an org switch says and reads nothing; a done answer that could not be read names the record as the toast does', async () => {
    const { api, storage } = await theHook();
    await quietly(async () => {
        reset(); answer = () => respond(200, MERGED);
        await api.handleMerge(PAYLOAD);
        const restore = offers[0].restore;

        reset(); answer = () => respond(200, { success: true, reversed: 'mrg_x', restoredId: 'acc_x', restoredName: 'Resinall, Inc.', keptLinks: 1, keptFields: ['accountOwner', 'ownerId'] });
        await restore();
        assert.deepEqual(log, ['toast null', UNDO, ...FIVE, 'offer {"notice":"Merge undone — “Resinall, Inc.” is its own record again. 2 records were left as they are now."}'],
            'REGRESSION: the toast stays up while its Undo is out (a second press answers 409), or nothing is read again after it; or the Undo sends more than { reverse, mergeLogId } (a body pin — the server routes by its log)');

        reset(); answer = () => respond(409, { error: 'This merge has already been undone.' });
        await restore();
        assert.deepEqual(log, ['toast null', UNDO, 'toast {"error":"Merge not undone — This merge has already been undone."}'],
            'REGRESSION: a refused Undo says nothing, or reads every list again');

        reset(); answer = () => respond(500, { error: 'Internal server error', requestId: 'req-1' });
        await restore();
        assert.deepEqual(log, ['toast null', UNDO, ...FIVE, 'toast {"error":"The server returned 500 — Internal server error (ref req-1). Reload the page to see whether the merge was undone."}']);

        reset(); answer = () => Promise.reject(new TypeError('Failed to fetch'));
        await restore();
        assert.deepEqual(log, ['toast null', UNDO, ...FIVE, 'toast {"error":"No answer from the server — reload the page to see whether the merge was undone."}']);

        // a done Undo whose answer could not be read (dbWrite: data null — the review, 17 Oct): the toast's own name for it
        reset(); answer = () => respond(200, undefined);
        await restore();
        assert.deepEqual(log, ['toast null', UNDO, ...FIVE, 'offer {"notice":"Merge undone — “Resinall, Inc.” is its own record again."}'],
            'REGRESSION: a done Undo whose answer could not be read names no record — "Merge undone."');

        reset(); answer = held(200, { success: true, restoredName: 'Resinall, Inc.', keptLinks: 0, keptFields: [] });
        const pending = restore();
        await sentHeld();
        storage.setRequestOrg('org_b'); release(); await pending;
        assert.deepEqual(log, ['toast null', UNDO], 'an Undo answered after an org switch: nothing read, nothing said');
        storage.setRequestOrg('org_qa');

        reset(); answer = held(200, { success: true, restoredName: 'Resinall, Inc.' });
        const u = api.undoMerge('mrg_x', 'account');
        await sentHeld();
        storage.setRequestOrg('org_b'); release();
        assert.deepEqual(await u, { ok: false, words: null });
        assert.deepEqual(log, [UNDO], 'REGRESSION: an Undo\'s answer after an org switch reads the new org\'s lists');
        storage.setRequestOrg('org_qa');

        reset(); answer = () => respond(409, { error: '“Resinall, Inc.” was deleted after this merge, so the merge can no longer be undone.' });
        assert.deepEqual(await api.undoMerge('mrg_x', 'account'), { ok: false, words: 'Merge not undone — “Resinall, Inc.” was deleted after this merge, so the merge can no longer be undone.' });
        assert.deepEqual(log, [UNDO], 'refused: nothing moved, nothing read');

        reset(); answer = () => respond(200, { contact: { id: 'con_1' }, archivedId: 'con_2', mergeLogId: 'mrg_c' });
        await api.handleContactMerge(C_PAYLOAD);
        const contactRestore = offers[0].restore;
        reset(); answer = () => respond(200, { success: true, restoredName: 'Lee Ng (2)', keptLinks: 0, keptFields: [] });
        await contactRestore();
        assert.deepEqual(log, ['toast null', `${MERGE} {"reverse":true,"mergeLogId":"mrg_c"}`, ...FOUR, 'offer {"notice":"Merge undone — “Lee Ng (2)” is its own record again."}'],
            "a contact merge's Undo: its own id alone, the four lists a contact merge moves");
    });
});

test("T9 — merge.mjs's Undo, each pin in its own function: the merge logs each sub-account's tier and which renamed deals and contacts stood on the survivor by id; the batch opens with the claim and the un-archive, each aborting it unless it wrote its row, then the survivor's assert, then the record merged away where the parent rule read it; every restore conditioned on what the merge wrote and stamped, a sub-account only where the parent rule puts it back, a deal the merge moved up never by its id, a contact's company never over a link to the survivor; a deal's id and name together; the survivor's fields only as read, a tier only with nothing under it that would not rank below; its name cascaded by account id while it stands, never counting what the merge did not leave there; the survivor's own deals and contacts renamed by name read last; an abort read again as the refusal; the log's status read again after its records; refused before anything is built; Past merges after the role gate, in this org, each status read again after its records; and an Undo never puts a deal on a site (Jeff, 18 Oct): the survivor's deals read before the batch and handed to the parent rule, those that keep it at its level counted, a site's tier back only while no deal stands on it, a deal back to the record merged away by its id, its lift or its name alone only while that is no site, one left on the survivor never counted put back by its name cascade", () => {
    const g = code(read(MJ));
    // The merge logs what its Undo reads (the re-check, 17 Oct): each sub-account's tier as it stood; and, on each name
    // rewrite of a table that links by id, which of its rows stood on the survivor by id
    const mh = between(g, 'export const handler = async (event) => {', 'const undoRowsOf = async');
    order(mh,
        ind(8, 'const kids = await db.select({ id: accounts.id, accountTier: accounts.accountTier }).from(accounts).where(and(eq(accounts.parentAccountId, archivedId), eq(accounts.orgId, orgId)));'),
        ind(8, 'const childIds = kids.map((k) => k.id);'),
        ind(8, "if (childIds.length) rewrites.push({ table: 'accounts', column: 'parentAccountId', kind: 'id', ids: childIds, oldValue: archivedId, newValue: survivorId, tiers: Object.fromEntries(kids.map((k) => [k.id, k.accountTier ?? null])) });"),
        ind(16, 'const ids = await snapIds(t.table, and(eq(t.col, oldVal), eq(t.table.orgId, orgId), ...(t.scope ? [t.scope()] : [])));'),
        ind(16, "if (ids.length) rewrites.push({ table: t.name, column: t.column, kind: 'name', ids, oldValue: oldVal, newValue: survName,"),
        ind(20, '...(t.table.accountId ? { onSurvivor: await snapIds(t.table, and(inArray(t.table.id, ids), eq(t.table.orgId, orgId), eq(t.table.accountId, survivorId))) } : {}) });'));
    once(g, 'const writesItsRow = (write) => db.execute(sql`with w as ${write} select 1 / count(*) from w`);',
        'REGRESSION: a claim or un-archive that wrote nothing lets the batch write on — an Undo racing a delete moves links to a record that is gone');
    once(g, 'const nameNow = (id, orgId) => sql`(select ${accounts.name} from ${accounts} where ${accounts.id} = ${id} and ${accounts.orgId} = ${orgId})`;', "an account's name as it stands, in this org");
    // the parent rule's reads and its two asks in the batch (the review, 17 Oct)
    order(g,
        'const treeOf = (orgId) => db.select({',
        ind(4, 'id: accounts.id, name: accounts.name, parentAccountId: accounts.parentAccountId,'),
        ind(4, 'accountTier: accounts.accountTier, mergeArchived: accounts.mergeArchived,'),
        '}).from(accounts).where(eq(accounts.orgId, orgId));');
    once(g, 'const asRead = (col, v) => (v == null ? isNull(col) : eq(col, v));');
    once(g, "const nothingUnder = (id, tier, orgId) => sql`not exists (select 1 from ${accounts} where ${accounts.parentAccountId} = ${id} and ${accounts.orgId} = ${orgId} and ${accounts.id} <> ${id} and (case ${accounts.accountTier} when 'business_unit' then 1 when 'site' then 2 else 0 end) <= ${sql.raw(String(rankOf(tier) ?? 0))})`;",
        "REGRESSION (S1): an account added under the survivor while the Undo ran is put under a site — restorePlace's check not asked again in the statement");
    once(g, 'const standsNow = (id, orgId) => sql`exists (select 1 from ${accounts} where ${accounts.id} = ${id} and ${accounts.orgId} = ${orgId})`;',
        "REGRESSION (S2): a survivor deleted while the Undo ran — its name cascade writes none over its deals and contacts");
    // an Undo never puts a deal on a site (Jeff, 18 Oct: "Leave such deals and count them"): the survivor's deals read,
    // in this org; its two asks in the batch
    order(g,
        'const dealsOn = async (id, orgId) => (await db.select({ id: opportunities.id }).from(opportunities)',
        ind(4, '.where(and(eq(opportunities.accountId, id), eq(opportunities.orgId, orgId)))).map((d) => d.id);'));
    once(g, 'const noDealOn = (id, orgId) => sql`not exists (select 1 from ${opportunities} where ${opportunities.accountId} = ${id} and ${opportunities.orgId} = ${orgId})`;',
        'REGRESSION: a deal linked to the survivor while the Undo ran is left on it, a site again — or one in another org keeps it where it stands');
    once(g, "const notASite = (id, orgId) => sql`exists (select 1 from ${accounts} where ${accounts.id} = ${id} and ${accounts.orgId} = ${orgId} and ${accounts.accountTier} is distinct from 'site')`;",
        'REGRESSION: a deal moved back to the record merged away, a site — or the ask without its org (a code rule: every statement names this org; no behaviour — the un-archive before it holds that row in this org by its id)');
    once(g, "import { UNDO_CHANGED, undoRefusal, upIdOf, orgChartUnion, survivorRestore, undoPlaces, dealsByIdOf, survivorRowsOf, undoKept, undoDetail } from '../../src/utils/mergeUndo.js';");
    once(g, "import { rankOf } from '../../src/utils/accountParent.js';");
    const undoOps = between(g, 'export function undoOps(', 'export const undoBatch = ');
    assert.equal(between(undoOps, ind(4, 'const ops = [\n'), ind(4, '];\n')), [
        ind(4, 'const ops = ['),
        ind(8, "writesItsRow(db.update(mergeLog).set({ status: 'reversed', reversedAt: now })"),
        ind(12, ".where(and(eq(mergeLog.id, log.id), eq(mergeLog.orgId, orgId), eq(mergeLog.status, 'merged')))"),
        ind(12, '.returning({ id: mergeLog.id })),'),
        ind(8, 'writesItsRow(db.update(records).set({ mergeArchived: false, mergedIntoId: null, archivedAt: null, updatedAt: now })'),
        ind(12, '.where(and(eq(records.id, log.archivedId), eq(records.orgId, orgId), eq(records.mergeArchived, true), eq(records.mergedIntoId, log.survivorId)))'),
        ind(12, '.returning({ id: records.id })),'),
        ind(8, 'db.select({ ok: sql`1 / count(*)` }).from(records).where(and(eq(records.orgId, orgId), eq(records.id, log.survivorId),'),
        ind(12, 'or(isNull(records.mergeArchived), eq(records.mergeArchived, false)))),'),
        ind(4, '];'),
        '',
    ].join('\n'), "REGRESSION: the batch's head — the claim takes a merge already undone (a stale Undo writes over a merge made again), the un-archive asserts nothing or takes a record merged elsewhere, or no survivor-live assert");
    order(undoOps,
        ind(4, "const records = kind === 'contact' ? contacts : accounts;"),
        ind(4, 'const restored = survivorRestore(kind, log, rows.survivor);'),
        ind(4, "const placed = kind === 'account' ? undoPlaces(log, rows.tree, restored, rows.deals) : null;"),
        ind(4, 'if (placed?.under) {'),
        ind(8, 'ops.push(db.select({ ok: sql`1 / count(*)` }).from(accounts).where(and(eq(accounts.orgId, orgId), eq(accounts.id, log.archivedId),'),
        ind(12, 'asRead(accounts.parentAccountId, placed.under.parentAccountId), asRead(accounts.accountTier, placed.under.accountTier))));'),
        ind(4, 'const restores = [];'),
        ind(4, "if (kind === 'contact') contactRestores(log, orgId, now, ops, restores);"),
        ind(4, 'else accountRestores(log, orgId, now, ops, restores, placed.subs);'),
        ind(4, "if (placed?.held.length) restores.push({ table: 'opportunities', ids: placed.held, at: -1, held: true });"),
        ind(4, 'const { set, keptFields } = placed || restored;'),
        ind(4, 'if (Object.keys(set).length) {'),
        ind(8, 'survivorAt = ops.length;'),
        ind(8, 'ops.push(db.update(records).set({ ...set, updatedAt: now })'),
        ind(12, '.where(and(eq(records.id, log.survivorId), eq(records.orgId, orgId), sql`${records.updatedAt}::text = ${rows.survivor.updatedAtText}`,'),
        ind(16, "...(set.accountTier === 'site' ? [noDealOn(log.survivorId, orgId)] : []),"),
        ind(16, "...('accountTier' in set ? [nothingUnder(log.survivorId, set.accountTier, orgId)] : [])))"),
        ind(12, '.returning({ id: records.id }));'),
        ind(4, "const deals = kind === 'account' ? survivorRowsOf(log, 'opportunities') : null;"),
        ind(4, "const people = kind === 'account' ? survivorRowsOf(log, 'contacts') : null;"),
        ind(4, "if (kind === 'account' && 'name' in set) {"),
        ind(8, "cascades.push({ table: 'opportunities', ids: [], at: ops.length, since: [...deals.since, ...dealsByIdOf(log)] });"),
        ind(8, 'ops.push(db.update(opportunities).set({ account: nameNow(log.survivorId, orgId) })'),
        ind(12, '.where(and(eq(opportunities.accountId, log.survivorId), eq(opportunities.orgId, orgId), standsNow(log.survivorId, orgId)))'),
        ind(8, "cascades.push({ table: 'contacts', ids: [], at: ops.length, since: people.since });"),
        ind(8, 'ops.push(db.update(contacts).set({ company: nameNow(log.survivorId, orgId) })'),
        ind(12, '.where(and(eq(contacts.accountId, log.survivorId), eq(contacts.orgId, orgId), standsNow(log.survivorId, orgId)))'),
        ind(4, "if (kind === 'account') {"),
        ind(8, 'if (deals.on.length) {'),
        ind(12, "restores.push({ table: 'opportunities', ids: deals.on, at: ops.length });"),
        ind(12, 'ops.push(db.select({ id: opportunities.id }).from(opportunities).where(and(inArray(opportunities.id, deals.on), eq(opportunities.orgId, orgId),'),
        ind(16, 'eq(opportunities.accountId, log.survivorId), eq(opportunities.account, nameNow(log.survivorId, orgId)))));'),
        ind(8, 'if (people.on.length) {'),
        ind(12, "restores.push({ table: 'contacts', ids: people.on, at: ops.length });"),
        ind(12, 'ops.push(db.select({ id: contacts.id }).from(contacts).where(and(inArray(contacts.id, people.on), eq(contacts.orgId, orgId),'),
        ind(16, 'eq(contacts.accountId, log.survivorId), eq(contacts.company, nameNow(log.survivorId, orgId)))));'),
        ind(4, 'return { ops, restores, cascades, survivorAt, set, keptFields };'));
    // An account merge's links (Q3; a deal's id and name together — C2); a sub-account only where the parent rule puts it;
    // a deal the merge moved up by its lift alone, and a contact's company never over a link to the survivor (the
    // re-check, 17 Oct); a deal back to the record merged away — by its id, or by the name the merge took from it —
    // only while that is no site (Jeff, 18 Oct; the re-check, 18 Oct)
    const ar = between(g, 'const accountRestores = (log, orgId, now, ops, restores, subs) => {', 'const contactRestores = ');
    order(ar,
        ind(4, 'const upId = upIdOf(log);'),
        ind(4, "const lifted = new Set((log.rewrites || []).filter((r) => r.kind === 'lift').flatMap((r) => r.ids || []));"),
        ind(8, "if (rw.kind === 'lift') {"),
        ind(16, 'const fromArchived = row.old?.accountId === log.archivedId;'),
        ind(16, 'restores.push({ table: rw.table, ids: [row.id], at: ops.length });'),
        ind(16, 'ops.push(db.update(table).set({ accountId: row.old?.accountId ?? null, account: fromArchived ? nameNow(log.archivedId, orgId) : (row.old?.account ?? null), site: row.old?.site ?? null, updatedAt: now })'),
        ind(20, '.where(and(eq(table.id, row.id), eq(table.orgId, orgId), eq(table.accountId, upId), eq(table.site, log.survivorName), notASite(log.archivedId, orgId)))'),
        ind(8, "const ids = rw.ids.filter((id) => !(rw.table === 'accounts' && id === log.survivorId));"),
        ind(8, "const dealId = rw.table === 'opportunities' && rw.column === 'accountId';"),
        ind(8, "const dealName = rw.table === 'opportunities' && rw.column === 'account';"),
        ind(8, "const contactName = rw.table === 'contacts' && rw.column === 'company';"),
        ind(8, 'const toArchivedName = dealName && rw.oldValue === log.archivedName && rw.newValue !== rw.oldValue;'),
        ind(8, "const writes = rw.table === 'accounts' ? ids.filter((id) => subs.includes(id)) : dealId ? ids.filter((id) => !lifted.has(id)) : ids;"),
        ind(8, 'restores.push({ table: rw.table, ids, at: writes.length ? ops.length : -1 });'),
        ind(8, 'if (!writes.length) continue;'),
        ind(8, 'ops.push(db.update(table).set({ [rw.column]: rw.oldValue, ...(dealId ? { account: nameNow(log.archivedId, orgId) } : {}), updatedAt: now })'),
        ind(12, '.where(and(inArray(table.id, writes), eq(table.orgId, orgId), eq(table[rw.column], rw.newValue), ...(dealName ? [isNull(table.accountId)] : []),'),
        ind(16, '...(dealId || toArchivedName ? [notASite(log.archivedId, orgId)] : []),'),
        ind(16, '...(contactName ? [or(isNull(table.accountId), sql`${table.accountId} <> ${log.survivorId}`)] : [])))'));
    // A contact merge's links
    const cr = between(g, 'const contactRestores = (log, orgId, now, ops, restores) => {', 'export function undoOps(');
    order(cr,
        ind(12, 'restores.push({ table: rw.table, ids: rw.ids, at: ops.length });'),
        ind(12, 'ops.push(db.update(table).set({ [rw.column]: rw.oldValue, updatedAt: now })'),
        ind(16, '.where(and(inArray(table.id, rw.ids), eq(table.orgId, orgId), eq(table[rw.column], rw.newValue)))'),
        ind(16, 'restores.push({ table: rw.table, ids: [row.id], at: ops.length });'),
        ind(16, 'ops.push(db.update(table).set({ [rw.column]: row.old, updatedAt: now })'),
        ind(20, '.where(and(eq(table.id, row.id), eq(table.orgId, orgId), sql`${table[rw.column]} = ${JSON.stringify(row.new)}::jsonb`))'));
    for (const [what, s] of [['an account merge', ar], ['a contact merge', cr]]) {
        assert.equal(count(s, 'ops.push(db.update(table).set('), 2, what);
        assert.equal(count(s, 'updatedAt: now })'), 2, `${what}: every restore stamped, as the merge stamps the rows it moves`);
        assert.equal(count(s, '.returning({ id: table.id })'), 2, `${what}: every restore answers the rows it wrote, which undoKept counts`);
        assert.equal(count(s, 'restores.push('), 2, `${what}: every restore counted`);
    }
    const ub = between(g, 'export const undoBatch = ', 'const undoMergeLog = ');
    order(ub,
        ind(4, 'try { return { results: await db.batch(ops) }; }'),
        ind(8, "if (!['22012', '40001', '40P01'].includes(String(e?.cause?.code || e?.code || ''))) throw e;"),
        ind(8, 'const [again] = await db.select().from(mergeLog).where(and(eq(mergeLog.id, log.id), eq(mergeLog.orgId, orgId)));'),
        ind(8, 'const refusal = again ? undoRefusal({ log: again, ...(await undoRowsOf(table, again, orgId)) }) : null;'),
        ind(8, 'return { refused: { statusCode: 409, headers, body: JSON.stringify({ error: refusal || UNDO_CHANGED }) } };'));
    const um = between(g, 'const undoMergeLog = ', 'const reverseAccountMerge = ');
    order(um,
        ind(4, 'const [log] = await db.select().from(mergeLog).where(and(eq(mergeLog.id, mergeLogId), eq(mergeLog.orgId, orgId)));'),
        ind(4, 'const rows = await undoRowsOf(table, log, orgId);'),
        ind(4, 'const [again] = await db.select({ status: mergeLog.status }).from(mergeLog).where(and(eq(mergeLog.id, mergeLogId), eq(mergeLog.orgId, orgId)));'),
        ind(4, 'const refusal = undoRefusal({ log: { ...log, status: again?.status ?? log.status }, ...rows });'),
        ind(4, 'if (refusal) return { statusCode: 409, headers, body: JSON.stringify({ error: refusal }) };'),
        ind(4, "const tree = kind === 'account' ? await treeOf(orgId) : null;"),
        ind(4, "const deals = kind === 'account' ? await dealsOn(log.survivorId, orgId) : null;"),
        ind(4, 'const built = undoOps(kind, log, { ...rows, tree, deals }, orgId, new Date());'),
        ind(4, 'const done = await undoBatch(built.ops, { log, table, orgId, headers });'),
        ind(4, 'if (done.refused) return done.refused;'),
        ind(4, 'const { keptLinks, keptFields } = undoKept(built, done.results);'));
    assert.ok(um.includes("action: kind === 'contact' ? 'contact.merge_undone' : 'account.merge_undone'"), 'both actions as literals (audit-coverage)');
    once(g, "const reverseAccountMerge = (args) => undoMergeLog({ ...args, kind: 'account' });");
    once(g, "const reverseContactMerge = (args) => undoMergeLog({ ...args, kind: 'contact' });");
    // Past merges: after the role gate, in this org; CORS answers GET
    once(g, ind(8, "'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',"));
    order(g,
        ind(4, "if (userRole !== 'Admin' && userRole !== 'Manager') {"),
        ind(4, "if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {"),
        ind(8, "if (event.httpMethod === 'GET') return await listMerges({ event, orgId, headers });"),
        ind(8, "const body = JSON.parse(event.body || '{}');"));
    const lm = g.slice(g.indexOf('async function listMerges('));
    assert.ok(lm.includes('}).from(mergeLog).where(and(eq(mergeLog.orgId, orgId), eq(mergeLog.entityType, entityType)))'), "REGRESSION: Past merges lists another org's merges");
    assert.ok(lm.includes('await getCallerName(by, orgId)'), 'who merged, named in this org');
    // each log's status read again after its records, as an Undo reads it (the review, 17 Oct)
    order(lm,
        ind(4, 'const again = shown.length ? await db.select({ id: mergeLog.id, status: mergeLog.status, reversedAt: utc(mergeLog.reversedAt) }).from(mergeLog)'),
        ind(8, '.where(and(eq(mergeLog.orgId, orgId), inArray(mergeLog.id, shown.map((l) => l.id)))) : [];'),
        ind(4, 'const statusNow = new Map(again.map((l) => [l.id, l]));'),
        ind(4, 'const merges = shown.map((read) => {'),
        ind(8, 'const l = { ...read, ...(statusNow.get(read.id) || {}) };'));
    assert.ok(lm.indexOf('const rows = ids.length ? await db.select()') < lm.indexOf('const again = shown.length'), 'after the records');
    // Isolation (CLAUDE.md): every read and write the Undo and Past merges make names this org; none deletes
    const fresh = between(g, 'const undoRowsOf = async (table, log, orgId) => {', 'const reverseContactMerge = ') + lm;
    const at = [...fresh.matchAll(/db\.(update|select|insert|delete)\(/g)].map((m) => m.index);
    assert.ok(at.length >= 15, `the statements read: ${at.length}`);
    at.forEach((i, k) => {
        const stmt = fresh.slice(i, k + 1 < at.length ? at[k + 1] : fresh.length);
        assert.match(stmt, /\.orgId, orgId\)/, `a statement names no org: ${stmt.split('\n')[0].trim().slice(0, 100)}`);
    });
    assert.ok(!/db\.delete\(/.test(fresh), 'the Undo deletes nothing');
});

test('T10 — the words (Q8 "Approve as written"; amend 12, 44; Jeff, 18 Oct: "New words"): a merge refused says the server\'s words; a 500 or no answer says it may have been made and where to look; an Undo done says the record is back and how many records it left as they are now — "1 record was left as it is now.", "N records were left as they are now.", the survivor one record whatever of it was kept — its owner with its id, its place, a phone and a website (the re-check, 18 Oct); refused, the server\'s words; a 500 or no answer says to reload and look; a done answer that could not be read names the record as the screen does, never “undefined”', async () => {
    const U = await mergeUndo();
    for (const [r, words] of [
        [{ ok: false, status: 409, error: 'One of these records changed since you opened the merge. Please re-open and review again.' }, 'One of these records changed since you opened the merge. Please re-open and review again.'],
        [{ ok: false, status: 404, error: 'Survivor account not found.' }, 'Survivor account not found.'],
        [{ ok: false, status: 403, error: 'You do not have permission to make this change.' }, 'You do not have permission to make this change.'],
        [{ ok: false, status: 500, error: 'Internal server error (ref req-1)' }, 'The server returned 500 — Internal server error (ref req-1). The merge may have been made — close this window and look under Past merges on this page.'],
        [{ ok: false, status: 502, error: 'The server returned 502.' }, 'The server returned 502. The merge may have been made — close this window and look under Past merges on this page.'],
        [{ ok: false, status: 0, error: 'Network error — the change was not saved.' }, 'No answer from the server — the merge may have been made. Close this window and look under Past merges on this page.'],
    ]) assert.equal(U.mergeWords(r), words, `REGRESSION: a merge's ${r.status} — "Merge failed" over a merge that may have been made, or a doubled "returned"`);
    const done = (data) => U.undoWords({ ok: true, status: 200, data: { restoredName: 'Resinall, Inc.', ...data } });
    assert.equal(done({ keptLinks: 0, keptFields: [] }), 'Merge undone — “Resinall, Inc.” is its own record again.', 'nothing kept: no count');
    assert.equal(done({}), 'Merge undone — “Resinall, Inc.” is its own record again.');
    // the survivor once, whatever of it was kept (the re-check, 18 Oct: a field is no record)
    assert.equal(done({ keptLinks: 0, keptFields: ['accountOwner', 'ownerId'] }), 'Merge undone — “Resinall, Inc.” is its own record again. 1 record was left as it is now.',
        'REGRESSION: each kept field of the survivor counted as a record of its own — its owner and its id, "2 records were left as they are now." for one survivor');
    assert.equal(done({ keptLinks: 0, keptFields: ['parentAccountId', 'accountTier'] }), 'Merge undone — “Resinall, Inc.” is its own record again. 1 record was left as it is now.',
        'REGRESSION: each kept field of the survivor counted as a record of its own — its parent and its tier, "2 records were left as they are now." for one survivor (the review, 17 Oct)');
    assert.equal(done({ keptLinks: 0, keptFields: ['accountTier'] }), 'Merge undone — “Resinall, Inc.” is its own record again. 1 record was left as it is now.', 'a tier alone: one');
    assert.equal(done({ keptLinks: 0, keptFields: ['phone', 'website'] }), 'Merge undone — “Resinall, Inc.” is its own record again. 1 record was left as it is now.',
        'REGRESSION (the re-check, 18 Oct): the survivor\'s phone and website, each edited since, said as two records — "2 records were left as they are now." for one survivor');
    assert.equal(done({ keptLinks: 0, keptFields: ['address', 'city', 'zip'] }), 'Merge undone — “Resinall, Inc.” is its own record again. 1 record was left as it is now.',
        'REGRESSION (the re-check, 18 Oct): an address the merge filled, corrected since, said as three records');
    assert.equal(done({ keptLinks: 0, keptFields: ['title', 'phone'] }), 'Merge undone — “Resinall, Inc.” is its own record again. 1 record was left as it is now.',
        "REGRESSION (the re-check, 18 Oct): a contact's title and phone, each edited since, said as two records");
    assert.equal(done({ keptLinks: 1, keptFields: ['phone', 'parentAccountId', 'accountTier'] }), 'Merge undone — “Resinall, Inc.” is its own record again. 2 records were left as they are now.',
        'REGRESSION (the re-check, 18 Oct): a deal and the survivor — its phone and its place — said as three records');
    assert.equal(done({ keptLinks: 2, keptFields: [] }), 'Merge undone — “Resinall, Inc.” is its own record again. 2 records were left as they are now.',
        'REGRESSION (Jeff, 18 Oct: "New words"): the done words count "changes made since the merge" — what the parent rule kept, and a deal never put on a site, nobody changed');
    assert.equal(done({ keptLinks: 1, keptFields: ['phone'] }), 'Merge undone — “Resinall, Inc.” is its own record again. 2 records were left as they are now.');
    assert.equal(done({ keptLinks: 1, keptFields: [] }), 'Merge undone — “Resinall, Inc.” is its own record again. 1 record was left as it is now.',
        'REGRESSION: one record said as many — "1 records were left as they are now."');
    assert.equal(U.undoWords({ ok: true, status: 200, data: null }, 'Resinall, Inc.'), 'Merge undone — “Resinall, Inc.” is its own record again.',
        'REGRESSION: a done Undo whose answer could not be read (dbWrite: data null) names no record — "Merge undone." — the screen names it (the review, 17 Oct)');
    assert.equal(U.undoWords({ ok: true, status: 200, data: { restoredName: 'Resinall, Inc.' } }, 'Resinall Inc'), 'Merge undone — “Resinall, Inc.” is its own record again.', "the server's name first");
    assert.equal(U.undoWords({ ok: true, status: 200, data: null }), 'Merge undone.', 'no name at all: never “undefined”');
    assert.equal(U.undoWords({ ok: false, status: 409, error: 'This merge has already been undone.' }), 'Merge not undone — This merge has already been undone.');
    assert.equal(U.undoWords({ ok: false, status: 409, error: U.UNDO_CHANGED }), 'Merge not undone — One of these records changed while the merge was being undone. Please try again.', 'amend 12.1');
    assert.equal(U.undoWords({ ok: false, status: 403, error: 'You do not have permission to make this change.' }), 'Merge not undone — You do not have permission to make this change.');
    assert.equal(U.undoWords({ ok: false, status: 500, error: 'Internal server error (ref req-1)' }), 'The server returned 500 — Internal server error (ref req-1). Reload the page to see whether the merge was undone.',
        'REGRESSION: a server error reads "not undone" over an Undo that may have landed');
    assert.equal(U.undoWords({ ok: false, status: 503, error: 'The server returned 503.' }), 'The server returned 503. Reload the page to see whether the merge was undone.');
    assert.equal(U.undoWords({ ok: false, status: 0, error: 'Network error — the change was not saved.' }), 'No answer from the server — reload the page to see whether the merge was undone.',
        'REGRESSION: no answer reads "not undone" over an Undo that may have landed');
    assert.equal(U.mergedNoticeWords('Resinall, Inc.', 'Resinall'), 'Merged “Resinall, Inc.” into “Resinall” — its Undo is under Past merges on this page.', 'amend 12.2');
    // Past merges' confirm, in Jeff's corrected text (18 Oct: "Use the corrected text")
    assert.equal(U.undoConfirmWords({ archivedName: 'Resinall, Inc.', survivorName: 'Resinall' }),
        'Undo the merge of “Resinall, Inc.” into “Resinall”? “Resinall, Inc.” comes back as its own record, and what the merge moved to “Resinall” moves back, except what cannot go back where it was (it stays, and is counted). Anything changed since the merge stays as it is now.',
        'REGRESSION (Jeff, 18 Oct: "Use the corrected text"): the confirm says all the merge moved goes back — Q8\'s words, nothing of what the parent rule and the deal rule keep where it stands, counted');
});

test("T11 — the toast: four shapes in one slot — an error, a notice, a merge's, a delete's — Undo only with a restore, 🗑 and \"deleted\" a delete's alone; App: offerUndo holds the five-second timer, softDelete goes through it, useMerge is called after it and handed the five loads, the toast and setUndoToast; the context hands findMerges and undoMerge, the old reverses gone", () => {
    const m = code(read(ML));
    assert.equal(between(m, ind(24, '{undoToast.error\n'), ind(24, '<button onClick={() => { clearTimeout(undoToast.timerId); undoToast.restore(); }}')), [
        ind(24, '{undoToast.error'),
        ind(28, '? <>⚠ {undoToast.error}</>'),
        ind(28, ': undoToast.notice'),
        ind(32, '? <>✓ {undoToast.notice}</>'),
        ind(32, ': undoToast.merged'),
        ind(36, '? <>Merged <strong>“{undoToast.merged}”</strong> into <strong>“{undoToast.into}”</strong></>'),
        ind(36, ': <>🗑 <strong>{undoToast.label}</strong> deleted</>}'),
        ind(20, '</span>'),
        ind(20, '{undoToast.restore && ('),
        ind(24, '<button onClick={() => { clearTimeout(undoToast.timerId); undoToast.restore(); }}'),
    ].join('\n'), 'REGRESSION: a merge\'s toast or a notice reads "🗑 deleted" — a delete\'s words, no name — or a notice offers an Undo that throws on click');
    const a = code(read(APP));
    const TIMER = ind(8, 'const timerId = setTimeout(() => { if (stillOrg(askedOrg)) setUndoToast(t => (t && t.timerId === timerId ? null : t)); }, 5000);');
    assert.equal(between(a, ind(4, 'const offerUndo = (toast) => {\n'), ind(4, '};\n    const softDelete')), [
        ind(4, 'const offerUndo = (toast) => {'),
        ind(8, 'if (undoToast) clearTimeout(undoToast.timerId);'),
        ind(8, 'const askedOrg = requestOrg();   // after an org switch the timer clears nothing (state §0.175)'),
        TIMER,
        ind(8, 'setUndoToast({ ...toast, timerId });'),
        ind(4, '};'),
        ind(4, 'const softDelete'),
    ].join('\n'), 'the one toast: five seconds (Q5, as the delete toasts), a later toast or an org switch takes it down');
    order(a, ind(4, 'const softDelete = (label, deleteFunc, restoreFunc) => {'), ind(8, 'deleteFunc();'), ind(8, 'offerUndo({ label, restore: restoreFunc });'));
    const USE_MERGE = ind(8, 'useMerge({ setAccounts, setContacts, loadAccounts, loadContacts, loadOpportunities, loadTasks, loadActivities, offerUndo, setUndoToast, currentUser: { name: currentUser } });');
    once(a, USE_MERGE, 'REGRESSION: the merge hook is handed no toast, or no deal, task or activity load');
    assert.ok(a.indexOf(USE_MERGE) > a.indexOf(ind(4, 'const offerUndo = (toast) => {')), 'called after offerUndo: named before its declaration it is read in its TDZ');
    order(a, ind(4, 'const { mergeSaving, mergeError, setMergeError, findDuplicates, handleMerge,'), ind(8, 'findContactDuplicates, handleContactMerge, findMerges, undoMerge } ='), USE_MERGE);
    assert.equal(count(a, '\n        findMerges, undoMerge,\n'), 1, 'REGRESSION: the screens are handed no Undo — Past merges cannot list or undo');
    assert.ok(!/\breverse(Contact)?Merge\b/.test(a), 'the old reverses, which no screen called, gone from the context');
    // the hook reads what App hands it, and App takes what the hook returns
    const h = code(read(UM));
    const DEPS = ind(4, 'const { setAccounts, setContacts, loadAccounts, loadContacts, loadOpportunities, loadTasks, loadActivities, offerUndo, setUndoToast, currentUser } = deps || {};');
    once(h, DEPS);
    const names = (s) => s.split(',').map((x) => x.trim().split(':')[0].trim()).filter(Boolean).sort();
    assert.deepEqual(names(USE_MERGE.slice(USE_MERGE.indexOf('({') + 2, USE_MERGE.lastIndexOf('})'))), names(DEPS.slice(DEPS.indexOf('{') + 1, DEPS.indexOf('}'))));
    assert.deepEqual(names(between(h, ind(4, 'return {\n'), ind(4, '};')).replace(/return \{|\};/g, '').replace(/\n/g, ',')),
        names('mergeSaving, mergeError, setMergeError, findDuplicates, handleMerge, findContactDuplicates, handleContactMerge, findMerges, undoMerge'));
});

const SCAN = [[DS, 'accounts', 'acctCountRef', 'account'], [CS, 'contacts', 'countRef', 'contact']];
const keyLine = (list) => ind(4, 'const scanKey = `${(' + list + ' || []).length}:${(' + list + ' || []).filter(isMergeArchived).length}`;');

test("T12 — the scan pages: the scan's key is the list's length and its merged-away count, so the scan re-runs after a merge's drop, after the list read again holds the row merged away, and after an Undo's list holds it live again (a contact merge reads no accounts: T7); Past merges sits below the pairs, read again on the same key (Q7: \"Fix all four now\")", () => {
    for (const [rel, list, ref, kind] of SCAN) {
        const s = code(read(rel));
        once(s, "import { isMergeArchived } from '../utils/pickLink.js';");
        once(s, "import PastMerges from './PastMerges';");
        once(s, keyLine(list), `REGRESSION: the ${kind} scan does not re-run after an Undo — the pair it undid is not offered again`);
        order(s, keyLine(list),
            ind(4, 'useEffect(() => {'),
            ind(8, `if (${ref}.current === null) { ${ref}.current = scanKey; return; }`),
            ind(8, `if (scanKey !== ${ref}.current) { ${ref}.current = scanKey; runScan(tier); }`),
            ind(4, '}, [scanKey, tier, runScan]);'));
        once(s, ind(12, `<PastMerges entityType="${kind}" version={scanKey} />`),
            `REGRESSION: Past merges missing from the ${kind}s' Find & merge page (no Undo once the toast is gone), or not read again after a merge or an Undo`);
        assert.ok(!s.includes(`const n = (${list} || []).length;`), 'the old key, the length alone, gone');
        // run as written: each step moves the key
        const keyOf = (rows) => run([keyLine(list)], [list, 'isMergeArchived'], [rows, isMergeArchived], 'scanKey');
        const live = [{ id: 'x' }, { id: 'y' }, { id: 'z' }];
        const dropped = live.filter((r) => r.id !== 'x');
        const mergedAway = [{ id: 'x', mergeArchived: true, mergedIntoId: 'y' }, { id: 'y' }, { id: 'z' }];
        const keys = [live, dropped, mergedAway, live].map(keyOf);
        assert.deepEqual(keys, ['3:0', '2:0', '3:1', '3:0'], 'the merge\'s drop, the list read again, the Undo\'s list: each a new key');
    }
    once(code(read(DS)), ind(16, '<PairCard key={`${pair.a.id}::${pair.b.id}::${i}`} pair={pair} tier={tier} onMerge={openMerge} />'));
});

const srcFiles = (dir = 'src') => readdirSync(new URL(`${dir}/`, ROOT), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? srcFiles(`${dir}/${e.name}`) : /\.(jsx?|mjs|ts)$/.test(e.name) ? [`${dir}/${e.name}`] : []));
const SCAN_COPY = 'merge them into one record. A merge can be undone under Past merges below, unless one of its two records was deleted or merged again since.';
const WINDOW_COPY = 're-linked to the survivor. You can undo the merge afterward under Past merges on this page.';

test('T13 — the copy says what is offered (Q8): no file under src says a merge is "fully reversible" or "Reversible afterward"; the merge windows, the scan pages and Settings\' two rows say where the Undo is; no screen sends a merge audit row (Q6)', () => {
    const files = srcFiles();
    for (const rel of files) {
        const t = read(rel);
        assert.ok(!/fully reversible|Reversible afterward|30-day undo/i.test(t), `REGRESSION: ${rel} says a merge is fully reversible — no age limit and no exact Undo (Q2, Q3)`);
        assert.ok(!/addAudit\??\.?\(\s*'merge'/.test(t), `REGRESSION: ${rel} sends the merge screen's own audit row — two rows per merge (Q6)`);
    }
    for (const rel of ['src/components/modals/MergeReviewModal.jsx', 'src/components/modals/ContactMergeReviewModal.jsx']) assert.equal(count(read(rel), WINDOW_COPY), 1, `${rel}: the window says where the Undo is`);
    for (const rel of [DS, CS]) assert.equal(count(read(rel), SCAN_COPY), 1, `${rel}: the page says when a merge can be undone`);
    const cat = read('src/Tabs/settings/catalogue.js');
    for (const kind of ['accounts', 'contacts']) assert.equal(count(cat, `desc:'Scan ${kind} for likely duplicates and merge them — and undo a merge'`), 1, `Settings' ${kind} row`);
    assert.ok(files.length > 150 && files.includes(PM) && files.includes(MU), `src read, Past merges and mergeUndo.js among it: ${files.length} files`);
});

test('T14 — the suites: this file is graded by the harness', () => {
    // The SUITES value itself, never the whole harness: a comment there naming this file met the old pin (§0.204 review P1).
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/merge-undo.test.mjs'), 'SUITES runs this file');
});

// The walk the house check uses for nested components: every node with a type, keys that are not positions.
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

test("T15 — Past merges (Q1, Q2): each Undo confirmed in the app's confirm, never the red Delete; every Undo waits while one is out; a merge the server would refuse offers none and says why; its Undo busy while out and released after, its answer said on its row, the record named for its words, the list read again after it; both components at module scope (parsed and run); the confirm's words, the list's error, its \"No merges yet.\" only over a list it read, its more-line, \"Undoing…\", \"Undone <date>\" and each row's words drawn as written", async () => {
    const src = read(PM);
    const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
    const top = ast.program.body.map((s) => (s.type === 'ExportDefaultDeclaration' ? s.declaration : s)).filter((s) => s.type === 'FunctionDeclaration').map((s) => s.id.name);
    assert.deepEqual(top, ['PastMerges', 'PastMergeRow'], 'both components at module scope (CLAUDE.md: never inside a parent)');
    let nested = 0, confirm = null;
    const disabled = [];
    walk(ast.program, (node) => {
        if (node.type === 'FunctionDeclaration' && !top.includes(node.id?.name)) nested++;
        if (node.type === 'VariableDeclarator' && /^[A-Z]/.test(node.id?.name || '') && /Function/.test(node.init?.type || '')) nested++;
        if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'showConfirm') confirm = node;
        if (node.type === 'JSXAttribute' && node.name.name === 'disabled') disabled.push(src.slice(node.start, node.end));
    });
    assert.equal(nested, 0, 'no component declared inside another');
    assert.ok(confirm && confirm.arguments.length === 3 && confirm.arguments[2].type === 'BooleanLiteral' && confirm.arguments[2].value === false,
        'REGRESSION: its confirm is the red Delete dialog — showConfirm\'s third argument false (ModalLayer: "Delete" in red unless danger is false; App defaults danger = true)');
    const cb = confirm.arguments[1];
    const last = cb.body.body[cb.body.body.length - 1];
    assert.ok(cb.async && last.type === 'ExpressionStatement' && last.expression.type === 'CallExpression' && last.expression.callee.name === 'load',
        'REGRESSION: not read again after its own Undo — the row still offers it');
    assert.deepEqual(disabled, ['disabled={anyBusy}'], 'REGRESSION: its Undo is never disabled — two Undos out at once, the second answering 409');
    const CAN = ind(4, "const canUndo = m.status === 'merged' && !m.refusal;");
    once(src, CAN);
    const canUndo = (m) => run([CAN], ['m'], [m], 'canUndo');
    assert.deepEqual([{ status: 'merged', refusal: null }, { status: 'merged', refusal: '“Resinall, Inc.” was deleted after this merge, so the merge can no longer be undone.' }, { status: 'reversed', refusal: null }, { status: 'merged', refusal: '' }].map(canUndo),
        [true, false, false, true], 'REGRESSION: an Undo offered on a merge the server refuses');
    // its Undo, run as written (the review, 17 Oct): each statement of the confirm's callback, its free names stubbed
    const runUndo = async (answer) => {
        const calls = [];
        const fn = new Function('setBusyId', 'undoMerge', 'm', 'entityType', 'setSaid', 'load', `return (${src.slice(cb.start, cb.end)});`)(
            (v) => calls.push(['busy', v]), async (...a) => { calls.push(['undo', ...a]); return answer; },
            { id: 'mrg_1', archivedName: 'Resinall, Inc.', survivorName: 'Resinall' }, 'account',
            (f) => calls.push(['said', f({ mrg_0: 'an earlier row' })]), () => calls.push(['load']));
        await fn();
        return calls;
    };
    assert.deepEqual(await runUndo({ ok: false, words: 'Merge not undone — This merge has already been undone.' }), [
        ['busy', 'mrg_1'], ['undo', 'mrg_1', 'account', 'Resinall, Inc.'], ['busy', null],
        ['said', { mrg_0: 'an earlier row', mrg_1: 'Merge not undone — This merge has already been undone.' }], ['load'],
    ], 'REGRESSION: after its first Undo every Undo stays disabled (busy never released), a refused or lost Undo says nothing under its row, or the record goes unnamed for its words');
    assert.deepEqual((await runUndo({ ok: false, words: null })).map((c) => c[0]), ['busy', 'undo', 'busy', 'load'], 'an answer after an org switch: no words said');
    once(src, ind(4, "const { findMerges, undoMerge, showConfirm } = useApp();"));
    once(src, ind(8, "catch (e) { if (gen === loadGen.current) setError(`Past merges did not load — ${e?.message || 'No answer from the server.'}`); }"), 'amend 63: never the browser\'s words');
    once(src, ind(4, 'useEffect(() => { load(); }, [load, version]);'), 'read again on the scan\'s key');
    once(src, ind(16, '<PastMergeRow key={m.id} m={m} busy={busyId === m.id} anyBusy={!!busyId} said={said[m.id]} onUndo={onUndo} />'));
    once(src, ind(12, "{m.status === 'merged' && m.refusal && <div style={{ fontSize: 12, color: T.inkMid, marginTop: 6 }}>{m.refusal}</div>}"), 'why it has none');
    once(src, "import { undoConfirmWords } from '../utils/mergeUndo.js';");
    // What the list and each row draw (the re-check, 17 Oct): each line its file's only one, as written
    once(src, ind(4, 'const onUndo = (m) => showConfirm(undoConfirmWords(m), async () => {'), 'REGRESSION: its confirm without the approved words (Q8)');
    once(src, ind(12, '{error && ('), 'REGRESSION: a list that did not load says nothing — no red box');
    once(src, ind(12, '{data && merges.length === 0 && ('), 'REGRESSION: "No merges yet." on every first paint before the list loads, and under the red box when the first load fails');
    once(src, ind(12, '{data?.more && ('), 'REGRESSION: a list cut at the latest fifty says nothing of the rest');
    once(src, ind(24, "{busy ? 'Undoing…' : 'Undo'}"), 'REGRESSION: its Undo never says "Undoing…" while out');
    once(src, ind(16, "{m.status === 'reversed' && <span style={{ fontSize: 12, color: T.inkMid }}>Undone {when(m.reversedAt)}</span>}"), 'REGRESSION: an undone merge says nothing of why it has no Undo (Q1)');
    once(src, ind(12, '{said && <div style={{ fontSize: 12, color: T.inkMid, marginTop: 6 }}>{said}</div>}'), 'REGRESSION: an Undo\'s words, set on its row, never shown there');
});

// The five lists a merge or its Undo moves: [file, loader, the list's key, its setter]
const LOADS = [
    ['src/hooks/useAccounts.js', 'loadAccounts', 'accounts', 'setAccounts'],
    ['src/hooks/useContacts.js', 'loadContacts', 'contacts', 'setContacts'],
    ['src/hooks/useTasks.js', 'loadTasks', 'tasks', 'setTasks'],
    ['src/hooks/useActivities.js', 'loadActivities', 'activities', 'setActivities'],
    ['src/hooks/useOpportunities.js', 'loadOpportunities', 'opportunities', 'setOpportunities'],
];

test("T16 — each of the five loads drops an answer a later load overtook (amend 16, C4): a merge's reload landing after its Undo's put the merge back on screen, and the next whole-row save sent it — each loader's lines run as written: two loads, the second answered first, only the second's list set; an answer for an org switched away from still dropped", async () => {
    for (const [rel, loader, list, setter] of LOADS) {
        const t = code(read(rel));
        const END = `.catch(err => console.error('Failed to load ${list}:', err));\n    };\n`;
        const body = between(t, ind(4, 'const loadGen = useRef(0);\n'), END);
        order(body,
            ind(4, 'const loadGen = useRef(0);'),
            ind(4, `const ${loader} = (setDbOffline) => {`),
            ind(8, 'const gen = ++loadGen.current;'),
            ind(8, `dbFetch('/.netlify/functions/${list}')`),
            ind(12, '.then(data => (gen === loadGen.current ? data : null))   // a later load overtook it'));
        assert.equal(count(t, '.then(data => (gen === loadGen.current ? data : null))'), 1, rel);
        let org = 'org_a';
        const pending = [], sets = [];
        const loadFn = run([body], ['useRef', 'requestOrg', 'stillOrg', 'dbFetch', 'dbStatusOf', setter, 'deps'], [
            (v) => ({ current: v }), () => org, (o) => !!o && o === org, () => new Promise((res) => pending.push(res)), () => null,
            (rows) => sets.push(rows.map((r) => r.id)), { getQuarter: () => 1, getQuarterLabel: () => 'Q1 2026' },
        ], loader);
        const answered = (id) => ({ ok: true, status: 200, json: async () => ({ [list]: [{ id }] }) });
        const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };
        loadFn(() => {}); loadFn(() => {});
        pending[1](answered('second')); await settle();
        pending[0](answered('first')); await settle();
        assert.deepEqual(sets, [['second']], `REGRESSION: ${loader} — an answer a later load overtook lands after it`);
        sets.length = 0; pending.length = 0;
        loadFn(() => {}); org = 'org_b'; pending[0](answered('a')); await settle();
        assert.deepEqual(sets, [], `${loader}: an answer for an org switched away from dropped (§0.173)`);
        pending.length = 0;
        loadFn(() => {}); pending[0](answered('b')); await settle();
        assert.deepEqual(sets, [['b']], `${loader}: one load sets its list`);
    }
});

// ── the review (17 Oct, b13/wf-reviews.json): T17-T20 ─────────────────────────────────────────────────────────────
// H6 (P7's shape): "P7 Plant" (top) merged into its own site "P7 Dock" — the merge lifted the Dock to the top, an
// account, and moved the Plant's other sub-account, "P7 Unit", under it.
const H6P = { id: 'mrg_7', entityType: 'account', status: 'merged', survivorId: 'acc_dock', archivedId: 'acc_plant', survivorName: 'P7 Dock', archivedName: 'P7 Plant', resolvedFields: {},
    survivorSnapshot: { id: 'acc_dock', name: 'P7 Dock', parentAccountId: 'acc_plant', accountTier: 'site' },
    archivedSnapshot: { id: 'acc_plant', name: 'P7 Plant', parentAccountId: null, accountTier: 'account' },
    rewrites: [{ table: 'accounts', column: 'parentAccountId', kind: 'id', ids: ['acc_dock', 'acc_unit'], oldValue: 'acc_plant', newValue: 'acc_dock' }] };
const DOCK = { id: 'acc_dock', name: 'P7 Dock', parentAccountId: null, accountTier: 'account' };   // as the merge left it
const PLANT = { id: 'acc_plant', name: 'P7 Plant', parentAccountId: null, accountTier: 'account', mergeArchived: true };
const UNIT = { id: 'acc_unit', name: 'P7 Unit', parentAccountId: 'acc_dock', accountTier: 'business_unit' };
// the org's accounts as read: each row named by id replaced, the rest added
const treeWith = (...rows) => {
    const base = [PLANT, DOCK, UNIT].map((a) => rows.find((r) => r.id === a.id) || a);
    return [...base, ...rows.filter((r) => !base.some((a) => a.id === r.id))];
};

test("T17 — undoPlaces, the house parent rule on an account merge's Undo (the review, 17 Oct; accountParent.js restorePlace — D3 \"No self, no loops, no sites\", D21): what goes back under the record merged away goes back only where a delete's Undo would put it back, and under a record merged away at another tier than the merge found it at only what ranks above it — under one as found, a row at its own tier at the merge as it stood, one whose tier changed since only where it ranks above it (the re-check) — a loop, an account under a site, an account under the survivor that would not rank below the tier it gets back stays where it stands, kept and counted (Q3: \"Keep later edits\"); the lift's parent and tier together; the record merged away read live", async () => {
    const U = await mergeUndo();
    const placed = (tree, current = DOCK) => U.undoPlaces(H6P, tree, U.survivorRestore('account', H6P, current), []);
    const AT_PLANT = { parentAccountId: null, accountTier: 'account' };
    assert.deepEqual(placed(treeWith()), { set: { parentAccountId: 'acc_plant', accountTier: 'site' }, keptFields: [], subs: ['acc_unit'], under: AT_PLANT, held: [] },
        'REGRESSION: nothing changed since, yet something kept — the record merged away read as merged, or a sub-account the merge moved left under the survivor');
    // S1: a business unit added under the Dock since — the Dock stays a top-level account; the Unit still goes back
    const added = { id: 'acc_new', name: 'P7 Sub Unit', parentAccountId: 'acc_dock', accountTier: 'business_unit' };
    assert.deepEqual(placed(treeWith(added)), { set: {}, keptFields: ['parentAccountId', 'accountTier'], subs: ['acc_unit'], under: AT_PLANT, held: [] },
        'REGRESSION (S1): the Dock\'s place left to go back as a site over an account added under it since — at the server its own ask (nothingUnder) then stops the Dock\'s whole restore, every field kept and counted; with nothing under it, put back under a record merged away made a site since (a site under a site)');
    // S0a: the Plant moved under the Dock since (a business unit there) — the Dock under it closes a loop: kept; the
    // Unit, a business unit, ranks no higher than the Plant now: kept under the Dock too
    const plantUnderDock = { ...PLANT, parentAccountId: 'acc_dock', accountTier: 'business_unit' };
    assert.deepEqual(placed(treeWith(plantUnderDock)), { set: {}, keptFields: ['parentAccountId', 'accountTier'], subs: [], under: null, held: [] },
        'REGRESSION (S0a): the Dock\'s place left to go back under the Plant moved under it since — at the server its own ask (nothingUnder) stops the Dock\'s whole restore, every field kept; where the merge lifted no tier (a record merged away stored as an account under another), a loop — or the Unit put back under the Plant, a business unit under a business unit');
    // ... a site of the Plant's goes back under it there: it ranks above a business unit
    const siteLog = { ...H6P, rewrites: [{ ...H6P.rewrites[0], ids: ['acc_dock', 'acc_gate'] }] };
    const gate = { id: 'acc_gate', name: 'P7 Gate', parentAccountId: 'acc_dock', accountTier: 'site' };
    const plantMoved = U.undoPlaces(siteLog, [plantUnderDock, DOCK, gate], U.survivorRestore('account', siteLog, DOCK), []);
    assert.deepEqual([plantMoved.subs, plantMoved.under], [['acc_gate'], { parentAccountId: 'acc_dock', accountTier: 'business_unit' }], 'a site under a business unit: back');
    // S0c: the Plant made a site since (moved under a business unit) — nothing goes back under a site
    const plantASite = { ...PLANT, parentAccountId: 'acc_bu', accountTier: 'site' };
    const bu = { id: 'acc_bu', name: 'BU', parentAccountId: 'acc_top', accountTier: 'business_unit' }, top = { id: 'acc_top', name: 'Top', parentAccountId: null, accountTier: 'account' };
    assert.deepEqual(placed(treeWith(plantASite, bu, top)), { set: {}, keptFields: ['parentAccountId', 'accountTier'], subs: [], under: null, held: [] },
        'REGRESSION (S0c): the survivor and a sub-account put back under the record merged away, made a site since');
    // each refusal can refuse another: the Plant moved under another account (a business unit now) keeps the Unit (a
    // business unit) under the Dock — and the Unit kept there keeps the Dock from going back as a site
    const plantUnderTop = { ...PLANT, parentAccountId: 'acc_top', accountTier: 'business_unit' };
    assert.deepEqual(placed(treeWith(plantUnderTop, top)), { set: {}, keptFields: ['parentAccountId', 'accountTier'], subs: [], under: null, held: [] },
        'REGRESSION: the rule asked once — the Dock\'s place left to go back as a site over the Unit the rule kept under it: at the server its own ask (nothingUnder) stops the Dock\'s whole restore, every field kept and counted');
    // a sub-account the merge moved that was moved since: not the rule's (its restore keeps it), never put back
    assert.deepEqual(placed(treeWith({ ...UNIT, parentAccountId: 'acc_top' }, top)).subs, [], 'REGRESSION: a sub-account moved since put back by the rule');
    // the lift's parent and tier together: the tier edited since (a restore, a CSV) keeps the parent with it — the tree
    // read as the Undo reads it, the Dock at its edited tier (the re-check, 17 Oct: a tree at the merge's tier left the
    // rank rule to refuse it, hiding this one)
    const dockAsUnit = { ...DOCK, accountTier: 'business_unit' };
    assert.deepEqual(placed(treeWith(dockAsUnit), dockAsUnit), { set: {}, keptFields: ['accountTier', 'parentAccountId'], subs: ['acc_unit'], under: AT_PLANT, held: [] },
        "REGRESSION: the lift's parent put back without its tier — the Dock, edited to a business unit since, put back under the Plant at that tier");
    // ... and the parent edited since (moved under another account) keeps the tier with it
    const other = { id: 'acc_other', name: 'P7 Other', parentAccountId: null, accountTier: 'account' };
    const dockMoved = { ...DOCK, parentAccountId: 'acc_other' };
    assert.deepEqual(placed(treeWith(dockMoved, other), dockMoved), { set: {}, keptFields: ['parentAccountId', 'accountTier'], subs: ['acc_unit'], under: AT_PLANT, held: [] },
        "REGRESSION: the lift's tier put back without its parent — the Dock, moved under another account since, made a site there, the deals it took left on a site");
    // no accounts read: nothing goes back under the record merged away; a merge with no lift and no sub-account: as survivorRestore
    assert.deepEqual(U.undoPlaces(H6P, undefined, U.survivorRestore('account', H6P, DOCK)), { set: {}, keptFields: ['parentAccountId', 'accountTier'], subs: [], under: null, held: [] }, 'no accounts read: nothing put back under it');
    const plain = U.survivorRestore('account', ALOG, AS_MERGED);
    assert.deepEqual(U.undoPlaces(ALOG, [], plain, []), { ...plain, subs: [], under: null, held: [] }, 'no lift, no sub-account: the survivor\'s fields as survivorRestore puts them');

    // A row whose own tier changed since the merge (the re-check, 17 Oct). R1: "R1 Unit", a business unit under "R1 Top",
    // merged into the top-level "R1 Other" — its site "R1 Site" moved under the survivor, logged a site (tiers); since,
    // moved to the top and back under the survivor, a business unit now: under the business unit merged away it would
    // rank no higher, so it stays, kept; at its tier at the merge it goes back
    const R1 = { id: 'mrg_r1', entityType: 'account', status: 'merged', survivorId: 'acc_r1y', archivedId: 'acc_r1x', survivorName: 'R1 Other', archivedName: 'R1 Unit', resolvedFields: {},
        survivorSnapshot: { id: 'acc_r1y', name: 'R1 Other', parentAccountId: null, accountTier: 'account' },
        archivedSnapshot: { id: 'acc_r1x', name: 'R1 Unit', parentAccountId: 'acc_r1p', accountTier: 'business_unit' },
        rewrites: [{ table: 'accounts', column: 'parentAccountId', kind: 'id', ids: ['acc_r1c'], oldValue: 'acc_r1x', newValue: 'acc_r1y', tiers: { acc_r1c: 'site' } }] };
    const r1 = (cTier, log = R1) => {
        const other = { id: 'acc_r1y', name: 'R1 Other', parentAccountId: null, accountTier: 'account' };
        const tree = [{ id: 'acc_r1p', name: 'R1 Top', parentAccountId: null, accountTier: 'account' },
            { id: 'acc_r1x', name: 'R1 Unit', parentAccountId: 'acc_r1p', accountTier: 'business_unit', mergeArchived: true },
            other, { id: 'acc_r1c', name: 'R1 Site', parentAccountId: 'acc_r1y', accountTier: cTier }];
        return U.undoPlaces(log, tree, U.survivorRestore('account', log, other), []);
    };
    assert.deepEqual(r1('site'), { set: {}, keptFields: [], subs: ['acc_r1c'], under: { parentAccountId: 'acc_r1p', accountTier: 'business_unit' }, held: [] }, 'at its tier at the merge: back');
    assert.deepEqual(r1('business_unit'), { set: {}, keptFields: [], subs: [], under: null, held: [] },
        'REGRESSION: under a record merged away as the merge found it, a row whose own tier changed since goes back whatever its rank — a business unit under a business unit, and nothing said kept');
    // a legacy shape as stored at the merge — a business unit under the business unit — goes back as it stood; a log
    // written before this batch names no tier, so it must rank above it: kept under the survivor (listed back)
    const legacy = { ...R1, rewrites: [{ ...R1.rewrites[0], tiers: { acc_r1c: 'business_unit' } }] };
    assert.deepEqual(r1('business_unit', legacy).subs, ['acc_r1c'], "REGRESSION: a legacy shape as stored at the merge kept under the survivor — its tier at the merge not read");
    const { tiers: _r1Tiers, ...r1Untiered } = R1.rewrites[0];
    assert.deepEqual(r1('business_unit', { ...R1, rewrites: [r1Untiered] }).subs, [], 'a log with no tiers: under the record merged away by rank alone');
    assert.deepEqual(r1('site', { ...R1, rewrites: [r1Untiered] }).subs, ['acc_r1c'], '... a site ranks above a business unit');
    // R2 (H6 under a parent): "R2 Unit", a business unit under "R2 Top", merged into its own site "R2 Dock" — the Dock
    // lifted under the Top, still a site; since, moved to the top and back under the Top, a business unit now: under the
    // Unit it would be a business unit under a business unit — its place kept, and said; at its tier, it goes back
    const R2 = { id: 'mrg_r2', entityType: 'account', status: 'merged', survivorId: 'acc_r2y', archivedId: 'acc_r2x', survivorName: 'R2 Dock', archivedName: 'R2 Unit', resolvedFields: {},
        survivorSnapshot: { id: 'acc_r2y', name: 'R2 Dock', parentAccountId: 'acc_r2x', accountTier: 'site' },
        archivedSnapshot: { id: 'acc_r2x', name: 'R2 Unit', parentAccountId: 'acc_r2p', accountTier: 'business_unit' },
        rewrites: [{ table: 'accounts', column: 'parentAccountId', kind: 'id', ids: ['acc_r2y'], oldValue: 'acc_r2x', newValue: 'acc_r2y', tiers: { acc_r2y: 'site' } }] };
    const r2 = (yTier, log = R2) => {
        const dock = { id: 'acc_r2y', name: 'R2 Dock', parentAccountId: 'acc_r2p', accountTier: yTier };
        const tree = [{ id: 'acc_r2p', name: 'R2 Top', parentAccountId: null, accountTier: 'account' },
            { id: 'acc_r2x', name: 'R2 Unit', parentAccountId: 'acc_r2p', accountTier: 'business_unit', mergeArchived: true }, dock];
        return U.undoPlaces(log, tree, U.survivorRestore('account', log, dock), []);
    };
    assert.deepEqual(r2('site'), { set: { parentAccountId: 'acc_r2x' }, keptFields: [], subs: [], under: { parentAccountId: 'acc_r2p', accountTier: 'business_unit' }, held: [] }, 'at its tier: back under the Unit');
    assert.deepEqual(r2('business_unit'), { set: {}, keptFields: ['parentAccountId'], subs: [], under: null, held: [] },
        'REGRESSION: the survivor, its own tier changed since, put back under the record merged away as found whatever its rank — a business unit under a business unit, and nothing said kept');
    // the survivor's tier at the merge is its snapshot's, logged or not: a legacy business unit under the Unit, as
    // stored, goes back on a log with no tiers
    const { tiers: _r2Tiers, ...r2Untiered } = R2.rewrites[0];
    const legacyDock = { ...R2, survivorSnapshot: { ...R2.survivorSnapshot, accountTier: 'business_unit' }, rewrites: [r2Untiered] };
    assert.deepEqual(r2('business_unit', legacyDock).set, { parentAccountId: 'acc_r2x' },
        "REGRESSION: the survivor's tier at the merge read from the log's tiers alone — a legacy shape as stored, on a log with none, kept where the merge left it");
});

test('T18 — survivorRowsOf: of the deals or contacts an account merge renamed by name, those that stood on the survivor by id (on — merge.mjs reads them last, so one still there under its name is no change kept: UKG\'s "Shell - Port Allen" twins, a deal moved before §0.198, a contact of the survivor\'s under the other\'s name), and those the merge never left on the survivor (since — a deal it moved up, a row by name alone: the survivor\'s name cascade takes their name without putting them back); the merge logs which stood on the survivor (onSurvivor) — on a log written before this batch, every renamed row neither the id rewrite nor the lift names, and the deals moved up (the review and the re-check, 17 Oct)', async () => {
    const U = await mergeUndo();
    // a log written before this batch: no onSurvivor
    const old = { rewrites: [
        { table: 'opportunities', column: 'accountId', kind: 'id', ids: ['d_x'], oldValue: 'acc_x', newValue: 'acc_y' },
        { table: 'opportunities', column: 'account', kind: 'name', ids: ['d_x', 'd_twin', 'd_none'], oldValue: 'Shell - Port Allen', newValue: 'Shell - Port Allen' },
        { table: 'opportunities', column: 'account', kind: 'name', ids: ['d_twin', 'd_y_old'], oldValue: 'Shell', newValue: 'Shell - Port Allen' },
        { table: 'opportunities', column: 'accountId', kind: 'lift', ids: ['d_up'], rows: [] },
        { table: 'opportunities', column: 'account', kind: 'name', ids: ['d_up'], oldValue: 'Shell - Port Allen', newValue: 'Shell - Port Allen' },
        { table: 'contacts', column: 'company', kind: 'name', ids: ['c_1', 'c_2'], oldValue: 'Shell - Port Allen', newValue: 'Shell - Port Allen' },
    ] };
    assert.deepEqual(U.survivorRowsOf(old, 'opportunities'), { on: ['d_twin', 'd_none', 'd_y_old'], since: ['d_up'] },
        'REGRESSION: on a log written before this batch, a deal a merge into a site moved up by its name alone, moved since onto the survivor, read again as put back — counted as no change');
    assert.deepEqual(U.survivorRowsOf(old, 'contacts'), { on: ['c_1', 'c_2'], since: [] }, 'its contacts: every one renamed, read last (a log that cannot tell)');
    // the same merge as logged now: which stood on the survivor by id
    const stood = ['d_twin', 'd_y_old', 'c_2'];
    const logged = { rewrites: old.rewrites.map((rw) => (rw.kind === 'name' ? { ...rw, onSurvivor: rw.ids.filter((id) => stood.includes(id)) } : rw)) };
    assert.deepEqual(U.survivorRowsOf(logged, 'opportunities'), { on: ['d_twin', 'd_y_old'], since: ['d_up', 'd_none'] },
        'REGRESSION: a deal by name alone linked to the survivor since read again as put back — counted as no change, as on a log that cannot tell');
    assert.deepEqual(U.survivorRowsOf(logged, 'contacts'), { on: ['c_2'], since: ['c_1'] },
        'REGRESSION: a contact by name alone linked to the survivor since read again as put back — counted as no change');
    assert.deepEqual(U.survivorRowsOf({}, 'opportunities'), { on: [], since: [] }, 'no rewrites: none');
});

const MRM = 'src/components/modals/MergeReviewModal.jsx', CMRM = 'src/components/modals/ContactMergeReviewModal.jsx';

test("T19 — the merge windows: the default survivor is set when a window opens on a pair, never again while it stays open (the review, 17 Oct): a merge's lost answer reads the lists again (Q7), and counts read after a merge that landed swapped the two records — the record merged away offered as the survivor — and cleared the words that say the merge may have been made; a card picked stays picked", () => {
    for (const [rel, a, b] of [[MRM, 'accA', 'accB'], [CMRM, 'cA', 'cB']]) {
        const s = code(read(rel));
        once(s, "import React, { useState, useMemo, useEffect, useRef } from 'react';");
        const LINES = [
            ind(8, `const pair = ${a} && ${b} ? \`\${${a}.id}|\${${b}.id}\` : null;`),
            ind(8, 'if (pair === openedOn.current) return;'),
            ind(8, 'openedOn.current = pair;'),
            ind(8, 'if (pair) setSurvivorId(defaultSurvivorId);'),
        ];
        order(s, ind(4, 'const openedOn = useRef(null);'), ind(4, 'useEffect(() => {'), ...LINES, ind(4, `}, [${a}, ${b}, defaultSurvivorId]);`),
            ind(4, 'useEffect(() => { setChoices({}); setMergeError?.(null); }, [survivorId, aId, bId, setMergeError]);'));
        assert.ok(!s.includes('useEffect(() => { setSurvivorId(defaultSurvivorId); }, [defaultSurvivorId]);'), `${rel}: the default set again whenever the lists change`);
        // run as written: open, the lists read again, closed, opened again
        const openedOn = { current: null }, picks = [];
        const effect = (A, B, def) => new Function(a, b, 'openedOn', 'setSurvivorId', 'defaultSurvivorId', LINES.join('\n'))(A, B, openedOn, (v) => picks.push(v), def);
        const X = { id: 'x' }, Y = { id: 'y' };
        effect(X, Y, 'x');                   // opens on the pair: its default
        effect({ ...X }, { ...Y }, 'y');     // the lists read again after a lost answer: the counts now favour the other
        effect(null, null, undefined);       // closed
        effect(X, Y, 'y');                   // opened again: its default as it now stands
        assert.deepEqual(picks, ['x', 'y'], `REGRESSION: ${rel} — the lists read again while the window stays open swap the survivor, which clears the window's words`);
    }
});

// A useCallback's function, as written in a component: its source, by the name it is held under.
const callbackOf = (src, name) => {
    let found = null;
    walk(parse(src, { sourceType: 'module', plugins: ['jsx'] }).program, (node) => {
        if (node.type === 'VariableDeclarator' && node.id?.name === name && node.init?.type === 'CallExpression' && node.init.callee.name === 'useCallback') found = node.init.arguments[0];
    });
    assert.ok(found, `${name}: a useCallback`);
    return src.slice(found.start, found.end);
};

test("T20 — Past merges' list and both scans drop an answer a later load overtook (the review, 17 Oct — as the five list loads do, T16): a merge's reload landing after its Undo's listed the merge as standing, its Undo offered, and left out of the scan the pair the Undo gave back — each function's lines run as written: two loads, the second answered first, only the second's answer set; an overtaken one's error never said", async () => {
    const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };
    // Past merges' load
    {
        const pending = [], sets = [], errors = [];
        const load = new Function('loadGen', 'fmRef', 'entityType', 'setData', 'setError', `return (${callbackOf(read(PM), 'load')});`)(
            { current: 0 }, { current: () => new Promise((res, rej) => pending.push({ res, rej })) }, 'account', (d) => sets.push(d), (e) => errors.push(e));
        load(); load();
        pending[1].res('second'); await settle();
        pending[0].res('first'); await settle();
        assert.deepEqual(sets, ['second'], 'REGRESSION: Past merges — an answer a later load overtook lands after it: the merge listed standing, its Undo offered');
        sets.length = 0; errors.length = 0; pending.length = 0;
        load(); load();
        pending[1].res('second'); await settle();
        pending[0].rej(new Error('No answer from the server.')); await settle();
        assert.deepEqual([sets, errors.filter(Boolean)], [['second'], []], "an overtaken load's error is not said");
    }
    // each scan's runScan
    for (const rel of [DS, CS]) {
        const pending = [], sets = [], loading = [], errors = [];
        const runScan = new Function('scanGen', 'fdRef', 'setLoading', 'setError', 'setData', `return (${callbackOf(read(rel), 'runScan')});`)(
            { current: 0 }, { current: () => new Promise((res, rej) => pending.push({ res, rej })) }, (v) => loading.push(v), (e) => errors.push(e), (d) => sets.push(d));
        runScan('duplicate'); runScan('duplicate');
        pending[1].res('second'); await settle();
        pending[0].res('first'); await settle();
        assert.deepEqual(sets, ['second'], `REGRESSION: ${rel} — a scan a later one overtook lands after it: the pair an Undo gave back left out`);
        assert.deepEqual(loading, [true, true, false], `${rel}: "Scanning…" until the latest scan answers`);
        // an overtaken scan that fails after the latest answered (the re-check, 17 Oct): after a merge the scan's key moves
        // twice — the row dropped, then the lists read again — so two scans are out at once
        sets.length = 0; errors.length = 0; pending.length = 0;
        runScan('duplicate'); runScan('duplicate');
        pending[1].res('second'); await settle();
        pending[0].rej(new Error('No answer from the server.')); await settle();
        assert.deepEqual([sets, errors.filter(Boolean)], [['second'], []], `REGRESSION: ${rel} — an overtaken scan's error said over the latest pairs`);
    }
});

// ── Jeff's second set (18 Oct, b13/jeff-answers.md): T21 ──────────────────────────────────────────────────────────
test("T21 — undoPlaces never puts a deal on a site (Jeff, 18 Oct: \"Leave such deals and count them\" — the account keeps its current level, the deal stays where it is, and it is counted): a survivor that would go back a site — its lift reversed (H6), or a tier a merge was sent reversed — while a deal would still stand on it by id keeps its place, each such deal held (counted kept); the deals the deal id restore moves back to the record merged away leave it, but none while that is a site; deals not read, it never goes back a site; where the parent rule keeps it first, no deal is held; dealsByIdOf: the merge's id rewrite of deals, but those its lift moved up", async () => {
    const U = await mergeUndo();
    const AT_PLANT = { parentAccountId: null, accountTier: 'account' };
    // H6 (T17's): the Plant's deal d_x moved to the Dock by id; the Dock lifted to the top
    const H6D = { ...H6P, rewrites: [{ table: 'opportunities', column: 'accountId', kind: 'id', ids: ['d_x'], oldValue: 'acc_plant', newValue: 'acc_dock' }, ...H6P.rewrites] };
    const placed = (deals, tree = treeWith()) => U.undoPlaces(H6D, tree, U.survivorRestore('account', H6D, DOCK), deals);
    const BACK = { set: { parentAccountId: 'acc_plant', accountTier: 'site' }, keptFields: [], subs: ['acc_unit'], under: AT_PLANT, held: [] };
    assert.deepEqual(placed([]), BACK, 'no deal on the Dock: back under the Plant, a site again');
    assert.deepEqual(placed(['d_x']), BACK, "REGRESSION: the Plant's own deal, which the deal id restore moves back to it, read as staying on the Dock — the Dock kept an account for a deal that leaves it");
    assert.deepEqual(placed(['d_x', 'd_new']), { set: {}, keptFields: ['parentAccountId', 'accountTier'], subs: ['acc_unit'], under: AT_PLANT, held: ['d_new'] },
        'REGRESSION: a deal linked to the lifted Dock since left on it as it goes back a site — or not counted (held)');
    assert.deepEqual(placed(undefined), { set: {}, keptFields: ['parentAccountId', 'accountTier'], subs: ['acc_unit'], under: AT_PLANT, held: [] },
        "REGRESSION: the survivor's deals not read, yet it goes back a site — over deals nobody looked for");
    // the parent rule keeps the Dock first (the Plant made a site since): its deal is not the deal rule's — none held
    const plantASite = { ...PLANT, parentAccountId: 'acc_bu', accountTier: 'site' };
    const bu = { id: 'acc_bu', name: 'BU', parentAccountId: 'acc_top', accountTier: 'business_unit' }, top = { id: 'acc_top', name: 'Top', parentAccountId: null, accountTier: 'account' };
    assert.deepEqual(placed(['d_new'], treeWith(plantASite, bu, top)), { set: {}, keptFields: ['parentAccountId', 'accountTier'], subs: [], under: null, held: [] },
        "REGRESSION: where the parent rule keeps the survivor, its deals counted as the deal rule's too");

    // A tier a merge was sent reversed (the API takes accountTier; no screen sends it): "RT Dock", a site under "RT Top",
    // took the business-unit tier "RT Co" had; RT Co's deal d_rx moved to it by id
    const RT = { id: 'mrg_rt', entityType: 'account', status: 'merged', survivorId: 'acc_ry', archivedId: 'acc_rx', survivorName: 'RT Dock', archivedName: 'RT Co',
        resolvedFields: { accountTier: 'business_unit' },
        survivorSnapshot: { id: 'acc_ry', name: 'RT Dock', parentAccountId: 'acc_rp', accountTier: 'site' },
        archivedSnapshot: { id: 'acc_rx', name: 'RT Co', parentAccountId: null, accountTier: 'account' },
        rewrites: [{ table: 'opportunities', column: 'accountId', kind: 'id', ids: ['d_rx'], oldValue: 'acc_rx', newValue: 'acc_ry' }] };
    const rt = (deals, xRow) => {
        const dock = { id: 'acc_ry', name: 'RT Dock', parentAccountId: 'acc_rp', accountTier: 'business_unit' };
        const tree = [{ id: 'acc_rp', name: 'RT Top', parentAccountId: null, accountTier: 'account' }, dock, { id: 'acc_rbu', name: 'RT Unit', parentAccountId: 'acc_rp', accountTier: 'business_unit' },
            { id: 'acc_rx', name: 'RT Co', parentAccountId: null, accountTier: 'account', mergeArchived: true, ...xRow }];
        return U.undoPlaces(RT, tree, U.survivorRestore('account', RT, dock), deals);
    };
    assert.deepEqual(rt(['d_rx']), { set: { accountTier: 'site' }, keptFields: [], subs: [], under: null, held: [] }, "RT Co's deal goes back to it: the Dock a site again");
    assert.deepEqual(rt(['d_rx', 'd_ry']), { set: {}, keptFields: ['accountTier'], subs: [], under: null, held: ['d_ry'] },
        'REGRESSION: a tier a merge was sent reversed over the Dock\'s own deal — a site again with a deal on it');
    // RT Co made a site since: merge.mjs moves no deal back to it (notASite) — its deal stays on the Dock, which keeps its
    // level; that deal is counted by its own restore, never held
    const xSite = { parentAccountId: 'acc_rbu', accountTier: 'site' };
    assert.deepEqual(rt(['d_rx'], xSite), { set: {}, keptFields: ['accountTier'], subs: [], under: null, held: [] },
        'REGRESSION: the record merged away a site — its deal, which no restore moves back to a site, read as leaving the Dock: the Dock a site again with it — or held, counted twice over an Undo that moves it back after all');
    assert.deepEqual(rt(['d_rx', 'd_ry'], xSite).held, ['d_ry'], "the Dock's own deal held beside it");

    // dealsByIdOf: the merge's id rewrite of deals, but those its lift moved up (only the lift puts them back)
    assert.deepEqual(U.dealsByIdOf({ rewrites: [
        { table: 'opportunities', column: 'accountId', kind: 'id', ids: ['d1', 'd_up', 'd1'], oldValue: 'acc_x', newValue: 'acc_y' },
        { table: 'opportunities', column: 'account', kind: 'name', ids: ['d_n'], oldValue: 'X', newValue: 'Y' },
        { table: 'tasks', column: 'accountId', kind: 'id', ids: ['t1'], oldValue: 'acc_x', newValue: 'acc_y' },
        { table: 'opportunities', column: 'accountId', kind: 'lift', ids: ['d_up'], rows: [] },
    ] }), ['d1'], 'REGRESSION: a deal the lift moved up, or a task, or a deal renamed by name alone, read as one the deal id restore moves back');
    assert.deepEqual(U.dealsByIdOf({}), [], 'no rewrites: none');
});
