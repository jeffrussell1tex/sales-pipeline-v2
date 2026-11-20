// tests/stale-deletes.test.mjs
//
// §0.273 (OPEN_ITEMS §4.8, §0.271's found (2); Jeff, 19 Nov: "Stale-tab CRM deletes"): a stale second tab's Delete of an
// account, contact, deal, activity or task another tab or member deleted since said "not deleted" and put the row
// back — their DELETE 404s carried no code. Each now answers 404 `code: 'gone'` (no row of that id in this org), which
// landedBefore reads as landed; each screen takes the row off and says nothing, and keeps it out of this press's Undo
// (a re-POST would bring back what someone else deleted). The id is sent encoded (a reserved character would ask for
// another id and read a live row as gone). A row its own Undo is still re-POSTing is not deleted under it: said, and
// nothing sent (src/utils/restoring.js).
//
// RUN: each real handler, built from its source with the screen's state stubbed, answered as the server answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { heardRefusal, landedBefore, maybeSaid } from '../src/utils/refusalWords.js';
import { isRestoring, undoWhileOut, stillRestoringWords } from '../src/utils/restoring.js';
import { undoOfDeletes, withTiers, withRows, parentsFirst } from '../src/utils/accountParent.js';
import { isOpenDeal, activeDealsOf } from '../src/utils/contactDeals.js';
import { isMergeArchived } from '../src/utils/pickLink.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const between = (src, from, to) => { const a = src.indexOf(from); assert.ok(a >= 0, from); const b = src.indexOf(to, a + from.length); assert.ok(b > a, to); return src.slice(a, b); };
const turns = async (n = 6) => { for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r)); };

// As storage.js dbWrite answers (its rule, with the real readers): ok on a 2xx; else unknown unless a 4xx in words,
// landed on landedBefore.
const answerOf = (status, body = null) => (status >= 200 && status < 300
    ? { ok: true, status, error: null, data: body }
    : { ok: false, status, error: (body && body.error) || `The server returned ${status}.`, unknown: !heardRefusal(status, body), landed: landedBefore(status, body) });
const GONE = [404, { error: 'Not found', code: 'gone' }];
const NOT_FOUND = [404, { error: 'Not found' }];   // the same status with no code: still the server's own refusal

const state = (init) => { const s = { v: init }; s.set = (u) => { s.v = typeof u === 'function' ? u(s.v) : u; }; return s; };

// A handler's source → a function of the names it reads.
const build = (file, start, end, names) => {
    const fn = between(read(file), start, end).trim().replace(/;\s*$/, '');
    const body = fn.slice(fn.indexOf('=') + 1).trim();
    return (env) => new Function(...names, `return ${body};`)(...names.map((n) => env[n]));
};

// The screen around a handler: its confirm pressed at once, its toasts and Undo kept, its writes answered by `answers`
// (a URL's first match — a [status, body] pair or a promise of one).
const screen = (answers) => {
    const did = { sent: [], toasts: [], undo: null, confirms: [] };
    const env = {
        showConfirm: (msg, cb) => { did.confirms.push(msg); did.pending = cb(); },
        requestOrg: () => 'org_A', stillOrg: (o) => o === 'org_A',
        setUndoToast: (t) => { did.toasts.push(typeof t === 'function' ? t({}) : t); },
        softDelete: (label, now, restore) => { now(); did.undo = { label, restore }; },
        dbWrite: async (url, opts = {}) => {
            did.sent.push([opts.method || 'GET', url, opts.body ? JSON.parse(opts.body) : undefined]);
            const hit = answers.find(([m, re]) => m === (opts.method || 'GET') && re.test(url));
            const a = hit ? await hit[2] : [200, {}];
            return answerOf(a[0], a[1]);
        },
        maybeSaid, isRestoring, undoWhileOut, stillRestoringWords, deps: {}, showBlockedDelete: () => { did.blocked = true; },
        isOpenDeal, activeDealsOf, isMergeArchived, undoOfDeletes, withTiers, withRows, parentsFirst,
        adoptScores: () => {}, loadAccounts: () => { did.reread = (did.reread || 0) + 1; },
    };
    return { did, env };
};
const said = (did) => did.toasts.filter((t) => t && t.error).map((t) => t.error);
const deferred = () => { let resolve; const p = new Promise((r) => { resolve = r; }); return { p, resolve }; };

