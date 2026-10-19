// tests/merged-away-cleanup.test.mjs
//
// Merged-away records leave every other list — the cleanup batch's screens step (state §0.209; OPEN_ITEMS §1 item 1).
// Jeff, 16 Oct: "One cleanup batch next"; 17 Oct: "Add them to the cleanup batch", "Undo, cleanup, profile"; 18 Oct:
// "Three steps" (THE GUARD first, §0.208; then every screen, here; then the public API, the quote email and the
// numbers, §0.210), "Survivor shows them", "One row to the survivor", "Fix both now", "Approve; fix the list".
//
// Before: since §0.206 a record merged into another left the Accounts and Contacts tabs, an account's Sub-Accounts and
// People list — but the header search still listed "Resinall, Inc." beside "Resinall" (and opened it as a live record
// with Edit), Reports' Activity History listed it in both its pickers and offered a merged-away contact to add to a
// deal, the document link picker and Dispatch's two account pickers offered it (guide §18b91 rule 5), the meeting prep
// panel gave a merged-away contact a slot, and Reports' Opportunity history took a deal's account by name — a
// merged-away twin first. And what a merge leaves naming the old record (an activity's other contacts, a task's chips,
// a document's link, a contact's accountId — no merge moves them, OPEN_ITEMS §4.7) was reached only by opening that
// record, which hiding it closes.
//
// Now each screen draws, offers and counts the live records (unarchived / isMergeArchived), and the record a merge
// kept shows what still names the one merged into it (standsFor): the contact rail's Activity History, Reports'
// Contact history, an account's People and Activity tab, its Documents tab. A name typed in full that only a
// merged-away record has names the record it was merged into: one row in the header search, which opens it; Dispatch's
// New Job offers no Create for it and its Save refuses it. A link a picker no longer offers is drawn as itself, never
// as "— Not linked —" or only counted. A deal's account is its link (accountOfDeal); the header's "N open deals" and
// Reports' Account history read deals by their link too (Q7: by name only for an old deal with none). Nothing is
// written, and the app's lists keep every row (guide §18b99): an Undo, the lists read again, puts each screen back.
//
// Run here, on made-up rows in Jeff's shapes: each screen's lines read from its file, pinned, and run as written (a
// memo sliced from its file and run whole) — and the lines as they stood before (on 8f62dc7), run once on the same rows,
// so the rows are seen to tell the two apart; where a line reads the merge mark, an Undo run repeats it with the mark
// taken off. THE GUARD (tests/merged-away-lists.test.mjs T8) holds every other read of the app's lists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
import {
    unarchived, isMergeArchived, survivorOf, resolveLink, linkRefusal, standsFor, mergedInto, mergedSearchWords, accountOfDeal,
    heldAccountOption, HIDDEN_ACCOUNT, HIDDEN_DEAL,
} from '../src/utils/pickLink.js';
import { matchSearch, searchKey } from '../src/utils/searchMatch.js';
import { linkedToContact, taskDay } from '../src/utils/historyFeed.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
// The code a pin reads: whole-line comments dropped, so a comment quoting a line never stands in for it.
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const count = (s, sub) => s.split(sub).length - 1;
const S = (n) => ' '.repeat(n);
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
// Whole lines run as written: `names` are the free names they read, handed `values`; `result` is what comes back.
const run = (lines, names, values, result) => new Function(...names, `${lines.map((l) => l.trim()).join('\n')}\nreturn ${result};`)(...values);
const ids = (rows) => rows.map((r) => r.id);
const useMemo = (f) => f();
// A merge undone (merge.mjs's reverse): the mark taken off the row.
const undone = (rows, id) => rows.map((r) => (r.id === id ? { ...r, mergeArchived: false, mergedIntoId: null } : r));

// ── slicing a memo or a function out of its file ───────────────────────────
const jsx = (src) => parse(src, { sourceType: 'module', plugins: ['jsx'] });
const walk = (n, f) => {
    if (!n || typeof n.type !== 'string') return;
    f(n);
    for (const k of Object.keys(n)) {
        if (k === 'loc' || k === 'start' || k === 'end') continue;
        const v = n[k];
        if (Array.isArray(v)) v.forEach((c) => walk(c, f));
        else if (v && typeof v.type === 'string') walk(v, f);
    }
};
// The function `fnName` of the file (a declaration, or a const bound to one) — the node.
const fnNode = (ast, fnName) => {
    let hit = null;
    walk(ast.program, (n) => {
        if (hit) return;
        if (n.type === 'FunctionDeclaration' && n.id?.name === fnName) hit = n;
        if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === fnName && /Function/.test(n.init?.type || '')) hit = n.init;
    });
    assert.ok(hit, `function ${fnName} not found`);
    return hit;
};
// The init of `const <name> = …` inside `within` — exactly one.
const declIn = (within, name) => {
    const hits = [];
    walk(within, (n) => { if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === name) hits.push(n.init); });
    assert.equal(hits.length, 1, `one const ${name}`);
    return hits[0];
};
// A memo's callback, as written: `const name = useMemo(cb, deps)` / `React.useMemo(…)` inside function `fnName`.
const memoOf = (src, fnName, name) => {
    const init = declIn(fnNode(jsx(src), fnName), name);
    assert.ok(init.type === 'CallExpression' && /useMemo$/.test(src.slice(init.callee.start, init.callee.end)), `${name} is a memo`);
    return src.slice(init.arguments[0].start, init.arguments[0].end);
};
// A const's init, as written, inside function `fnName` (or the file's top level when fnName is null).
const initOf = (src, fnName, name) => {
    const ast = jsx(src);
    const init = declIn(fnName ? fnNode(ast, fnName) : ast.program, name);
    return src.slice(init.start, init.end);
};
// A slice run with its free names.
const runSlice = (text, scope) => new Function(...Object.keys(scope), `return (${text});`)(...Object.values(scope));
// The slice as it stood: each [new, old] text swapped back, each found exactly once.
const asWas = (text, swaps) => swaps.reduce((t, [now, was]) => {
    assert.equal(count(t, now), 1, `once in the slice: ${now}`);
    return t.replace(now, was);
}, text);

