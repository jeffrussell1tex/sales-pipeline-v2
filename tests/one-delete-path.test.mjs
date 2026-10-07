// tests/one-delete-path.test.mjs
//
// One delete path per record, with its rules (state §0.178; Jeff: "Block it" — a
// contact or account on an open deal is not deleted; "Confirm, no Undo" — a deal;
// "add the delete to thee task rail" — a task).
//
// Before: the data hooks' delete handlers — the open-deal blocks, the confirms —
// had no callers, and the screens deleted with their own code: the Contacts tab's
// row menu deleted at once, with no confirm and no open-deal check, and its bulk
// Delete skipped the check; the Accounts tab's bulk Delete skipped it too; the
// Pipeline's Delete (N) handed the old handler the deal instead of its id and threw
// (no deal deletable since 20 Apr). Now each record's DELETE is sent from one hook
// function, every screen calls it, and contacts.mjs and accounts.mjs refuse what
// the screens keep — a rep's screen holds only the deals the rep may see.
//
// THE GUARD: a parse of every request under src that DELETEs one of the five
// records — it sits in its hook's one function, and that function has a caller.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const between = (src, from, to) => { const a = src.indexOf(from); assert.ok(a >= 0, from); const b = src.indexOf(to, a + from.length); assert.ok(b > a, to); return src.slice(a, b); };

// Each record's one delete function: where it lives.
const PATHS = {
    contacts:      ['src/hooks/useContacts.js', 'handleDeleteContacts'],
    accounts:      ['src/hooks/useAccounts.js', 'handleDeleteAccounts'],
    opportunities: ['src/hooks/useOpportunities.js', 'handleDeleteDeals'],
    activities:    ['src/hooks/useActivities.js', 'handleDeleteActivity'],
    tasks:         ['src/hooks/useTasks.js', 'handleDeleteTask'],
};
// A delete function no screen calls, and why that is allowed — none: the task rail's
// Delete calls the last one.
const NO_CALLER = {};

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
const isFn = (n) => n && /^(ArrowFunctionExpression|FunctionExpression|FunctionDeclaration|ObjectMethod)$/.test(n.type);
const ENDPOINT = /\/\.netlify\/functions\/(contacts|accounts|opportunities|tasks|activities)\b/;

// Every DELETE request to the five endpoints, with the function it sits in (the
// outermost named one: a variable it is assigned to, or a declaration).
const deleteRequests = (file, src) => {
    const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
    const out = [];
    const visit = (node, anc) => {
        if (!node || typeof node.type !== 'string') return;
        if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && /^(dbFetch|dbWrite|fetch)$/.test(node.callee.name)) {
            const [u, o] = node.arguments;
            const url = u ? src.slice(u.start, u.end) : '';
            const opts = o ? src.slice(o.start, o.end) : '';
            const m = url.match(ENDPOINT);
            if (m && /method:\s*'DELETE'/.test(opts)) {
                // The handler: the outermost function assigned to a name (inside a hook or a
                // component), else the nearest declared function.
                let owner = null;
                for (const a of anc) {
                    if (a.type === 'VariableDeclarator' && a.id.type === 'Identifier' && isFn(a.init)) { owner = a.id.name; break; }
                }
                for (let i = anc.length - 1; !owner && i >= 0; i--) {
                    if (anc[i].type === 'FunctionDeclaration' && anc[i].id) owner = anc[i].id.name;
                }
                out.push({ file, line: node.loc.start.line, record: m[1], owner });
            }
        }
        for (const k of Object.keys(node)) {
            if (k === 'loc') continue;
            const v = node[k];
            if (Array.isArray(v)) v.forEach((c) => visit(c, [...anc, node])); else if (v && typeof v.type === 'string') visit(v, [...anc, node]);
        }
    };
    visit(ast.program, []);
    return out;
};

test('THE GUARD — every DELETE of a contact, account, deal, activity or task is sent from its hook\'s one delete function', () => {
    const all = srcFiles().flatMap((f) => deleteRequests(f, read(f)));
    const astray = all.filter((r) => !(r.file === PATHS[r.record][0] && r.owner === PATHS[r.record][1]));
    assert.deepEqual(astray.map((r) => `${r.file}:${r.line} ${r.record} in ${r.owner}`), []);
    for (const record of Object.keys(PATHS)) assert.ok(all.some((r) => r.record === record), `${record}: its DELETE found`);
});