test('§0.273 restoring.js: an Undo marks its rows out until it ends, however it ends', async () => {
    const d = deferred();
    const run = undoWhileOut('task', ['t1', 't2'], async () => { await d.p; throw new Error('the POST threw'); });
    const out = run();
    assert.equal(isRestoring('task', 't1'), true);
    assert.equal(isRestoring('task', 't2'), true);
    assert.equal(isRestoring('activity', 't1'), false, 'by kind');
    d.resolve();
    await assert.rejects(out);
    assert.equal(isRestoring('task', 't1'), false, 'cleared after a throw');
    assert.equal(stillRestoringWords(['Call Acme']), 'Not deleted — "Call Acme" is still being restored by its Undo. Try again in a moment.');
    assert.equal(stillRestoringWords(['a', 'b']), 'Not deleted — 2 of them are still being restored by their Undo. Try again in a moment.');
});

test('§0.273 landedBefore: a delete\'s 404 gone is landed; the same 404 with no code is the server\'s refusal', () => {
    assert.equal(answerOf(...GONE).landed, true);
    assert.equal(answerOf(...GONE).unknown, false);
    assert.equal(answerOf(...NOT_FOUND).landed, false);
    assert.equal(answerOf(...NOT_FOUND).unknown, false);
});

// ── tasks ──
const TASK_NAMES = ['tasks', 'showConfirm', 'requestOrg', 'stillOrg', 'setTasks', 'dbWrite', 'setUndoToast', 'maybeSaid', 'softDelete', 'isRestoring', 'undoWhileOut', 'stillRestoringWords'];
const taskDelete = build('src/hooks/useTasks.js', 'const handleDeleteTask = (taskId, opts = {}) => {', '\n    // No calendar event', TASK_NAMES);
const runTask = async (answers, id = 'id_t1') => {
    const s = screen(answers);
    const tasks = state([{ id, title: 'Call Acme' }, { id: 'id_t2', title: 'Other' }]);
    const del = taskDelete({ ...s.env, tasks: tasks.v, setTasks: tasks.set });
    return { ...s, tasks, del };
};

test('§0.273 RUN tasks: a task gone already is off, nothing said, no Undo; the same 404 with no code put back and said', async () => {
    let r = await runTask([['DELETE', /tasks\?id=/, GONE]]);
    r.del('id_t1'); await r.did.pending;
    assert.deepEqual(r.tasks.v.map((t) => t.id), ['id_t2'], 'off');
    assert.deepEqual(said(r.did), [], 'nothing said');
    assert.equal(r.did.undo, null, 'no Undo — it deleted nothing; a re-POST would bring back what another deleted');
    r = await runTask([['DELETE', /tasks\?id=/, NOT_FOUND]]);
    r.del('id_t1'); await r.did.pending;
    assert.deepEqual(r.tasks.v.map((t) => t.id).sort(), ['id_t1', 'id_t2'], 'put back');
    assert.deepEqual(said(r.did), ['Task not deleted — Not found']);
});