// ── made-up rows, in the shapes Jeff met ───────────────────────────────────
// "Resinall, Inc." merged into "Resinall"; Evonik's two Lafayette sites, the merged-away one FIRST (a lookup by name took
// it); a row whose mark is NULL; an undone merge; UKG's two "Shell - Port Allen" (a business unit and its site, in that
// order — the later is the site); a chain: Alpha merged into Beta, Beta since into Gamma.
const ACCOUNTS = Object.freeze([
    { id: 'acc_resinall', name: 'Resinall', parentAccountId: null, accountOwner: 'Karen', mergeArchived: false, city: 'Tulsa' },
    { id: 'acc_resinall_inc', name: 'Resinall, Inc.', parentAccountId: null, accountOwner: 'Karen', mergeArchived: true, mergedIntoId: 'acc_resinall', city: 'Old Town' },
    { id: 'acc_evonik', name: 'Evonik', parentAccountId: null, accountOwner: 'Ravi', mergeArchived: false },
    { id: 'acc_lafayette_dup', name: 'Evonik - Lafayette', parentAccountId: 'acc_evonik', accountOwner: 'Ravi', mergeArchived: true, mergedIntoId: 'acc_lafayette' },
    { id: 'acc_lafayette', name: 'Evonik - Lafayette', parentAccountId: 'acc_evonik', accountOwner: 'Ravi', mergeArchived: false },
    { id: 'acc_mobile', name: 'Evonik - Mobile', parentAccountId: 'acc_evonik', accountOwner: '', mergeArchived: null },
    { id: 'acc_undone', name: 'Undone Co', parentAccountId: null, accountOwner: 'Ravi', mergeArchived: false, mergedIntoId: null },
    { id: 'acc_shell_unit', name: 'Shell - Port Allen', parentAccountId: 'acc_shell', accountTier: 'business_unit', accountOwner: 'Ravi', mergeArchived: false },
    { id: 'acc_shell_site', name: 'Shell - Port Allen', parentAccountId: 'acc_shell_unit', accountTier: 'site', accountOwner: 'Ravi', mergeArchived: false },
    { id: 'acc_alpha', name: 'Alpha', mergeArchived: true, mergedIntoId: 'acc_beta', accountOwner: 'Ravi' },
    { id: 'acc_beta', name: 'Beta', mergeArchived: true, mergedIntoId: 'acc_gamma', accountOwner: 'Ravi' },
    { id: 'acc_gamma', name: 'Gamma', mergeArchived: false, accountOwner: 'Ravi' },
]);
// Lee Ng twice, one merged into the other (the merged-away twin FIRST); Ana with no owner; Tia linked by id to the
// account merged away (an account merge renames a contact's company, never its accountId); Bo on Evonik's live site.
const CONTACTS = Object.freeze([
    { id: 'con_lee_dup', firstName: 'Lee', lastName: 'Ng', company: 'Resinall', accountId: 'acc_resinall', assignedRep: 'Karen', mergeArchived: true, mergedIntoId: 'con_lee', email: 'old@resinall.test' },
    { id: 'con_lee', firstName: 'Lee', lastName: 'Ng', company: 'Resinall', accountId: 'acc_resinall', assignedRep: 'Karen', email: 'lee@resinall.test' },
    { id: 'con_ana', firstName: 'Ana', lastName: 'Ruiz', company: 'Resinall', accountId: null, assignedRep: '' },
    { id: 'con_tia', firstName: 'Tia', lastName: 'Linked', company: 'Resinall', accountId: 'acc_resinall_inc', assignedRep: 'Karen' },
    { id: 'con_bo', firstName: 'Bo', lastName: 'Kim', company: 'Evonik - Lafayette', accountId: 'acc_lafayette', assignedRep: 'Ravi' },
]);
// A call logged with Ana and the Lee merged away (a contact merge moved its contactId only — here Ana's, untouched);
// Lee's own call; a task whose chip names the Lee merged away; Tia's call.
const ACTIVITIES = Object.freeze([
    { id: 'act_orphan', type: 'Call', subject: 'Pricing call', contactId: 'con_ana', contactIds: ['con_ana', 'con_lee_dup'], date: '2026-10-10' },
    { id: 'act_lee', type: 'Email', subject: 'Follow up', contactId: 'con_lee', date: '2026-10-11' },
    { id: 'act_tia', type: 'Call', subject: 'Tia call', contactId: 'con_tia', date: '2026-10-12' },
]);
const TASKS = Object.freeze([
    { id: 'task_chip', title: 'Send the sample', contacts: [{ id: 'con_lee_dup', name: 'Lee Ng' }], dueDate: '2026-10-15' },
]);
// A won deal still linked by id to "Resinall, Inc." (a stale id); an id-less open deal on "Evonik - Lafayette"; a deal
// on each Shell twin by id, and an old id-less one by the name; a deal naming the merged-away Lee.
const DEALS = Object.freeze([
    { id: 'opp_won', opportunityName: 'Resinall resin', account: 'Resinall, Inc.', accountId: 'acc_resinall_inc', stage: 'Closed Won', arr: 50000 },
    { id: 'opp_lafayette', opportunityName: 'Lafayette pumps', account: 'Evonik - Lafayette', accountId: null, stage: 'Proposal', arr: 1000 },
    { id: 'opp_shell_unit', opportunityName: 'Unit deal', account: 'Shell - Port Allen', accountId: 'acc_shell_unit', stage: 'Proposal', arr: 2000 },
    { id: 'opp_shell_site', opportunityName: 'Site deal', account: 'Shell - Port Allen', accountId: 'acc_shell_site', stage: 'Proposal', arr: 3000 },
    { id: 'opp_shell_old', opportunityName: 'Old deal', account: 'Shell - Port Allen', accountId: null, stage: 'Proposal', arr: 4000 },
    { id: 'opp_lee', opportunityName: 'Lee deal', account: 'Resinall', accountId: 'acc_resinall', stage: 'Proposal', arr: 500, contactIds: ['con_lee_dup'] },
]);
const RESINALL = ACCOUNTS[0];
const LEE = CONTACTS[1];

// ── C1 ─────────────────────────────────────────────────────────────────────