test('THE GUARD — and every one of those functions has a caller outside its hook, unless named here with its reason', () => {
    const files = srcFiles();
    for (const [record, [hook, fn]] of Object.entries(PATHS)) {
        const called = files.filter((f) => f !== hook).some((f) => new RegExp(`\\b${fn}\\s*\\(`).test(read(f)));
        if (fn in NO_CALLER) { assert.ok(!called, `${fn} has a caller now — take it out of NO_CALLER`); continue; }
        assert.ok(called, `${record}: nothing calls ${fn}`);
    }
});

test('the guard finds the screens\' own deletes as they were (HEAD before §0.178)', () => {
    const before = `
        export default function ContactsTab() {
            const handleDeleteOne = async (contact) => {
                const r = await dbWrite(\`/.netlify/functions/contacts?id=\${contact.id}\`, { method: 'DELETE' });
            };
        }`;
    const hits = deleteRequests('src/Tabs/ContactsTab.jsx', before);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].owner, 'handleDeleteOne', 'and names where it sat');
});

// ── contacts ────────────────────────────────────────────────────────────────

test('contacts: a contact on an open deal is kept and named; the rest go after a confirm, with Undo', () => {
    const src = read('src/hooks/useContacts.js');
    const fn = between(src, 'const handleDeleteContacts = (ids, opts = {}) => {', 'const handleSaveContact');
    assert.ok(fn.includes('const kept = wanted.map(c => ({ c, deal: activeDealsOf(c, deps.opportunities)[0] })).filter(k => k.deal);'));
    assert.ok(fn.includes('const going = wanted.filter(c => !kept.some(k => k.c.id === c.id));'));
    assert.ok(fn.indexOf('showBlockedDelete(') < fn.indexOf('showConfirm('), 'all kept: refused before any confirm');
    assert.ok(fn.includes("showConfirm(`Delete ${what}? You'll have a few seconds to undo.${keptLine}`, async () => {"), 'a confirm, naming what is kept');
    assert.ok(fn.indexOf('showConfirm(') < fn.indexOf('dbWrite('), 'nothing sent before the confirm');
    assert.ok(fn.includes("if (opts.admin && !kept.length && goingIds.length === contacts.length) {"), 'the one-request clear only when nothing is kept');
    assert.ok(fn.indexOf('softDelete(') > fn.lastIndexOf("method: 'DELETE'"), 'Undo once the DELETEs have landed');
    assert.ok(!src.includes('const handleDeleteContact = '), 'the old handler is gone');
});

test('contacts: the tab\'s row menus and bulk Delete call the hook', () => {
    const src = read('src/Tabs/ContactsTab.jsx');
    assert.ok(src.includes("const handleDeleteOne = (contact) => handleDeleteContacts([contact.id], { admin: userRole === 'Admin' });"));
    assert.ok(src.includes('handleDeleteContacts(selectedIds, {'));
    assert.ok(!/method:\s*'DELETE'/.test(src), 'the tab sends no DELETE of its own');
});

// ── accounts ────────────────────────────────────────────────────────────────

test('accounts: an account with an open deal is kept; its sub-accounts move to the top level and Undo puts them back', () => {
    const src = read('src/hooks/useAccounts.js');
    const fn = between(src, 'const handleDeleteAccounts = (ids, opts = {}) => {', 'const handleSaveAccount');
    assert.ok(fn.includes('isOpenDeal(o) && (o.accountId ? o.accountId === a.id : o.account === a.name));'), 'by id, or by name where a deal has no id');
    assert.ok(fn.includes('const kept = wanted.map(a => ({ a, deal: openDealOf(a) })).filter(k => k.deal);'));
    assert.ok(fn.indexOf('showConfirm(') < fn.indexOf('dbWrite('), 'nothing sent before the confirm');
    assert.ok(fn.includes("will move to the top level."), 'the confirm says what happens to the sub-accounts');
    assert.ok(fn.includes('setAccounts(prev => prev.map(a => (promoted.some(c => c.id === a.id) ? { ...a, parentAccountId: null } : a)));'), 'the screen promotes them as the server does');
    assert.ok(fn.includes('body: JSON.stringify({ id: c.id, parentAccountId: c.parentId }),'), 'Undo puts each back under its account');
    assert.ok(!src.includes('const handleDeleteAccount = ') && !src.includes('const handleDeleteSubAccount'), 'the old handlers are gone');
});