test('§0.273 RUN tasks: the id sent encoded; a Delete while its own Undo is out sends nothing and says so', async () => {
    let r = await runTask([], 'id_a&b#c');
    r.del('id_a&b#c'); await r.did.pending;
    assert.equal(r.did.sent[0][1], '/.netlify/functions/tasks?id=id_a%26b%23c');
    const post = deferred();
    r = await runTask([['POST', /tasks$/, post.p]]);
    r.del('id_t1'); await r.did.pending;
    assert.ok(r.did.undo, 'a delete that landed offers Undo');
    const undoing = r.did.undo.restore();
    await turns();
    assert.ok(r.tasks.v.some((t) => t.id === 'id_t1'), 'the Undo puts it back before its POST answers');
    const before = r.did.sent.length;
    r.did.undo = null;
    r.del('id_t1'); await r.did.pending;
    assert.equal(r.did.sent.length, before, 'no DELETE sent under its own Undo');
    assert.deepEqual(said(r.did).slice(-1), ['Not deleted — "Call Acme" is still being restored by its Undo. Try again in a moment.']);
    assert.ok(r.tasks.v.some((t) => t.id === 'id_t1'), 'and the row stays');
    post.resolve([201, {}]); await undoing;
    r.del('id_t1'); await r.did.pending;
    assert.equal(r.did.sent.length, before + 1, 'once the Undo ends, Delete sends again');
});

// ── activities ──
const ACT_NAMES = ['activities', 'showConfirm', 'requestOrg', 'stillOrg', 'setActivities', 'dbWrite', 'setUndoToast', 'maybeSaid', 'adoptScores', 'softDelete', 'isRestoring', 'undoWhileOut', 'stillRestoringWords'];
const actDelete = build('src/hooks/useActivities.js', 'const handleDeleteActivity = (activityId) => {', '\n    // A deal\'s History tab logs an activity here', ACT_NAMES);
const runAct = async (answers, id = 'id_a1') => {
    const s = screen(answers);
    const acts = state([{ id, type: 'Call' }, { id: 'id_a2', type: 'Email' }]);
    const del = actDelete({ ...s.env, activities: acts.v, setActivities: acts.set });
    return { ...s, acts, del };
};

test('§0.273 RUN activities: gone is off, nothing said, no Undo; no code put back and said; encoded; not under its own Undo', async () => {
    let r = await runAct([['DELETE', /activities\?id=/, GONE]]);
    r.del('id_a1'); await r.did.pending;
    assert.deepEqual(r.acts.v.map((a) => a.id), ['id_a2']);
    assert.deepEqual(said(r.did), []);
    assert.equal(r.did.undo, null);
    r = await runAct([['DELETE', /activities\?id=/, NOT_FOUND]]);
    r.del('id_a1'); await r.did.pending;
    assert.ok(r.acts.v.some((a) => a.id === 'id_a1'), 'put back');
    assert.deepEqual(said(r.did), ['Activity not deleted — Not found']);
    r = await runAct([], 'id_+ %');
    r.del('id_+ %'); await r.did.pending;
    assert.equal(r.did.sent[0][1], '/.netlify/functions/activities?id=id_%2B%20%25');
    const post = deferred();
    r = await runAct([['POST', /activities$/, post.p]]);
    r.del('id_a1'); await r.did.pending;
    const undoing = r.did.undo.restore();
    await turns();
    const before = r.did.sent.length;
    r.del('id_a1'); await r.did.pending;
    assert.equal(r.did.sent.length, before, 'nothing sent under its own Undo');
    assert.deepEqual(said(r.did).slice(-1), ['Not deleted — "Call" is still being restored by its Undo. Try again in a moment.']);
    post.resolve([201, {}]); await undoing;
});

// ── deals (no Undo) ──
const DEAL_NAMES = ['opportunities', 'showConfirm', 'requestOrg', 'stillOrg', 'setOpportunities', 'dbWrite', 'setUndoToast', 'maybeSaid'];
const dealDelete = build('src/hooks/useOpportunities.js', 'const handleDeleteDeals = (ids, opts = {}) => {', '\n    const handleSave = (', DEAL_NAMES);
const runDeals = (answers) => {
    const s = screen(answers);
    const deals = state([{ id: 'd1', opportunityName: 'One' }, { id: 'd2', opportunityName: 'Two' }, { id: 'd&3', opportunityName: 'Three' }]);
    const del = dealDelete({ ...s.env, opportunities: deals.v, setOpportunities: deals.set });
    return { ...s, deals, del };
};