test('C1 — pickLink helpers: standsFor, mergedInto, mergedSearchWords, accountOfDeal and heldAccountOption on merged-away rows, a chain, a NULL mark, an undone merge and a rep\'s list (run)', () => {
    // standsFor: itself, and every record merged into it — through later merges too.
    assert.deepEqual([...standsFor(RESINALL, ACCOUNTS)].sort(), ['acc_resinall', 'acc_resinall_inc'], 'Resinall stands for "Resinall, Inc."');
    assert.deepEqual([...standsFor(ACCOUNTS.find((a) => a.id === 'acc_gamma'), ACCOUNTS)].sort(), ['acc_alpha', 'acc_beta', 'acc_gamma'], 'a chain: Gamma for all three');
    assert.deepEqual([...standsFor(ACCOUNTS[1], ACCOUNTS)], ['acc_resinall_inc'], 'a record merged away stands for itself alone');
    assert.deepEqual([...standsFor(RESINALL, undone(ACCOUNTS, 'acc_resinall_inc'))], ['acc_resinall'], 'Undo: "Resinall, Inc." stands for itself again');
    assert.deepEqual([...standsFor(null, ACCOUNTS)], [], 'no record');
    assert.deepEqual([...standsFor(LEE, CONTACTS)].sort(), ['con_lee', 'con_lee_dup'], 'contacts alike');
    assert.deepEqual([...standsFor(RESINALL, unarchived(ACCOUNTS))], ['acc_resinall'], 'a list without the merged-away row: itself');
    // mergedInto: a name only a merged-away record has, typed in full in any case or punctuation.
    const m = mergedInto('Resinall, Inc.', ACCOUNTS);
    assert.deepEqual([m.text, m.name, m.into?.id], ['Resinall, Inc.', 'Resinall, Inc.', 'acc_resinall']);
    const loose = mergedInto('resinall inc', ACCOUNTS);
    assert.deepEqual([loose.name, loose.into?.id], ['Resinall, Inc.', 'acc_resinall'], "the record's own name, not what was typed");
    assert.equal(mergedInto('Evonik - Lafayette', ACCOUNTS), null, 'a live twin has the name');
    assert.equal(mergedInto('Resinall', ACCOUNTS), null, 'a live record has it');
    assert.equal(mergedInto('', ACCOUNTS), null);
    assert.equal(mergedInto('Nobody', ACCOUNTS), null);
    assert.equal(mergedInto('Resinall, Inc.', ACCOUNTS.filter((a) => a.id !== 'acc_resinall')).into, null, "a rep's list without the survivor: into none");
    assert.equal(mergedInto('Alpha', ACCOUNTS).into?.id, 'acc_gamma', 'through a chain');
    assert.equal(mergedInto('Resinall, Inc.', undone(ACCOUNTS, 'acc_resinall_inc')), null, 'Undo: live again, no line');
    const lee = mergedInto('Lee Ng', CONTACTS, (c) => `${c.firstName || ''} ${c.lastName || ''}`);
    assert.equal(lee, null, 'Lee Ng: the live Lee has the name');
    // mergedSearchWords: both forms.
    assert.equal(mergedSearchWords(m, 'account'), '“Resinall, Inc.” was merged into this account');
    assert.equal(mergedSearchWords({ ...m, into: null }, 'account'), '“Resinall, Inc.” was merged into another account.');
    assert.equal(mergedSearchWords({ name: 'Lee Ng', into: null }, 'contact'), '“Lee Ng” was merged into another contact.');
    // accountOfDeal: by id; a merged-away id → its survivor; an id outside the list → none; id-less → the LATER live twin.
    const by = (id) => accountOfDeal(DEALS.find((d) => d.id === id), ACCOUNTS)?.id ?? null;
    assert.equal(by('opp_won'), 'acc_resinall', 'a deal still on "Resinall, Inc." stands on Resinall');
    assert.equal(by('opp_shell_unit'), 'acc_shell_unit');
    assert.equal(by('opp_shell_site'), 'acc_shell_site');
    assert.equal(by('opp_shell_old'), 'acc_shell_site', 'an old id-less deal: the later live account of its name');
    assert.equal(by('opp_lafayette'), 'acc_lafayette', 'never the merged-away twin, though it comes first');
    const later = [ACCOUNTS.find((a) => a.id === 'acc_lafayette'), ACCOUNTS.find((a) => a.id === 'acc_lafayette_dup')];
    assert.equal(accountOfDeal(DEALS.find((d) => d.id === 'opp_lafayette'), later)?.id, 'acc_lafayette', 'nor when it comes later: the later LIVE account of the name');
    assert.equal(accountOfDeal({ accountId: 'acc_gone' }, ACCOUNTS), null, 'an id the list does not hold');
    assert.equal(accountOfDeal({ accountId: 'acc_resinall_inc' }, ACCOUNTS.filter((a) => a.id !== 'acc_resinall')), null, "a survivor outside the list");
    assert.equal(accountOfDeal({ accountId: 'acc_resinall_inc' }, undone(ACCOUNTS, 'acc_resinall_inc'))?.id, 'acc_resinall_inc', 'Undo: its own account again');
    assert.equal(accountOfDeal(null, ACCOUNTS), null);
    // heldAccountOption: a held link the live options leave out.
    assert.equal(heldAccountOption('acc_resinall', ACCOUNTS), null, 'live: the options hold it');
    assert.deepEqual(heldAccountOption('acc_resinall_inc', ACCOUNTS), {
        label: 'Resinall, Inc. (merged into Resinall)',
        note: '“Resinall, Inc.” was merged into “Resinall” — pick “Resinall”, or “— Not linked —”, and save.',
    });
    assert.deepEqual(heldAccountOption('acc_resinall_inc', ACCOUNTS.filter((a) => a.id !== 'acc_resinall')), {
        label: 'Resinall, Inc. (merged into another account)',
        note: '“Resinall, Inc.” was merged into another account — pick another, or “— Not linked —”, and save.',
    });
    assert.deepEqual(heldAccountOption('acc_gone', ACCOUNTS), { label: HIDDEN_ACCOUNT, note: '' }, "one the list does not hold: an account you can't open");
    assert.equal(heldAccountOption('', ACCOUNTS), null, 'no link');
    assert.equal(heldAccountOption('acc_resinall_inc', undone(ACCOUNTS, 'acc_resinall_inc')), null, 'Undo: offered again');
    assert.equal(heldAccountOption('acc_mobile', ACCOUNTS), null, 'a NULL mark reads live');
});

// ── C2 / C14 — the header search ───────────────────────────────────────────

const HEADER = 'src/components/layout/AppHeader.jsx';
const H_LINES = [
    S(32) + "const { shown: mA, more: moreA } = matchSearch(unarchived(accounts), globalSearch, { text: a => a.name, also: a => [a.accountOwner], limit: 5 });",
    S(32) + "const { shown: mC, more: moreC } = matchSearch(unarchived(contacts), globalSearch, { text: c => (c.firstName||'')+' '+(c.lastName||''), also: c => [c.company, c.email], limit: 5 });",
    S(32) + 'const { shown: mO, more: moreO } = matchSearch(opportunities, globalSearch, { text: o => o.opportunityName || o.account, also: o => [o.account], limit: 5 });',
    S(32) + 'const gA = mergedInto(globalSearch, accounts);',
    S(32) + "const gC = mergedInto(globalSearch, contacts, c => `${c.firstName || ''} ${c.lastName || ''}`);",
    S(32) + 'const lineA = gA && !mA.some(a => a.id === gA.into?.id) ? gA : null;',
    S(32) + 'const lineC = gC && !mC.some(c => c.id === gC.into?.id) ? gC : null;',
    S(32) + 'const noHits = !mA.length && !mC.length && !mO.length && !lineA && !lineC;',
    S(32) + 'const showA = mA.length > 0 || !!lineA;',
    S(32) + 'const showC = mC.length > 0 || !!lineC;',
];
const OLD_H_ACCOUNTS = "const { shown: mA, more: moreA } = matchSearch(accounts, globalSearch, { text: a => a.name, also: a => [a.accountOwner], limit: 5 });";
const OD = "const od = opportunities.filter(o => (o.accountId ? o.accountId === a.id : (o.account||'').toLowerCase() === (a.name||'').toLowerCase()) && o.stage !== 'Closed Won' && o.stage !== 'Closed Lost').length;";
const OLD_OD = "const od = opportunities.filter(o => (o.account||'').toLowerCase() === (a.name||'').toLowerCase() && o.stage !== 'Closed Won' && o.stage !== 'Closed Lost').length;";