test('accounts: Select and Delete are an Admin\'s — the server deletes an account for an Admin only', () => {
    const src = read('src/Tabs/AccountsTab.jsx');
    assert.ok(src.includes("const isAdmin    = userRole === 'Admin';"));
    assert.ok(src.includes('{isAdmin && selectMode && selectedIds.length > 0 && ('));
    assert.ok(src.includes('{isAdmin && (   // Select serves Delete alone'));
    assert.ok(src.includes('handleDeleteAccounts(selectedIds, { onConfirm: () => { setSelectedIds([]); setSelectMode(false); } });'));
    assert.ok(!/method:\s*'DELETE'/.test(src), 'the tab sends no DELETE of its own');
});

// ── deals ───────────────────────────────────────────────────────────────────

test('deals: confirmed, one DELETE each by id, no Undo — and an Admin\'s', () => {
    const src = read('src/hooks/useOpportunities.js');
    const fn = between(src, 'const handleDeleteDeals = (ids, opts = {}) => {', 'const handleSave = (');
    assert.ok(fn.includes('showConfirm(`Delete ${what}? This cannot be undone.`, async () => {'));
    assert.ok(fn.indexOf('showConfirm(') < fn.indexOf('dbWrite('));
    assert.ok(fn.includes("const r = await dbWrite(`/.netlify/functions/opportunities?id=${o.id}`, { method: 'DELETE' });"));
    assert.ok(!fn.includes('softDelete('), 'no Undo: a deal re-POSTed is a new deal to the server');
    const pipeline = read('src/Tabs/PipelineTab.jsx');
    assert.ok(pipeline.includes('{isAdmin && selectMode && selectedOpps.length > 0 && ('));
    assert.ok(pipeline.includes('onClick={() => handleDeleteDeals(selectedOpps, { onConfirm: () => { setSelectedOpps([]); setSelectMode(false); } })}'), 'the ids, not the deals');
    assert.ok(!pipeline.includes('handleDelete(opp)'), 'the deal handed over as an id');
    assert.ok(!read('src/components/FunnelView.jsx').includes('handleDelete'), 'the prop it never called');
});

// ── tasks ───────────────────────────────────────────────────────────────────

test('tasks: the task rail\'s Delete — a confirm, the DELETE, then Undo; a writer\'s', () => {
    const src = read('src/hooks/useTasks.js');
    const fn = between(src, 'const handleDeleteTask = (taskId, opts = {}) => {', 'Could not restore the task');
    assert.ok(fn.includes('const task = tasks.find(t => t.id === taskId);'), 'read from the list, not through an updater');
    assert.ok(!src.includes('setTasks(prev => { task ='), 'the updater read');
    assert.ok(fn.includes("showConfirm(`Delete the task \"${title}\"? You'll have a few seconds to undo.`, async () => {"));
    const del = fn.indexOf("const r = await dbWrite(`/.netlify/functions/tasks?id=${taskId}`, { method: 'DELETE' });");
    assert.ok(del > fn.indexOf('showConfirm('), 'the DELETE awaited, after the confirm');
    assert.ok(fn.indexOf('softDelete(') > del, 'Undo once the DELETE has landed');
    assert.match(fn, /if \(!r\.ok\) \{\s*setTasks\(prev => \(prev\.some\(t => t\.id === taskId\) \? prev : \[\.\.\.prev, task\]\)\);\s*setUndoToast\(\{ error: `Task not deleted — \$\{r\.error\}` \}\);/, 'a refused delete puts the task back and says why');
    const rail = read('src/components/rails/TaskRail.jsx');
    assert.ok(rail.includes("import { canEditCrm } from '../../utils/roles.js';"));
    assert.ok(rail.includes('{!isEditing && !isNew && task && canEditCrm(userRole) && ('), 'a writer\'s, on a saved task, in view mode');
    assert.ok(rail.includes('onClick={() => handleDeleteTask(task.id, { onConfirm: closeRail })}'), 'the rail closes once the user confirms');
});

// ── the rails' Escape ───────────────────────────────────────────────────────

test('a rail\'s Escape never closes it under the app\'s confirm or prompt — App closes those first, and the task\'s Delete asks over its rail', () => {
    const dir = 'src/components/rails/';
    const rails = readdirSync(new URL(dir, ROOT)).filter((f) => f.endsWith('.jsx'))
        .map((f) => [f, read(dir + f)]).filter(([, s]) => /if \(e\.key === 'Escape'[^\n]*closeRail\(\)/.test(s));
    for (const f of ['TaskRail.jsx', 'ContactRail.jsx', 'AccountRail.jsx', 'ActivityRail.jsx']) {
        assert.ok(rails.some(([n]) => n === f), `${f}: its Escape listener found`);
    }
    for (const [f, s] of rails) {
        const line = s.match(/const onKey = \(e\) => \{ if \(e\.key === 'Escape'[^\n]*closeRail\(\); \};/);
        assert.ok(line, `${f}: its Escape listener`);
        assert.ok(line[0].includes('&& !confirmModal && !promptModal)'), `${f}: it closes the rail under a confirm or a prompt`);
        const deps = s.slice(line.index).match(/\}, \[([^\]]*)\]\);/);
        assert.ok(deps && /\bconfirmModal\b/.test(deps[1]) && /\bpromptModal\b/.test(deps[1]), `${f}: its listener reads the confirm of the render it was made in`);
    }
});