test('§0.273 RUN deals: one gone is off and unsaid; one refused with no code put back and said; ids encoded', async () => {
    const r = runDeals([['DELETE', /id=d1$/, GONE], ['DELETE', /id=d2$/, NOT_FOUND]]);
    r.del(['d1', 'd2', 'd&3']); await r.did.pending;
    assert.deepEqual(r.deals.v.map((d) => d.id), ['d2'], 'the gone one and the deleted one off; the refused one back');
    assert.deepEqual(said(r.did), ['1 of 3 deals not deleted — Not found'], 'only the refusal said');
    assert.equal(r.did.sent[2][1], '/.netlify/functions/opportunities?id=d%263');
    const g = runDeals([['DELETE', /id=/, GONE]]);
    g.del(['d1']); await g.did.pending;
    assert.deepEqual(said(g.did), [], 'a deal gone already: nothing said');
});

// ── contacts ──
const CONTACT_NAMES = ['contacts', 'deps', 'activeDealsOf', 'showBlockedDelete', 'showConfirm', 'requestOrg', 'stillOrg', 'setContacts', 'dbWrite', 'setUndoToast', 'maybeSaid', 'softDelete', 'isRestoring', 'undoWhileOut', 'stillRestoringWords'];
const contactDelete = build('src/hooks/useContacts.js', 'const handleDeleteContacts = (ids, opts = {}) => {', '\n    const handleSaveContact = async', CONTACT_NAMES);
const runContacts = (answers) => {
    const s = screen(answers);
    const contacts = state([{ id: 'c1', firstName: 'Ann' }, { id: 'c2', firstName: 'Bob' }, { id: 'c3', firstName: 'Cy' }]);
    const del = contactDelete({ ...s.env, deps: { opportunities: [] }, contacts: contacts.v, setContacts: contacts.set });
    return { ...s, contacts, del };
};

test('§0.273 RUN contacts: one gone is off, unsaid, and out of the Undo — the Undo re-POSTs only what this press deleted', async () => {
    const r = runContacts([['DELETE', /id=c1$/, GONE]]);
    r.del(['c1', 'c2']); await r.did.pending;
    assert.deepEqual(r.contacts.v.map((c) => c.id), ['c3']);
    assert.deepEqual(said(r.did), []);
    assert.equal(r.did.undo.label, 'Contact "Bob"', 'the Undo names the one deleted');
    await r.did.undo.restore();
    const posts = r.did.sent.filter(([m]) => m === 'POST');
    assert.deepEqual(posts.map(([, , b]) => b.id), ['c2'], 'never the one another deleted');
    assert.deepEqual(r.contacts.v.map((c) => c.id).sort(), ['c2', 'c3']);
    const all = runContacts([['DELETE', /id=/, GONE]]);
    all.del(['c1']); await all.did.pending;
    assert.equal(all.did.undo, null, 'every one gone already: no Undo');
    assert.deepEqual(said(all.did), []);
    const plain = runContacts([['DELETE', /id=c1$/, NOT_FOUND]]);
    plain.del(['c1']); await plain.did.pending;
    assert.deepEqual(said(plain.did), ['Contact not deleted — Not found'], 'no code: the refusal, put back');
    assert.ok(plain.contacts.v.some((c) => c.id === 'c1'));
});

test('§0.273 RUN contacts: a Delete while their own Undo is out sends nothing and says so', async () => {
    const post = deferred();
    const r = runContacts([['POST', /contacts$/, post.p]]);
    r.del(['c1']); await r.did.pending;
    const undoing = r.did.undo.restore();
    await turns();
    const before = r.did.sent.length;
    r.del(['c1', 'c2']); await r.did.pending;
    assert.equal(r.did.sent.length, before, 'nothing sent');
    assert.deepEqual(said(r.did).slice(-1), ['Not deleted — "Ann" is still being restored by its Undo. Try again in a moment.']);
    post.resolve([201, {}]); await undoing;
});