test('C2 — the header search: a merged-away account or contact is not listed; a name only it has, typed in full, is one row naming the record it was merged into, which opens it — or, for a rep without that record, the words alone; "No results found" and each group decided with that row counted (run as written)', () => {
    const h = code(read(HEADER));
    order(h, ...H_LINES);
    for (const l of H_LINES) once(h, l);
    assert.ok(h.includes("import { unarchived, mergedInto, mergedSearchWords } from '../../utils/pickLink.js';"));
    const search = (globalSearch, accounts = ACCOUNTS, contacts = CONTACTS) => run(H_LINES,
        ['matchSearch', 'unarchived', 'mergedInto', 'accounts', 'contacts', 'opportunities', 'globalSearch'],
        [matchSearch, unarchived, mergedInto, accounts, contacts, DEALS, globalSearch],
        '{ mA, mC, mO, lineA, lineC, noHits, showA, showC }');
    const r = search('Resinall');
    assert.deepEqual(ids(r.mA), ['acc_resinall'], 'REGRESSION: "Resinall, Inc." listed beside "Resinall" in the header search');
    assert.equal(r.lineA, null, 'the live one has the name: no merged line');
    const inc = search('Resinall, Inc.');
    assert.deepEqual([ids(inc.mA), inc.lineA?.into?.id, inc.lineA?.name, inc.noHits, inc.showA], [[], 'acc_resinall', 'Resinall, Inc.', false, true],
        'REGRESSION: the old name finds nothing — or opens the record merged away');
    assert.equal(mergedSearchWords(inc.lineA, 'account'), '“Resinall, Inc.” was merged into this account');
    assert.equal(search('resinall inc').lineA?.name, 'Resinall, Inc.', "the record's own name, not what was typed");
    const rep = search('Resinall, Inc.', ACCOUNTS.filter((a) => a.id !== 'acc_resinall'));
    assert.deepEqual([rep.lineA?.into, rep.noHits, mergedSearchWords(rep.lineA, 'account')], [null, false, '“Resinall, Inc.” was merged into another account.'], "a rep without the survivor: the words, no record");
    assert.deepEqual(ids(search('Lee Ng').mC), ['con_lee'], 'REGRESSION: Lee Ng listed twice');
    assert.equal(search('Lee Ng').lineC, null);
    const none = search('zzz nothing');
    assert.deepEqual([none.noHits, none.showA, none.showC], [true, false, false], '"No results found"');
    // Undo: the record live again — listed, no line.
    const back = search('Resinall, Inc.', undone(ACCOUNTS, 'acc_resinall_inc'));
    assert.deepEqual([ids(back.mA), back.lineA], [['acc_resinall_inc'], null], 'Undo: listed again');
    // The line as it stood, on the same rows.
    const old = run([OLD_H_ACCOUNTS], ['matchSearch', 'accounts', 'globalSearch'], [matchSearch, ACCOUNTS, 'Resinall'], 'mA');
    assert.ok(ids(old).includes('acc_resinall_inc'), 'the old line lists "Resinall, Inc."');
    // What the gates decide, drawn: the empty answer, each group, its merged row and its open.
    once(h, S(32) + "if (noHits) return <div style={{ padding: '1.5rem', textAlign: 'center', color: T.inkMuted, fontSize: 13, fontFamily: T.sans }}>No results found</div>;");
    assert.equal(count(h, '{showA && <div><SearchGroup label="Accounts"/>'), 1);
    assert.equal(count(h, '{showC && <div><SearchGroup label="Contacts"/>'), 1);
    assert.equal(count(h, '{lineA && <MergedSearchLine line={lineA} noun="account" meta="Account" onOpen={() => {'), 1);
    assert.equal(count(h, '{lineC && <MergedSearchLine line={lineC} noun="contact" meta="Contact" onOpen={() => {'), 1);
    assert.equal(count(h, 'if (stillOrg(askedOrg)) setViewingAccount(lineA.into);'), 1, 'the merged row opens the survivor');
    assert.equal(count(h, 'if (stillOrg(askedOrg)) setViewingContact(lineC.into);'), 1);
    assert.equal(count(h, 'if (stillOrg(askedOrg)) setViewingAccount(a);'), 1, "a row opens its own");
    // The group and row components at module scope (never inside AppHeader's render).
    for (const l of ['const SearchGroup = ({ label }) => ', 'const SearchRow = ({ primary, secondary, meta, onClick }) => (', 'const MergedSearchLine = ({ line, noun, meta, onOpen }) => (line.into']) {
        assert.ok(h.split('\n').some((x) => x.startsWith(l)), `module scope: ${l}`);
    }
    assert.ok(!h.includes('const GH =') && !h.includes('const RR ='), 'no component declared inside the render');
    assert.ok(h.includes('    ? <SearchRow primary={noun === \'contact\''), 'with its record: a row that opens it');
    assert.ok(h.includes('    : <div style={{ padding: \'7px 12px\', borderBottom: `1px solid ${T.border}`, fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>{mergedSearchWords(line, noun)}</div>);'), 'without: the words, no click');
});

test('C14 — the riders (Q7, Jeff: "Fix both now"): the header\'s "N open deals" and Reports → Account history read a deal by its account link — by name only for an old deal with none (run as written)', () => {
    const h = code(read(HEADER));
    assert.equal(count(h, OD), 1, "the header's open-deal count");
    const od = (a) => run([OD], ['opportunities', 'a'], [DEALS, a], 'od');
    const unit = ACCOUNTS.find((a) => a.id === 'acc_shell_unit');
    const site = ACCOUNTS.find((a) => a.id === 'acc_shell_site');
    assert.deepEqual([od(unit), od(site)], [2, 2], "each twin: its own deal by id, and the old id-less deal of the name");
    assert.deepEqual([run([OLD_OD], ['opportunities', 'a'], [DEALS, unit], 'od'), run([OLD_OD], ['opportunities', 'a'], [DEALS, site], 'od')], [3, 3], 'the old line: each twin counted all three');
    // Reports → Account history: its feed's deals and its KPIs' deals.
    const r = read('src/Tabs/ReportsTab.jsx');
    const events = memoOf(r, 'ActivityHistoryTab', 'accountEvents');
    const opps = memoOf(r, 'ActivityHistoryTab', 'accOpps');
    const scope = (selectedAccount, accounts = ACCOUNTS) => ({ selectedAccount, accounts, opportunities: DEALS, activities: [], tasks: [],
        standsFor, linkedToAccount: () => false, inPeriod: () => true, taskDay, lossBucketOf: () => '' });
    const dealsIn = (evs) => evs.map((e) => e.id.replace(/^opp_(won|lost|open)_/, '')).sort();
    assert.deepEqual(dealsIn(runSlice(events, scope(unit))()), ['opp_shell_old', 'opp_shell_unit'], 'the unit: its deal and the old one of its name');
    assert.deepEqual(ids(runSlice(opps, scope(site))()).sort(), ['opp_shell_old', 'opp_shell_site']);
    assert.deepEqual(ids(runSlice(opps, scope(RESINALL))()).sort(), ['opp_lee', 'opp_won'], "Resinall's: its own and the deal still on \"Resinall, Inc.\" by id");
    assert.deepEqual(ids(runSlice(opps, scope(RESINALL, undone(ACCOUNTS, 'acc_resinall_inc')))()), ['opp_lee'], 'Undo: the old deal leaves again');
    const oldOpps = asWas(opps, [
        ["(o.accountId ? oppAccIds.has(o.accountId) : (o.account||o.accountName||'').toLowerCase() === name.toLowerCase())", "(o.account||o.accountName||'').toLowerCase() === name.toLowerCase()"],
    ]);
    assert.deepEqual(ids(runSlice(oldOpps, scope(unit))()).sort(), ['opp_shell_old', 'opp_shell_site', 'opp_shell_unit'], "the old line: the unit read the site's deal too");
    // Both memos are worked out again when the accounts change (a merge, its Undo).
    assert.ok(r.includes('    }, [selectedAccount, activities, tasks, opportunities, accounts, period, periodCutoff]);'), 'accountEvents');
    assert.ok(r.includes('    }, [selectedAccount, opportunities, accounts, period, periodCutoff]);'), 'accOpps');
});