// ── the server ──────────────────────────────────────────────────────────────

test('server: contacts.mjs refuses a contact on an open deal — after its gates, before the delete, naming no deal', () => {
    const src = read('netlify/functions/contacts.mjs');
    const del = between(src, "if (event.httpMethod === 'DELETE') {", "return { statusCode: 405");
    const check = del.indexOf('if (target && await openDealNamingContact(orgId, target)) {');
    assert.ok(check > del.indexOf('if (forbiddenDel) return forbiddenDel;'), 'after the ownership check');
    assert.ok(check < del.indexOf('const [deletedRow] = await db.delete(contacts)'), 'before the delete');
    assert.ok(del.includes("return openDealRefusal(headers, 'This contact is on an open deal. Take them off the deal, or close it, before deleting.');"), 'names no deal — a rep may not see it');
    const clear = del.indexOf('if (await openDealNamingAnyContact(orgId, everyone)) {');
    assert.ok(clear > del.indexOf("const forbidden = requireRole(auth, ['Admin'], headers);") && clear < del.indexOf('const deleted = await db.delete(contacts).where(eq(contacts.orgId, orgId))'), 'the clear too');
});

test('server: accounts.mjs refuses an account with an open deal — after its gates, before the delete', () => {
    const src = read('netlify/functions/accounts.mjs');
    const del = between(src, "if (event.httpMethod === 'DELETE') {", "return { statusCode: 405");
    const check = del.indexOf('const holding = target ? await openDealOfAccount(orgId, target) : null;');
    assert.ok(check > del.indexOf('if (forbiddenDelete) return forbiddenDelete;'), 'after the Admin gate');
    assert.ok(check < del.indexOf('const [deletedRow] = await db.delete(accounts)'), 'before the delete');
    const clear = del.indexOf('const holding = await openDealOfAnyAccount(orgId, everyAccount);');
    assert.ok(clear > 0 && clear < del.indexOf('const deleted = await db.delete(accounts).where(eq(accounts.orgId, orgId))'), 'the clear too');
});

test('a delete\'s audit line is the server\'s — each DELETE writes <record>.deleted once the row is gone, and no screen writes its own', () => {
    for (const [file, entity] of [['contacts', 'contact'], ['accounts', 'account'], ['opportunities', 'opportunity'], ['tasks', 'task'], ['activities', 'activity']]) {
        const del = between(read(`netlify/functions/${file}.mjs`), "if (event.httpMethod === 'DELETE') {", 'return { statusCode: 405');
        const gone = del.indexOf('if (!deletedRow) return { statusCode: 404');
        assert.ok(gone > 0 && del.indexOf(`deletionAudit('${entity}', deletedRow`) > gone, `${file}.mjs: its audit line, after the row is gone`);
    }
    // The hooks' own 'delete' lines ran before the answer: a refused delete was logged
    // as one, and a deleted one twice.
    assert.deepEqual(srcFiles().filter((f) => read(f).includes("addAudit('delete'")), []);
});

test('server: _openDeals.mjs reads the org\'s deals with the screens\' own rule', () => {
    const src = read('netlify/functions/_openDeals.mjs');
    assert.ok(src.includes("import { isOpenDeal, dealNamesContact } from '../../src/utils/contactDeals.js';"), 'one rule for the screen and the server');
    assert.ok(src.includes('return rows.find((o) => isOpenDeal(o) && dealNamesContact(o, contact)) || null;'));
    assert.ok(src.includes('const rows = await db.select(DEAL_COLUMNS).from(opportunities).where(and(eq(opportunities.orgId, orgId), named));'), 'this org\'s deals only');
    assert.ok(src.includes('or(eq(opportunities.accountId, account.id), and(isNull(opportunities.accountId), eq(opportunities.account, account.name))),'));
    assert.ok(src.includes('return rows.find(isOpenDeal) || null;'));
    assert.ok(src.includes("const likeLiteral = (s) => String(s).replace(/[\\\\%_]/g, (c) => '\\\\' + c);"), 'a name\'s % and _ are literal');
});