// ── accounts ──
const ACCOUNT_NAMES = ['accounts', 'deps', 'isOpenDeal', 'showBlockedDelete', 'isMergeArchived', 'showConfirm', 'requestOrg', 'stillOrg', 'setAccounts', 'dbWrite', 'undoOfDeletes', 'withTiers', 'setUndoToast', 'maybeSaid', 'softDelete', 'parentsFirst', 'withRows', 'loadAccounts', 'isRestoring', 'undoWhileOut', 'stillRestoringWords'];
const accountDelete = build('src/hooks/useAccounts.js', 'const handleDeleteAccounts = (ids, opts = {}) => {', '\n    const handleSaveAccount = async', ACCOUNT_NAMES);
const runAccounts = (answers) => {
    const s = screen(answers);
    const accts = state([{ id: 'a1', name: 'Acme' }, { id: 'a2', name: 'Beta' }, { id: 'a1s', name: 'Acme Site', parentAccountId: 'a1', accountTier: 'site' }]);
    const del = accountDelete({ ...s.env, deps: { opportunities: [] }, accounts: accts.v, setAccounts: accts.set });
    return { ...s, accts, del };
};

test('§0.273 RUN accounts: one gone is off, unsaid, out of the Undo, and the list read again (its delete lifted its sub-accounts)', async () => {
    const r = runAccounts([['DELETE', /id=a1$/, GONE], ['DELETE', /id=a2$/, [200, { success: true, deleted: { id: 'a2', name: 'Beta' }, children: [], retiered: [] }]]]);
    r.del(['a1', 'a2']); await r.did.pending;
    assert.ok(!r.accts.v.some((a) => a.id === 'a1' || a.id === 'a2'), 'both off');
    assert.deepEqual(said(r.did), []);
    assert.equal(r.did.reread, 1, 'the list read again: the sub-accounts another delete lifted, as the server has them');
    assert.equal(r.did.undo.label, 'Account "Beta"', 'the Undo names only the one deleted');
    await r.did.undo.restore();
    assert.deepEqual(r.did.sent.filter(([m]) => m === 'POST').map(([, , b]) => b.id), ['a2'], 'never the one another deleted');
    assert.equal(r.did.reread, 2, 'the Undo ends with a read of its own: the press\'s read, answering after the Undo put its rows back, is overtaken (the review, §0.273)');
    const all = runAccounts([['DELETE', /id=/, GONE]]);
    all.del(['a2']); await all.did.pending;
    assert.equal(all.did.undo, null, 'every one gone already: no Undo, no "0 accounts" toast');
    assert.deepEqual(said(all.did), []);
    const plain = runAccounts([['DELETE', /id=a2$/, NOT_FOUND]]);
    plain.del(['a2']); await plain.did.pending;
    assert.deepEqual(said(plain.did), ['Account not deleted — Not found'], 'no code: the refusal, put back');
    assert.ok(plain.accts.v.some((a) => a.id === 'a2'));
    assert.equal(plain.did.reread, undefined, 'and no read again');
});

test('§0.273 RUN accounts: a Delete while their own Undo is out sends nothing and says so', async () => {
    const post = deferred();
    const r = runAccounts([['DELETE', /id=a2$/, [200, { success: true, deleted: { id: 'a2', name: 'Beta' }, children: [], retiered: [] }]], ['POST', /accounts$/, post.p]]);
    r.del(['a2']); await r.did.pending;
    const undoing = r.did.undo.restore();
    await turns();
    const before = r.did.sent.length;
    r.del(['a2']); await r.did.pending;
    assert.equal(r.did.sent.length, before, 'nothing sent');
    assert.deepEqual(said(r.did).slice(-1), ['Not deleted — "Beta" is still being restored by its Undo. Try again in a moment.']);
    post.resolve([201, { account: { id: 'a2', name: 'Beta' } }]); await undoing;
});