// ── C3 / C4 / C5 / C6 — Reports ────────────────────────────────────────────

const REPORTS = 'src/Tabs/ReportsTab.jsx';

test("C3 — Reports → Activity History: the Account history and Contact history pickers list no merged-away record, for an Admin and for a rep (run as written)", () => {
    const r = read(REPORTS);
    assert.ok(r.includes("import { unarchived, standsFor, accountOfDeal } from '../utils/pickLink.js';"));
    const acc = memoOf(r, 'ActivityHistoryTab', 'visibleAccounts');
    const con = memoOf(r, 'ActivityHistoryTab', 'visibleContacts');
    const settings = { users: [{ name: 'Karen', team: null }] };
    const as = (seesAllRecords, list, key) => ({ [key]: list, seesAllRecords, currentUserName: 'Karen', settings, unarchived });
    assert.ok(!ids(runSlice(acc, as(true, ACCOUNTS, 'accounts'))()).includes('acc_resinall_inc'), 'REGRESSION: an Admin\'s Account history lists "Resinall, Inc."');
    assert.deepEqual(ids(runSlice(acc, as(false, ACCOUNTS, 'accounts'))()), ['acc_resinall'], "a rep's: their own, live");
    assert.deepEqual(ids(runSlice(con, as(false, CONTACTS, 'contacts'))()), ['con_lee', 'con_ana', 'con_tia'], 'REGRESSION: Lee Ng twice in Contact history');
    assert.ok(runSlice(con, as(true, undone(CONTACTS, 'con_lee_dup'), 'contacts'))().some((c) => c.id === 'con_lee_dup'), 'Undo: listed again');
    const oldAcc = asWas(acc, [['const all = unarchived(accounts);', 'const all = accounts || [];']]);
    assert.ok(ids(runSlice(oldAcc, as(false, ACCOUNTS, 'accounts'))()).includes('acc_resinall_inc'), 'the old line lists it');
});

test('C4 — Reports → Contact history: the contact a merge kept lists the activities and tasks that still name the one merged into it, and the deals that do; an Undo takes them off (each memo run whole)', () => {
    const r = read(REPORTS);
    const events = memoOf(r, 'ActivityHistoryTab', 'contactEvents');
    const opps = memoOf(r, 'ActivityHistoryTab', 'conOpps');
    const scope = (selectedContact, contacts = CONTACTS) => ({ selectedContact, contacts, opportunities: DEALS, activities: ACTIVITIES, tasks: TASKS,
        standsFor, linkedToContact, inPeriod: () => true, taskDay, lossBucketOf: () => '' });
    const eventIds = (evs) => evs.map((e) => e.id).sort();
    assert.deepEqual(eventIds(runSlice(events, scope(LEE))()), ['act_act_lee', 'act_act_orphan', 'opp_open_opp_lee', 'task_task_chip'],
        "REGRESSION: the survivor's history misses the call and the task that still name the Lee merged into it");
    assert.deepEqual(ids(runSlice(opps, scope(LEE))()), ['opp_lee'], 'and the deal naming him');
    const back = undone(CONTACTS, 'con_lee_dup');
    assert.deepEqual(eventIds(runSlice(events, scope(LEE, back))()), ['act_act_lee'], 'Undo: the restored Lee holds them again');
    assert.deepEqual(ids(runSlice(opps, scope(LEE, back))()), []);
    const oldEvents = asWas(events, [
        ['const cIds = [...standsFor(selectedContact, contacts)];', 'const cId = selectedContact.id;'],
        ['return ids.some(id => cIds.includes(id));', 'return ids.includes(cId);'],
        ['if (!cIds.some(id => linkedToContact(a, id, conOppIds))) return;', 'if (!linkedToContact(a, cId, conOppIds)) return;'],
        ['if (!cIds.some(id => linkedToContact(t, id, conOppIds))) return;', 'if (!linkedToContact(t, cId, conOppIds)) return;'],
    ]);
    assert.deepEqual(eventIds(runSlice(oldEvents, scope(LEE))()), ['act_act_lee'], 'the old lines: only his own');
    assert.ok(r.includes('    }, [selectedContact, activities, tasks, opportunities, contacts, period, periodCutoff]);'), 'contactEvents: again when the contacts change');
    assert.ok(r.includes('    }, [selectedContact, opportunities, contacts, period, periodCutoff]);'), 'conOpps');
});

test('C5 — Reports → "Select contacts to add to this deal" offers no merged-away contact (the hand-off and the panel\'s list, run)', () => {
    const r = read(REPORTS);
    const ATTR = S(48) + 'allContacts={unarchived(contacts)}';
    once(code(r), ATTR);
    const handed = runSlice(ATTR.trim().slice('allContacts={'.length, -1), { unarchived, contacts: CONTACTS });
    const available = initOf(r, 'AddContactToOppPanel', 'available');
    const offer = (allContacts) => ids(runSlice(available, { allContacts, alreadyIds: new Set(['con_bo']), search: '' }));
    assert.deepEqual(offer(handed), ['con_lee', 'con_ana', 'con_tia'], 'REGRESSION: the add panel offers the merged-away Lee Ng');
    assert.ok(offer(CONTACTS || []).includes('con_lee_dup'), 'the old hand-off (contacts || []) offered him');
});

test("C6 — Reports → Opportunity history's account panel is the deal's own account by its link — one merged away as its survivor, an old deal with none the later live twin — never a merged-away twin by name (run as written)", () => {
    const r = code(read(REPORTS));
    const LINE = S(16) + 'const selectedAccount = selectedOpp ? accountOfDeal(selectedOpp, accounts) : null;';
    const OLD = "const selectedAccount = selectedOpp ? (accounts||[]).find(a => (a.name||'').toLowerCase() === (selectedOpp.account||'').toLowerCase()) : null;";
    once(r, LINE);
    const panel = (selectedOpp, line = LINE) => run([line], ['accountOfDeal', 'selectedOpp', 'accounts'], [accountOfDeal, selectedOpp, ACCOUNTS], 'selectedAccount')?.id ?? null;
    const deal = (id) => DEALS.find((d) => d.id === id);
    assert.equal(panel(deal('opp_lafayette')), 'acc_lafayette', 'REGRESSION: the merged-away Lafayette twin (listed first) shown as the deal\'s account');
    assert.equal(panel(deal('opp_lafayette'), OLD), 'acc_lafayette_dup', 'the old line took it');
    assert.equal(panel(deal('opp_shell_site')), 'acc_shell_site', 'by id: the site, not the unit of the same name');
    assert.equal(panel(deal('opp_shell_site'), OLD), 'acc_shell_unit', 'the old line took the first of the name');
    assert.equal(panel(deal('opp_won')), 'acc_resinall', 'a deal still on "Resinall, Inc." shows Resinall');
    assert.equal(panel(null), null);
});

// ── C7 — the document link picker ──────────────────────────────────────────

const PICKER = 'src/components/documents/DocumentLinkPicker.jsx';

test('C7 — the document link picker offers no merged-away account or contact; a link the document holds that the offer leaves out is drawn under "Already linked", ticked, saying why (run as written)', () => {
    const p = read(PICKER);
    assert.ok(p.includes("import { unarchived, survivorOf, isMergeArchived, HIDDEN_ACCOUNT, HIDDEN_DEAL } from '../../utils/pickLink.js';"));
    const c = code(p);
    for (const l of [
        S(8) + 'accounts: allAccounts = [], contacts: allContacts = [], opportunities = [], tasks = [], activities = [],',
        S(4) + 'const accounts = useMemo(() => unarchived(allAccounts), [allAccounts]);',
        S(4) + 'const contacts = useMemo(() => unarchived(allContacts), [allContacts]);',
    ]) once(c, l);
    order(c, S(4) + 'const accounts = useMemo(() => unarchived(allAccounts), [allAccounts]);', S(4) + 'const candidates = useMemo(() => {', S(4) + 'const heldRows = useMemo(() => {', S(4) + 'if (!showDocLinkPicker) return null;');
    const accounts = unarchived(ACCOUNTS);
    const contacts = unarchived(CONTACTS);
    const builder = memoOf(p, 'DocumentLinkPicker', 'candidates');
    const join = (parts) => parts.filter(Boolean).join(' · ');
    const build = (a, k) => runSlice(builder, { accounts: a, contacts: k, opportunities: [], tasks: [], activities: [], join, money: () => null, fmtDate: (d) => d })();
    const offered = build(accounts, contacts).map((x) => x.recordId);
    assert.ok(!offered.includes('acc_resinall_inc') && !offered.includes('con_lee_dup'), 'REGRESSION: the picker offers a merged-away account or contact');
    const old = build(ACCOUNTS, CONTACTS).map((x) => x.recordId);
    assert.ok(old.includes('acc_resinall_inc') && old.includes('con_lee_dup'), 'the builder on the whole lists (as it stood) offered both');
    // The held links: one merged away, one the list does not hold, one live (offered, so no held row).
    const CANT_OPEN = runSlice(initOf(p, null, 'CANT_OPEN'), { HIDDEN_ACCOUNT, HIDDEN_DEAL });
    const heldLinkSub = runSlice(initOf(p, null, 'heldLinkSub'), { isMergeArchived, survivorOf, CANT_OPEN });
    const candidates = build(accounts, contacts);
    const ctx = { currentLinks: [
        { type: 'account', recordId: 'acc_resinall_inc', name: 'Resinall, Inc.', id: 'dl_1' },
        { type: 'account', recordId: 'acc_elsewhere', name: '', id: 'dl_2' },
        { type: 'contact', recordId: 'con_lee_dup', name: 'Lee Ng', id: 'dl_3' },
        { type: 'opportunity', recordId: 'opp_out', name: 'Their deal', id: 'dl_4' },
        { type: 'account', recordId: 'acc_resinall', name: 'Resinall', id: 'dl_5' },
    ] };
    const held = (allAccounts, allContacts) => runSlice(memoOf(p, 'DocumentLinkPicker', 'heldRows'), { ctx, candidates, allAccounts, allContacts, heldLinkSub })();
    assert.deepEqual(held(ACCOUNTS, CONTACTS).map((x) => `${x.key} | ${x.name} | ${x.sub}`), [
        'account:acc_resinall_inc | Resinall, Inc. | Merged into “Resinall”',
        "account:acc_elsewhere | An account you can't open | ",
        'contact:con_lee_dup | Lee Ng | Merged into “Lee Ng”',
        "opportunity:opp_out | Their deal | A deal you can't open",
    ], 'REGRESSION: a held link the offer leaves out is only counted in "N linked" — it cannot be unticked');
    assert.equal(heldLinkSub({ type: 'account', recordId: 'acc_resinall_inc' }, ACCOUNTS.filter((a) => a.id !== 'acc_resinall'), []), 'Merged into another account');
    assert.equal(heldLinkSub({ type: 'task', recordId: 't' }, [], []), "A task you can't open");
    // Drawn above the groups, ticked by the selection, with the one row component (module scope).
    order(c, S(20) + '{heldRows.length > 0 && (', S(28) + '<div style={groupHead}>Already linked</div>',
        S(28) + '{heldRows.map((c) => <LinkRow key={c.key} c={c} on={!!selected[c.key]} onToggle={toggle} />)}', S(20) + '{grouped.length === 0 ? (');
    assert.equal(count(c, '<LinkRow key={c.key} c={c} on={!!selected[c.key]} onToggle={toggle} />'), 2, 'the held rows and the groups draw the same row');
    assert.ok(c.split('\n').some((l) => l.startsWith('const LinkRow = ({ c, on, onToggle }) => (')), 'module scope');
});

// ── C8 / C9 — Dispatch ─────────────────────────────────────────────────────

const DISPATCH = 'src/Tabs/DispatchTab.jsx';

test('C8 — Dispatch → New Job → Customer: no merged-away account offered; a name only one has offers no Create, the line under the field names the account to pick, and Save Job refuses it — unless a dispatch customer has the name (run as written)', () => {
    const d = code(read(DISPATCH));
    assert.ok(d.includes("import { isMergeArchived, resolveLink, linkRefusal, unarchived, heldAccountOption } from '../utils/pickLink.js';"));
    const ROWS = [
        S(4) + 'const { shown: acctMatches, more: acctMore } = matchSearch((accounts || [])',
        S(8) + ".filter(a => !isMergeArchived(a) && !linkedAccountIds.has(a.id) && !linkedNames.has((a.name || '').trim().toLowerCase())), query, byName);",
    ];
    order(d, ...ROWS);
    const rows = (query) => ids(run(ROWS, ['matchSearch', 'isMergeArchived', 'accounts', 'linkedAccountIds', 'linkedNames', 'query', 'byName'],
        [matchSearch, isMergeArchived, ACCOUNTS, new Set(), new Set(), query, { text: (x) => x.name, limit: 6 }], 'acctMatches'));
    assert.deepEqual(rows('Resinall'), ['acc_resinall'], 'REGRESSION: "CRM accounts — not yet in Dispatch" lists "Resinall, Inc."');
    const mergedAwayName = runSlice(initOf(read(DISPATCH), null, 'mergedAwayName'), { resolveLink, searchKey });
    const gone = mergedAwayName('Resinall, Inc.', [], ACCOUNTS);
    assert.equal(linkRefusal(gone), '“Resinall, Inc.” was merged into “Resinall” — pick “Resinall”.');
    assert.equal(linkRefusal(mergedAwayName('resinall inc', [], ACCOUNTS)), '“resinall inc” was merged into “Resinall” — pick “Resinall”.', 'the text as typed, as the account picker words it');
    assert.equal(mergedAwayName('Resinall, Inc.', [{ name: 'Resinall Inc' }], ACCOUNTS), null, 'a dispatch customer has the name: it is that customer\'s to pick');
    assert.equal(mergedAwayName('Resinall', [], ACCOUNTS), null, 'a live name');
    assert.equal(mergedAwayName('Brand New Co', [], ACCOUNTS), null, 'a new name: Create, as before');
    assert.equal(mergedAwayName('Resinall, Inc.', [], undone(ACCOUNTS, 'acc_resinall_inc')), null, 'Undo: a live account again');
    // The field: no Create, the line under it.
    once(d, S(4) + 'const merged = q ? mergedAwayName(query, customers, accounts) : null;');
    once(d, S(20) + "{merged ? linkRefusal(merged) : 'New customer — will be created on save'}");
    once(d, S(20) + '{showCreate && !merged && (');
    // Save Job: refused in the same words, nothing sent.
    const SAVE = [
        S(8) + 'const gone = !newJobForm.customerId && !newJobForm.accountId ? mergedAwayName(custName, customers, accounts) : null;',
        S(8) + 'if (gone) { setNewJobError(linkRefusal(gone)); return; }',
    ];
    order(d, S(8) + "if (address && !city) { setNewJobError('City is required when a job address is entered.'); return; }", ...SAVE, S(8) + 'setNewJobSaving(true);');
    const save = (custName, form = {}) => {
        let said = null;
        const out = run(SAVE, ['newJobForm', 'mergedAwayName', 'custName', 'customers', 'accounts', 'setNewJobError', 'linkRefusal'],
            [form, mergedAwayName, custName, [], ACCOUNTS, (m) => { said = m; }, linkRefusal], "'sent'");
        return [out ?? 'refused', said];
    };
    assert.deepEqual(save('Resinall, Inc.'), ['refused', '“Resinall, Inc.” was merged into “Resinall” — pick “Resinall”.'], 'REGRESSION: Save Job makes a second customer for Resinall');
    assert.deepEqual(save('Resinall, Inc.', { customerId: 'dcust_1' }), ['sent', null], 'a customer picked');
    assert.deepEqual(save('Brand New Co'), ['sent', null]);
    // The line as it stood offered the row.
    const OLD_ROWS = [ROWS[0], S(8) + ".filter(a => !linkedAccountIds.has(a.id) && !linkedNames.has((a.name || '').trim().toLowerCase())), query, byName);"];
    assert.ok(ids(run(OLD_ROWS, ['matchSearch', 'accounts', 'linkedAccountIds', 'linkedNames', 'query', 'byName'],
        [matchSearch, ACCOUNTS, new Set(), new Set(), 'Resinall', { text: (x) => x.name, limit: 6 }], 'acctMatches')).includes('acc_resinall_inc'), 'the old line');
});