// ── the servers ──
test('§0.273 THE CLASS: each of the five DELETEs answers its 404 `gone`; no PUT 404 says it', () => {
    const del404 = "statusCode: 404, headers, body: JSON.stringify({ error: 'Not found', code: 'gone' }) };";
    for (const [f, n] of [['accounts', 2], ['contacts', 1], ['opportunities', 1], ['activities', 1], ['tasks', 1]]) {
        const src = read(`netlify/functions/${f}.mjs`);
        const del = between(src, "if (event.httpMethod === 'DELETE') {", "return { statusCode: 405");
        assert.equal(del.split(del404).length - 1, n, `${f}: each DELETE 404 says gone`);
        assert.equal(src.split("code: 'gone'").length - 1, n, `${f}: only the DELETE's — a PUT's 404 is an edit of a row gone, never landed`);
        assert.ok(!/statusCode: 404, headers, body: JSON\.stringify\(\{ error: 'Not found' \}\)/.test(del), `${f}: no DELETE 404 left without its code`);
    }
    // A missing row reaches the accounts and deals 404 only for an Admin: assertOwnership answers null for it, and the
    // role gate stands between (a rep's is a 403, never read as gone). The order is load-bearing.
    for (const f of ['accounts', 'opportunities']) {
        const del = between(read(`netlify/functions/${f}.mjs`), "if (event.httpMethod === 'DELETE') {", 'return { statusCode: 405');
        const gate = del.lastIndexOf("requireRole(auth, ['Admin'], headers);");
        assert.ok(gate > 0 && gate < del.indexOf("code: 'gone'"), `${f}: the Admin gate before the gone 404`);
    }
});

// ── every sender ──
test('§0.273 WIRING: every DELETE to the five CRM functions under src/ sends its id encoded', () => {
    const walk = (dir, out = []) => {
        for (const name of readdirSync(dir)) {
            const p = join(dir, name);
            if (statSync(p).isDirectory()) walk(p, out); else if (/\.(jsx?|mjs)$/.test(name)) out.push(p);
        }
        return out;
    };
    const sends = [], raw = [];
    for (const f of walk(fileURLToPath(new URL('src', ROOT)))) {
        for (const line of readFileSync(f, 'utf8').split('\n')) {
            if (!/functions\/(accounts|contacts|opportunities|activities|tasks)\?id=\$\{/.test(line) || !line.includes("method: 'DELETE'")) continue;
            sends.push(line.trim());
            if (!/\?id=\$\{encodeURIComponent\(/.test(line)) raw.push(`${f}: ${line.trim()}`);
        }
    }
    assert.equal(sends.length, 5, 'one sender each (tests/one-delete-path.test.mjs THE GUARD)');
    assert.deepEqual(raw, [], 'an id sent raw: a reserved character would ask for another id, and a live row would read as gone');
    // Each screen reads landed: the row off, kept out of the Undo.
    const hooks = {
        'src/hooks/useAccounts.js': 'if (!r.ok && r.landed) { goneBefore = true; continue; }',
        'src/hooks/useContacts.js': 'if (!r.ok && r.landed) { goneIds.push(c.id); continue; }',
        'src/hooks/useOpportunities.js': 'if (!r.ok && !r.landed) failed.push({ o, error: r.error, unknown: r.unknown });',
        'src/hooks/useActivities.js': 'if (!r.ok && r.landed) return;',
        'src/hooks/useTasks.js': 'if (!r.ok && r.landed) return;',
    };
    for (const [f, line] of Object.entries(hooks)) assert.ok(read(f).includes(line), `${f} reads landed`);
});