test('C9 — Dispatch → a customer\'s "Linked CRM account": no merged-away account offered; a link to one shows as itself, disabled, with its note — never "— Not linked —" — and offers no address to copy; the record view\'s chip says the same (run as written)', () => {
    const d = code(read(DISPATCH));
    const HOST = [
        S(4) + 'const draftHeld = draft ? heldAccountOption(draft.accountId, accounts) : null;',
        S(4) + 'const selHeld = selected ? heldAccountOption(selected.accountId, accounts) : null;',
    ];
    order(d, S(4) + 'const draftAccount = draft && draft.accountId ? (accounts || []).find(a => a.id === draft.accountId) : null;', ...HOST);
    const host = (draft, selected) => run(HOST, ['draft', 'selected', 'heldAccountOption', 'accounts'], [draft, selected, heldAccountOption, ACCOUNTS], '{ draftHeld, selHeld }');
    const h = host({ accountId: 'acc_resinall_inc' }, { accountId: 'acc_gone' });
    assert.equal(h.draftHeld.label, 'Resinall, Inc. (merged into Resinall)');
    assert.equal(h.selHeld.label, HIDDEN_ACCOUNT, "one the list does not hold");
    assert.deepEqual(host({ accountId: 'acc_resinall' }, null), { draftHeld: null, selHeld: null }, 'a live link: the options hold it');
    // The hand-off: no retired record's address.
    const HAND = 'heldLink={draftHeld} linkedAccount={draftAccount && !isMergeArchived(draftAccount) ? draftAccount : null} copyFromAccount={copyFromAccount}';
    assert.equal(count(d, HAND), 1);
    const linked = (draftAccount) => runSlice('draftAccount && !isMergeArchived(draftAccount) ? draftAccount : null', { draftAccount, isMergeArchived });
    assert.equal(linked(ACCOUNTS[1]), null, 'REGRESSION: "copy address" offers the merged-away account\'s address');
    assert.equal(linked(RESINALL), RESINALL);
    // The options: "— Not linked —", the held link disabled, then the live accounts; its note under the select.
    order(d,
        S(20) + '<option value="">— Not linked —</option>',
        S(20) + '{heldLink && <option value={draft.accountId} disabled>{heldLink.label}</option>}',
        S(20) + '{unarchived(accounts).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}',
        S(16) + '</select>',
        S(16) + '{heldLink?.note && <div style={{ marginTop: 5, fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>{heldLink.note}</div>}',
    );
    assert.ok(!d.includes('{(accounts || []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}'), 'REGRESSION: the select offers every account, merged-away included');
    assert.ok(d.includes('const CustomerEditForm = ({ draft, set, accounts, techs, plans, propertyTypes, planOnDraft, linkedAccount, heldLink, copyFromAccount,'));
    // The record view's chip.
    once(d, S(36) + '{(linkedAccount || selHeld) && (');
    assert.equal(count(d, 'Linked to account · {selHeld ? selHeld.label : linkedAccount.name}'), 1);
    const chip = (linkedAccount, selHeld) => runSlice('selHeld ? selHeld.label : linkedAccount.name', { linkedAccount, selHeld });
    assert.equal(chip(ACCOUNTS[1], heldAccountOption('acc_resinall_inc', ACCOUNTS)), 'Resinall, Inc. (merged into Resinall)', 'REGRESSION: the chip names a merged-away link as live');
    assert.equal(chip(RESINALL, null), 'Resinall');
});

// ── C10 — the meeting prep panel ───────────────────────────────────────────

test("C10 — the meeting prep panel's five contacts are live: a merged-away duplicate takes no slot (run as written)", () => {
    const m = code(read('src/components/layout/MeetingPrepPanel.jsx'));
    assert.ok(m.includes("import { unarchived } from '../../utils/pickLink.js';"));
    const LINES = [
        S(4) + 'const matchedContacts = matchedOpp',
        S(8) + "? unarchived(contacts).filter(c => c.company?.toLowerCase() === (matchedOpp.account || '').toLowerCase() || c.accountId === (matchedOpp.accountId || ''))",
        S(12) + '.slice(0, 5)',
        S(8) + ': [];',
    ];
    order(m, ...LINES);
    const five = (contacts, lines = LINES) => ids(run(lines, ['unarchived', 'contacts', 'matchedOpp'], [unarchived, contacts, DEALS.find((o) => o.id === 'opp_lee')], 'matchedContacts'));
    assert.deepEqual(five(CONTACTS), ['con_lee', 'con_ana', 'con_tia'], 'REGRESSION: the merged-away Lee Ng takes a slot');
    const old = [LINES[0], S(8) + "? (contacts || []).filter(c => c.company?.toLowerCase() === (matchedOpp.account || '').toLowerCase() || c.accountId === (matchedOpp.accountId || ''))", LINES[2], LINES[3]];
    assert.ok(five(CONTACTS, old).includes('con_lee_dup'), 'the old line');
});

// ── C11 / C12 / C13 — the record a merge kept shows what still names the one merged into it ──

test("C11 — a contact's rail: the contact a merge kept lists the activity still naming the one merged into it; an Undo takes it off (run as written)", () => {
    const c = code(read('src/components/rails/ContactRail.jsx'));
    assert.ok(c.includes("import { standsFor } from '../../utils/pickLink.js';"));
    const LINES = [
        S(4) + 'const ownIds = standsFor(contact, contacts);',
        S(4) + 'const contactActivities = (activities || []).filter(a => {',
        S(8) + 'if (!contact) return false;',
        S(8) + 'if (a.contactId && ownIds.has(a.contactId)) return true;',
        S(8) + 'if (Array.isArray(a.contactIds) && a.contactIds.some(id => ownIds.has(id))) return true;',
        S(8) + 'const involvedOppIds = openOpps.map(o => o.id);',
        S(8) + 'return a.opportunityId && involvedOppIds.includes(a.opportunityId);',
        S(4) + "}).sort((a, b) => new Date(b.date || '2000') - new Date(a.date || '2000'));",
    ];
    order(c, ...LINES);
    const listed = (contact, contacts = CONTACTS) => ids(run(LINES, ['standsFor', 'contact', 'contacts', 'activities', 'openOpps'], [standsFor, contact, contacts, ACTIVITIES, []], 'contactActivities'));
    assert.deepEqual(listed(LEE), ['act_lee', 'act_orphan'], "REGRESSION: the survivor's Activity History misses the call still naming the Lee merged into it");
    assert.deepEqual(listed(LEE, undone(CONTACTS, 'con_lee_dup')), ['act_lee'], 'Undo: off again');
    assert.deepEqual(listed(CONTACTS[2]), ['act_orphan'], "Ana's own, as before");
    assert.deepEqual(listed(null), []);
});

test("C12 — an account's or contact's Documents tab lists a document linked to a record merged into it, and its Unlink takes off every such link, stopping at a refusal; an Undo takes it off the list (each memo and the Unlink run)", async () => {
    const src = read('src/components/documents/RecordDocuments.jsx');
    assert.ok(src.includes("import { standsFor } from '../../utils/pickLink.js';"));
    once(code(src), S(8) + 'accounts = [], contacts = [],');
    const idsMemo = memoOf(src, 'RecordDocuments', 'ids');
    const docsMemo = memoOf(src, 'RecordDocuments', 'docs');
    const DOCS = [
        { id: 'doc_old', links: [{ id: 'dl_old', type: 'account', recordId: 'acc_resinall_inc' }] },
        { id: 'doc_both', links: [{ id: 'dl_a', type: 'account', recordId: 'acc_resinall' }, { id: 'dl_b', type: 'account', recordId: 'acc_resinall_inc' }] },
        { id: 'doc_other', links: [{ id: 'dl_c', type: 'account', recordId: 'acc_evonik' }] },
        { id: 'doc_lee', links: [{ id: 'dl_l', type: 'contact', recordId: 'con_lee_dup' }] },
    ];
    const tab = (recordType, recordId, accounts = ACCOUNTS, contacts = CONTACTS) => {
        const ids = runSlice(idsMemo, { recordType, recordId, accounts, contacts, standsFor })();
        return { ids, docs: runSlice(docsMemo, { documents: DOCS, recordType, ids })() };
    };
    assert.deepEqual(tab('account', 'acc_resinall').docs.map((d) => d.id), ['doc_old', 'doc_both'], 'REGRESSION: Resinall\'s Documents tab misses the document attached to "Resinall, Inc."');
    assert.deepEqual(tab('contact', 'con_lee').docs.map((d) => d.id), ['doc_lee'], 'contacts alike');
    assert.deepEqual(tab('account', 'acc_resinall', undone(ACCOUNTS, 'acc_resinall_inc')).docs.map((d) => d.id), ['doc_both'], 'Undo: off again');
    assert.deepEqual(tab('account', 'acc_resinall', ACCOUNTS.filter((a) => a.id !== 'acc_resinall_inc')).docs.map((d) => d.id), ['doc_both'], "a rep whose list lacks the record merged away: its own links only");
    assert.deepEqual(tab('opportunity', 'opp_won').docs, [], 'a deal stands for itself');
    const OLD = "() => documents.filter((d) => (d.links || []).some((l) => l.type === recordType && l.recordId === recordId))";
    assert.deepEqual(runSlice(OLD, { documents: DOCS, recordType: 'account', recordId: 'acc_resinall' })().map((d) => d.id), ['doc_both'], 'the old memo: by its own id alone');
    // Unlink: every link of the document to the records this one stands for, stopping at a refusal.
    const unlinkText = initOf(src, 'RecordDocuments', 'unlinkHere');
    const unlink = async (doc, answers) => {
        const calls = [];
        const unlinkDocument = async (docId, linkId) => { calls.push(`${docId}/${linkId}`); return { ok: answers.shift() ?? true }; };
        await runSlice(unlinkText, { recordType: 'account', ids: tab('account', 'acc_resinall').ids, unlinkDocument })(doc);
        return calls;
    };
    assert.deepEqual(await unlink(DOCS[1], []), ['doc_both/dl_a', 'doc_both/dl_b'], 'both links off');
    assert.deepEqual(await unlink(DOCS[1], [false]), ['doc_both/dl_a'], 'a refusal stops it');
    assert.deepEqual(await unlink(DOCS[2], []), [], 'nothing of this record');
});

test("C13 — an account's rail: a contact linked by id to an account merged into this one is in its People list and CONTACTS, and its activities roll up here; an Undo gives it back (run as written)", () => {
    const rail = code(read('src/components/rails/AccountRail.jsx'));
    assert.ok(rail.includes("import { standsFor } from '../../utils/pickLink.js';"));
    const LINES = [
        S(4) + 'const ownAccountIds = standsFor(account, accounts);',
        S(4) + 'const accountContacts = (contacts || []).filter(c =>',
        S(8) + 'c.accountId ? ownAccountIds.has(c.accountId) : (c.company === account?.name)',
        S(4) + ');',
        S(4) + 'const shownContacts = unarchived(accountContacts);',
    ];
    order(rail, ...LINES);
    const people = (accounts) => run(LINES, ['standsFor', 'unarchived', 'account', 'accounts', 'contacts'], [standsFor, unarchived, RESINALL, accounts, CONTACTS], '{ accountContacts, shownContacts }');
    const p = people(ACCOUNTS);
    assert.deepEqual(ids(p.shownContacts), ['con_lee', 'con_ana', 'con_tia'], 'REGRESSION: Tia, linked by id to "Resinall, Inc.", is in no People list once it is merged away');
    assert.ok(ids(p.accountContacts).includes('con_lee_dup'), 'the whole list keeps the merged-away Lee: the Activity tab reads it (T4)');
    assert.deepEqual(ids(people(undone(ACCOUNTS, 'acc_resinall_inc')).shownContacts), ['con_lee', 'con_ana'], 'Undo: Tia back on "Resinall, Inc."');
    const old = run([LINES[1], S(8) + 'c.accountId ? c.accountId === account?.id : (c.company === account?.name)', LINES[3]], ['account', 'contacts'], [RESINALL, CONTACTS], 'accountContacts');
    assert.ok(!ids(old).includes('con_tia'), 'the old line left her out');
});

test('C-self — the suites: this file is graded by the harness', () => {
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/merged-away-cleanup.test.mjs'), 'SUITES runs this file');
});
