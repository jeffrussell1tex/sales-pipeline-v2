// tests/merged-away-lists.test.mjs
//
// A merged-away account or contact leaves the lists the screens draw (state §0.206 — OPEN_ITEMS §1 item 1). Jeff,
// 16 Oct, after merging UKG's "Resinall, Inc." into "Resinall": "It said it did it but both still show on the account
// list"; "Hide them" — merged-away accounts leave the Accounts tab and Sub-Accounts, the record kept (its Undo, state
// §0.207, and the links that resolve through it); "Right after 4b-2c" — a batch of its own, the Contacts tab checked
// for the same gap with it; "Hide contacts too" — merged-away contacts leave the Contacts tab, an account's People list
// and the contact counts, in the same batch. The other lists, counts and pickers are the cleanup batch's ("One cleanup
// batch next"; 18 Oct: "Three steps"): THE GUARD made class-wide first (state §0.208, tests only — T8-T10 here), then
// every other screen (§0.209), then the public API, the quote email and the numbers (§0.210) — both
// tests/merged-away-cleanup.test.mjs's.
//
// Before: a merge stored the record merged away (merge_archived, merged_into_id, archived_at), and the merge hook
// dropped it from the screen — then read the list again, and the accounts and contacts GETs answer every row of the
// org, so it came straight back. Since §0.198 the pickers left it out (unarchived) — all but four, until the cleanup
// batch's screens step (§0.209: the document link picker, Dispatch's two account pickers and Reports' "Select contacts to
// add to this deal"); no list did: the Accounts tab, an account's Sub-Accounts (the tab's badge and drawer, the rail's
// section), the Contacts tab, an account's People list and the contact counts beside them.
//
// Now each of those screens draws its list through unarchived / isMergeArchived (src/utils/pickLink.js). The app's
// `accounts` and `contacts` — both GETs, both hooks' loads, the context that hands them on — keep every row: a link
// to a merged-away record names its survivor through it, the account picker offers no Create for the name the merge
// removed, the import names a parent through it, and the Admin's one-request clear of the contacts compares the
// whole list — so a Select all of the listed contacts never clears a merged-away one (useContacts.js).
//
// Run here, on made-up rows in the shapes Jeff met (Resinall and "Resinall, Inc."; Evonik's two Lafayette sites, one
// merged into the other): each screen's list, read from its file and run as written — and the lines as they stood
// before (10aa4b5), run once on the same rows, so the rows are seen to tell the two apart. THE GUARD (T8, class-wide
// since §0.208; T9 runs its rules on made-up components; T10 the server's): a parse of every file that takes the app's
// lists through useApp(), and of every component a list is handed to, holds each read of the app's whole lists to a
// shape that leaves merged-away rows out or resolves a link through them, or to a read named with its reason; App.jsx
// and the list hooks are pinned, and every function that reads either table is named, its selects counted. The
// mutation harness's breaks it alone holds: five since §0.206 (the Accounts tab's Signal sort and "Needs attention"
// lane, the Contacts tab's Company view, name-sorted rows and header count) and seven since §0.208 (a lookup by name in
// the task rail, the activity viewer and Dispatch's record view; the deal window's rail counting the whole list; a
// contact read through the automations' whole-context hand-off; the Company card counting its rollup's contacts; a
// function newly reading the contacts table). Pinned, line for line: every other line the harness breaks — it runs the
// unit suites only (scripts/mutate-import.mjs) — and the layers that must keep the rows, each GET's code whole. No
// server code changed in §0.206 or §0.208: neither has an integration suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { posix } from 'node:path';
import { parse } from '@babel/parser';
import { unarchived, isMergeArchived, resolveLink, standsFor } from '../src/utils/pickLink.js';
import { linkedAccount, outOfList } from '../src/utils/railLinks.js';
import { chipLabel } from '../src/utils/taskLinks.js';

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
const ids = (rows) => rows.map((r) => r.id);
const useMemo = (f) => f();
// A tab's scope line, run as written: useState hands back what its initialiser reads; localStorage holds `stored` under
// `key` alone.
const scopeOf = (line, key, stored) => run([line], ['useState', 'localStorage'],
    [(init) => [init(), () => {}], { getItem: (k) => (k === key ? stored : null) }], 'scope');

// Made-up rows. "Resinall, Inc." merged into "Resinall" (top level); Evonik's two Lafayette sites, one merged into the
// other; a row whose merge was undone (merge.mjs's reverse sets mergeArchived false); a row with no mark at all; a
// sub-account under the legacy `parentId` key.
const ACCOUNTS = Object.freeze([
    { id: 'acc_resinall', name: 'Resinall', parentAccountId: null, ownerId: 'usr_karen', mergeArchived: false },
    { id: 'acc_resinall_inc', name: 'Resinall, Inc.', parentAccountId: null, ownerId: 'usr_karen', mergeArchived: true, mergedIntoId: 'acc_resinall' },
    { id: 'acc_evonik', name: 'Evonik', parentAccountId: null, ownerId: 'usr_ravi', mergeArchived: false },
    { id: 'acc_lafayette', name: 'Evonik - Lafayette', parentAccountId: 'acc_evonik', ownerId: 'usr_ravi', mergeArchived: false },
    { id: 'acc_lafayette_dup', name: 'Evonik - Lafayette', parentAccountId: 'acc_evonik', ownerId: 'usr_ravi', mergeArchived: true, mergedIntoId: 'acc_lafayette' },
    { id: 'acc_mobile', name: 'Evonik - Mobile', parentAccountId: 'acc_evonik', ownerId: null, mergeArchived: null },
    { id: 'acc_legacy', name: 'Evonik - Legacy', parentId: 'acc_evonik', ownerId: null },
    { id: 'acc_open', name: 'Open Co', parentAccountId: null, ownerId: null, mergeArchived: false },
    { id: 'acc_undone', name: 'Undone Co', parentAccountId: null, ownerId: 'usr_ravi', mergeArchived: false, mergedIntoId: null },
]);
// App.jsx's visibleAccounts for an Admin: the top level, every owner.
const TOP = ACCOUNTS.filter((a) => !a.parentAccountId && !a.parentId);
// Lee Ng twice under Resinall, one merged into the other; an unassigned contact; one on Evonik's live site.
const CONTACTS = Object.freeze([
    { id: 'con_lee', firstName: 'Lee', lastName: 'Ng', company: 'Resinall', accountId: 'acc_resinall', ownerId: 'usr_karen' },
    { id: 'con_lee_dup', firstName: 'Lee', lastName: 'Ng', company: 'Resinall', accountId: 'acc_resinall', ownerId: 'usr_karen', mergeArchived: true, mergedIntoId: 'con_lee' },
    { id: 'con_ana', firstName: 'Ana', lastName: 'Ruiz', company: 'Resinall', accountId: null, ownerId: null },
    { id: 'con_bo', firstName: 'Bo', lastName: 'Kim', company: 'Evonik - Lafayette', accountId: 'acc_lafayette', ownerId: 'usr_ravi' },
]);

// The lines as they stood before §0.206 (10aa4b5), run once: the rows tell the versions apart.
const OLD_TAB_LIST = [
    ind(4, "const visibleAccounts = useMemo(() => scope === 'mine'"),
    ind(8, '? allVisibleAccounts.filter(r => !r.ownerId || r.ownerId === currentUserId)'),
    ind(8, ': allVisibleAccounts, [scope, allVisibleAccounts, currentUserId]);'),
];
const OLD_CT_LIST = [
    ind(4, "const visibleContacts = useMemo(() => scope === 'mine'"),
    ind(8, '? allVisibleContacts.filter(r => !r.ownerId || r.ownerId === currentUserId)'),
    ind(8, ': allVisibleContacts, [scope, allVisibleContacts, currentUserId]);'),
];
const OLD_SUBS = ind(4, 'const getSubAccounts = (accountId) => (accounts || []).filter(a => (a.parentAccountId || a.parentId) === accountId);');
const OLD_RAIL_SUBS = [
    ind(4, 'const subAccounts = (accounts || []).filter(a =>'),
    ind(8, '(a.parentAccountId || a.parentId) === accountRailId'),
    ind(4, ');'),
];

// ── the Accounts tab ────────────────────────────────────────────────────────

const TAB_LIST = [
    ind(4, 'const visibleAccounts = useMemo(() => {'),
    ind(8, 'const live = unarchived(allVisibleAccounts);'),
    ind(8, "return scope === 'mine' ? live.filter(r => !r.ownerId || r.ownerId === currentUserId) : live;"),
    ind(4, '}, [scope, allVisibleAccounts, currentUserId]);'),
];
const TAB_SCOPE = ind(4, "const [scope, setScope] = useState(() => localStorage.getItem('tab:accounts:scope') === 'all' ? 'all' : 'mine');");

test('T1 — the Accounts tab: a merged-away account is not listed, in All or in Mine (the default scope); one whose merge was undone is; every view, count, filter, Select all and Export read this one list (run as written)', () => {
    const tab = code(read('src/Tabs/AccountsTab.jsx'));
    assert.ok(tab.includes("import { unarchived } from '../utils/pickLink.js';"));
    order(tab, ...TAB_LIST);
    once(tab, TAB_LIST[1]);
    const listed = (scope, currentUserId, allVisibleAccounts) => ids(run(TAB_LIST,
        ['useMemo', 'unarchived', 'scope', 'allVisibleAccounts', 'currentUserId'],
        [useMemo, unarchived, scope, allVisibleAccounts, currentUserId], 'visibleAccounts'));
    assert.deepEqual(listed('all', 'usr_karen', TOP), ['acc_resinall', 'acc_evonik', 'acc_open', 'acc_undone'],
        'REGRESSION: "Resinall, Inc." listed beside "Resinall" after the merge (Jeff, 16 Oct: "both still show on the account list")');
    assert.deepEqual(listed('mine', 'usr_karen', TOP), ['acc_resinall', 'acc_open'],
        'REGRESSION: Mine — the default scope — lists "Resinall, Inc." (her own and the unassigned, none merged away)');
    assert.deepEqual(listed('mine', null, TOP), ['acc_open'], 'no caller yet: the unassigned alone (§0.52)');
    assert.deepEqual(listed('all', 'usr_karen', [TOP[1]]), [], 'only a merged-away account: nothing listed');
    assert.deepEqual(listed('all', 'usr_karen', undefined), [], 'no list yet');
    // The lines as they stood, on the same rows.
    const before = (scope) => ids(run(OLD_TAB_LIST, ['useMemo', 'scope', 'allVisibleAccounts', 'currentUserId'],
        [useMemo, scope, TOP, 'usr_karen'], 'visibleAccounts'));
    assert.ok(before('all').includes('acc_resinall_inc') && before('mine').includes('acc_resinall_inc'),
        'the old lines list "Resinall, Inc." in All and in Mine');
    // Mine is what the tab opens in unless All was picked (an unrecognised stored value reads as Mine, §0.52).
    once(tab, TAB_SCOPE);
    assert.deepEqual([null, 'all', 'All'].map((v) => scopeOf(TAB_SCOPE, 'tab:accounts:scope', v)), ['mine', 'all', 'mine'], 'Mine is the default scope');
    assert.equal(count(tab, 'allVisibleAccounts'), 3, "the context's list is read here alone — its alias, this filter and its deps");
    // The one list feeds the rest of the tab, as it stands; every other read of the app's lists here: THE GUARD (T8).
    for (const line of [
        '        let list = visibleAccounts;',
        '        const c = { all: visibleAccounts.length, hot: 0, warm: 0, cool: 0, cold: 0 };',
        '        visibleAccounts.forEach(acc => { map[acc.id] = getWarmth(acc, opportunities, activities, tasks); });',
        '    const toggleSelectAll = () => setSelectedIds(prev => prev.length === filtered.length ? [] : filtered.map(a => a.id));',
        '        const rows = filtered.map(a => {',
    ]) once(tab, line);
    assert.equal(count(tab, '\n                    accounts={visibleAccounts}\n'), 2, "the filter panel's options, in both its places");
});

// ── the Contacts tab ────────────────────────────────────────────────────────

const CT_LIST = [
    ind(4, 'const visibleContacts = useMemo(() => {'),
    ind(8, 'const live = unarchived(allVisibleContacts);'),
    ind(8, "return scope === 'mine' ? live.filter(r => !r.ownerId || r.ownerId === currentUserId) : live;"),
    ind(4, '}, [scope, allVisibleContacts, currentUserId]);'),
];
const CT_SCOPE = ind(4, "const [scope, setScope] = useState(() => localStorage.getItem('tab:contacts:scope') === 'all' ? 'all' : 'mine');");

test("T2 — the Contacts tab: a merged-away contact is not listed, in All or in Mine (the default scope); its rows, counts, Company view, Select all and Export read this one list — and a Select all never sends the Admin's one-request clear over a merged-away contact (run as written)", () => {
    const tab = code(read('src/Tabs/ContactsTab.jsx'));
    assert.ok(tab.includes("import { unarchived } from '../utils/pickLink.js';"));
    order(tab, ...CT_LIST);
    once(tab, CT_LIST[1]);
    const listed = (scope, currentUserId, allVisibleContacts) => run(CT_LIST,
        ['useMemo', 'unarchived', 'scope', 'allVisibleContacts', 'currentUserId'],
        [useMemo, unarchived, scope, allVisibleContacts, currentUserId], 'visibleContacts');
    assert.deepEqual(ids(listed('all', 'usr_karen', CONTACTS)), ['con_lee', 'con_ana', 'con_bo'],
        'REGRESSION: Lee Ng listed twice after the contact merge');
    assert.deepEqual(ids(listed('mine', 'usr_karen', CONTACTS)), ['con_lee', 'con_ana'],
        'REGRESSION: Mine — the default scope — lists the merged-away Lee Ng (her own and the unassigned, none merged away)');
    assert.deepEqual(ids(listed('all', 'usr_karen', undefined)), [], 'no list yet');
    // The lines as they stood, on the same rows.
    const before = (scope) => ids(run(OLD_CT_LIST, ['useMemo', 'scope', 'allVisibleContacts', 'currentUserId'],
        [useMemo, scope, CONTACTS, 'usr_karen'], 'visibleContacts'));
    assert.ok(before('all').includes('con_lee_dup') && before('mine').includes('con_lee_dup'),
        'the old lines list the merged-away Lee Ng in All and in Mine');
    once(tab, CT_SCOPE);
    assert.deepEqual([null, 'all', 'All'].map((v) => scopeOf(CT_SCOPE, 'tab:contacts:scope', v)), ['mine', 'all', 'mine'], 'Mine is the default scope');
    assert.equal(count(tab, 'allVisibleContacts'), 3, "the context's list is read here alone — its alias, this filter and its deps");
    // The one list feeds the rest of the tab, as it stands; every other read of the app's lists here: THE GUARD (T8).
    for (const line of [
        '        let list = visibleContacts;',
        '    const toggleSelectAll = ()  => setSelectedIds(prev => prev.length === sorted.length ? [] : sorted.map(c => c.id));',
        '    }, [visibleContacts, search, contactsSortBy]);',
    ]) once(tab, line);
    assert.ok(tab.includes('        const csvRows = sorted.map(c => ['), 'Export: the list shown');
    // The hook clears the whole org in one request only when the ids going are as many as the whole loaded list.
    const hook = code(read('src/hooks/useContacts.js'));
    assert.ok(hook.includes('if (opts.admin && !kept.length && goingIds.length === contacts.length) {'), 'the clear compares the whole list');
    const goingIds = ids(listed('all', 'usr_admin', CONTACTS));
    assert.notEqual(goingIds.length, CONTACTS.length, "a Select all of the listed contacts is not the whole list: the merged-away contact is not cleared, and its merge's Undo stays");
});

// ── an account's Sub-Accounts ───────────────────────────────────────────────

const SUBS = ind(4, 'const getSubAccounts = (accountId) => (accounts || []).filter(a => (a.parentAccountId || a.parentId) === accountId && !isMergeArchived(a));');
// The delete's confirm: the sub-accounts the server will move to the top level that the screens list (state §0.210).
const PARENT_OF = ind(8, 'const parentOf = (a) => a.parentAccountId || a.parentId || null;');
const CHILDREN = ind(8, 'const children = accounts.filter(a => goingIds.includes(parentOf(a)) && !goingIds.includes(a.id) && !isMergeArchived(a));');
const OLD_CHILDREN = ind(8, 'const children = accounts.filter(a => goingIds.includes(parentOf(a)) && !goingIds.includes(a.id));');

test("T3 — an account's Sub-Accounts: one merged away is not listed — the tab's badge and drawer, the rail's section and App's rollup read the hook's one rule; the delete's confirm counts the live sub-accounts it moves — the server lifts a merged-away one too, which no list shows (run as written)", () => {
    const hook = code(read('src/hooks/useAccounts.js'));
    assert.ok(hook.includes("import { isMergeArchived } from '../utils/pickLink.js';"));
    once(hook, SUBS);
    const subsOf = (accounts) => run([SUBS], ['accounts', 'isMergeArchived'], [accounts, isMergeArchived], 'getSubAccounts');
    const getSubAccounts = subsOf(ACCOUNTS);
    assert.deepEqual(ids(getSubAccounts('acc_evonik')), ['acc_lafayette', 'acc_mobile', 'acc_legacy'],
        "REGRESSION: Evonik's merged-away Lafayette site listed beside the live one (OPEN_ITEMS §1, \"Also seen\")");
    assert.deepEqual(getSubAccounts('acc_resinall'), [], 'none');
    assert.deepEqual(getSubAccounts('new'), [], 'a new account has none');
    assert.deepEqual(subsOf(undefined)('acc_evonik'), [], 'no list yet');
    assert.ok(ids(run([OLD_SUBS], ['accounts'], [ACCOUNTS], 'getSubAccounts')('acc_evonik')).includes('acc_lafayette_dup'),
        "the old line lists Evonik's merged-away site");
    // accounts.mjs lifts each row naming the deleted account, merged away or not; the confirm counts the live ones —
    // what the Sub-Accounts lists show (state §0.210; Jeff, 18 Oct: "Count what you see"). The Undo puts back what
    // the server answers, never these.
    order(hook, PARENT_OF, CHILDREN);
    once(hook, CHILDREN);
    assert.deepEqual(ids(run([PARENT_OF, CHILDREN], ['accounts', 'goingIds', 'isMergeArchived'], [ACCOUNTS, ['acc_evonik'], isMergeArchived], 'children')),
        ['acc_lafayette', 'acc_mobile', 'acc_legacy'],
        "REGRESSION: the delete's confirm counts a merged-away sub-account no list shows — \"2 sub-accounts will move\" over a drawer of 1");
    assert.ok(ids(run([PARENT_OF, OLD_CHILDREN], ['accounts', 'goingIds'], [ACCOUNTS, ['acc_evonik']], 'children')).includes('acc_lafayette_dup'),
        'the old line counted it');
    const tab = code(read('src/Tabs/AccountsTab.jsx'));
    once(tab, '    const subAccounts = depth === 0 ? getSubAccounts(account.id) : [];');
    assert.ok(tab.includes('onClick={e => { e.stopPropagation(); onOpenDrawer(account, subAccounts); }}'), 'the drawer lists the row\'s own');
    // App takes the hook's rule and hands it on as it is: no copy of the rule between the hook and the screens.
    const app = code(read('src/App.jsx'));
    assert.ok(app.includes('        const subs = getSubAccounts(acc.id);'), "App's rollup");
    assert.ok(app.includes('\n        loadAccounts, getSubAccounts,\n'), 'App takes it from the hook');
    assert.ok(between(app, '    const appContextValue = {', '\n    };').includes('\n        getSubAccounts,\n'),
        "REGRESSION: the context hands the screens a copy of the rule — the tab's badge and drawer and the rail list Evonik's merged-away site");
    assert.equal(count(app, 'getSubAccounts'), 3, 'App names it three times: from the hook, in its rollup, into the context');
});

// ── the account rail ────────────────────────────────────────────────────────

const RAIL_SUBS = ind(4, 'const subAccounts = getSubAccounts(accountRailId);');
// The account's contacts, its whole list (by accountId — this account's, or one merged into it since §0.209 — else by
// company name): the Activity tab's contact ids read it.
const RAIL_OWN = ind(4, 'const ownAccountIds = standsFor(account, accounts);');
const RAIL_CONTACTS = [
    ind(4, 'const accountContacts = (contacts || []).filter(c =>'),
    ind(8, 'c.accountId ? ownAccountIds.has(c.accountId) : (c.company === account?.name)'),
    ind(4, ');'),
];
const RAIL_SHOWN = ind(4, 'const shownContacts = unarchived(accountContacts);');

test("T4 — the account rail: its Sub-Accounts are the hook's; its People list, its heading, its empty line and CONTACTS leave a merged-away contact out, and its Activity tab keeps that contact's activities (run as written)", () => {
    const rail = code(read('src/components/rails/AccountRail.jsx'));
    once(rail, RAIL_SUBS);
    assert.ok(!rail.includes('(a.parentAccountId || a.parentId) === accountRailId'), "REGRESSION: the rail's own copy of the rule (it listed Evonik's merged-away site)");
    assert.ok(between(rail, 'export default function AccountRail', '} = useApp();').includes('\n        getSubAccounts,\n'), 'from the context');
    assert.ok(rail.includes("import { resolveLink, linkRefusal, unarchived, HIDDEN_ACCOUNT } from '../../utils/pickLink.js';"));
    // The rail's line, run with the hook's; then the rail's old copy, on the same rows.
    assert.deepEqual(ids(run([SUBS, RAIL_SUBS], ['accounts', 'isMergeArchived', 'accountRailId'], [ACCOUNTS, isMergeArchived, 'acc_evonik'], 'subAccounts')),
        ['acc_lafayette', 'acc_mobile', 'acc_legacy'], "REGRESSION: the rail lists Evonik's merged-away site");
    assert.ok(ids(run(OLD_RAIL_SUBS, ['accounts', 'accountRailId'], [ACCOUNTS, 'acc_evonik'], 'subAccounts')).includes('acc_lafayette_dup'),
        "the rail's old copy lists it");
    once(rail, RAIL_SHOWN);
    // The account's contacts, the rail's own lines run as written: every one, merged-away included — the Activity tab
    // reads them. The shown list comes after, from them.
    assert.equal(count(rail, `\n${RAIL_CONTACTS.join('\n')}\n`), 1, "the account's contacts: its three lines, together, once");
    order(rail, RAIL_OWN, ...RAIL_CONTACTS, RAIL_SHOWN);
    const accountContacts = run([RAIL_OWN, ...RAIL_CONTACTS], ['standsFor', 'accounts', 'contacts', 'account'], [standsFor, ACCOUNTS, CONTACTS, { id: 'acc_resinall', name: 'Resinall' }], 'accountContacts');
    assert.deepEqual(ids(accountContacts), ['con_lee', 'con_lee_dup', 'con_ana'],
        "REGRESSION: the account's contacts leave a merged-away contact out at their source — its Activity tab drops that contact's activities (their contact ids still name it)");
    assert.deepEqual(ids(run([RAIL_SHOWN], ['unarchived', 'accountContacts'], [unarchived, accountContacts], 'shownContacts')), ['con_lee', 'con_ana'],
        'REGRESSION: Lee Ng listed twice under Resinall after the contact merge');
    // CONTACTS, the People heading ("Contacts (2)" over one row), its empty line (an account whose contacts are all
    // merged away drew nothing), its rows; SUB-ACCTS, and the Sub-Accounts section's test, heading and rows (the
    // re-check, 17 Oct: its rows or its test pointed at the app's whole list passed every suite — Evonik's merged-away
    // site listed again, or "Sub-Accounts (0)" over none). These read the rail's own lists, not the app's: THE GUARD
    // (T8) scans the rail since §0.208, and holds its reads of the app's lists — shapes, or named with their reasons.
    for (const line of [
        "{ label: 'CONTACTS',    value: shownContacts.length },",
        '<SectionHeading label={`Contacts (${shownContacts.length})`} />',
        '{shownContacts.length === 0 ? (',
        '{shownContacts.map(c => (',
        "{ label: 'SUB-ACCTS',   value: subAccounts.length },",
        '{!isEditing && subAccounts.length > 0 && (',
        '<SectionHeading label={`Sub-Accounts (${subAccounts.length})`} />',
        '{subAccounts.map(s => (',
    ]) assert.equal(count(rail, line), 1, line);
    assert.ok(rail.includes('        const acctContactIds = new Set(accountContacts.map(c => c.id));'),
        "the Activity tab keeps a merged-away contact's activities — their contact ids still name it (OPEN_ITEMS §4.7)");
    assert.equal(count(rail, 'accountContacts'), 3, 'the list, the shown list and the Activity tab — nothing draws the whole list');
});

// ── the Accounts tab's contact counts ───────────────────────────────────────

const TAB_SHOWN = ind(4, 'const shownContacts = useMemo(() => unarchived(contacts), [contacts]);');
const ROW_COUNT = ind(4, "const contactCount = contacts.filter(c => (c.company||'').toLowerCase() === (account.name||'').toLowerCase()).length;");

test("T5 — the Accounts tab's contact counts — a row's \"N contacts\", the Sub-accounts drawer's — leave a merged-away contact out (run as written)", () => {
    const tab = code(read('src/Tabs/AccountsTab.jsx'));
    once(tab, TAB_SHOWN);
    once(tab, ROW_COUNT);
    const shownContacts = run([TAB_SHOWN], ['useMemo', 'unarchived', 'contacts'], [useMemo, unarchived, CONTACTS], 'shownContacts');
    const rowCount = (contacts) => run([ROW_COUNT], ['contacts', 'account'], [contacts, { name: 'Resinall' }], 'contactCount');
    assert.equal(rowCount(shownContacts), 2, 'Lee Ng once, Ana Ruiz');
    assert.equal(rowCount(CONTACTS), 3, 'as it read before — the merged-away Lee Ng counted');
    once(tab, '        contacts: shownContacts, getSubAccounts, getWarmthFn: getWarmth,', 'each row counts the shown contacts');
    once(tab, '                    contacts={shownContacts}', 'and the drawer');
    assert.ok(!tab.includes('contacts={contacts}') && !tab.includes('        contacts, getSubAccounts,'), 'REGRESSION: a count over every contact, merged-away included');
});

// ── the record is kept ──────────────────────────────────────────────────────

const LOAD_ACCOUNTS = ind(12, '.then(data => { if (data && stillOrg(askedOrg)) setAccounts(data.accounts || []); })');
const LOAD_CONTACTS = ind(12, '.then(data => { if (data && stillOrg(askedOrg)) setContacts(data.contacts || []); })');
// A load line, run as written on an answer: `chain` stands in for the dbFetch chain before it; `still` for stillOrg.
const load = (line, setter, answer, still = true) => {
    let got = 'not set';
    run(['const answered = chain', line], ['chain', 'stillOrg', 'askedOrg', setter],
        [{ then: (f) => f(answer) }, () => still, 'org_qa', (v) => { got = v; }], 'answered');
    return got;
};
const DROP_ACCOUNT = [
    ind(12, 'setAccounts?.(prev => (prev || [])'),
    ind(16, '.filter(a => a.id !== payload.archivedId)'),
    ind(16, '.map(a => (data.account && a.id === data.account.id) ? data.account : a));'),
];
const DROP_CONTACT = [
    ind(12, 'setContacts?.(prev => (prev || [])'),
    ind(16, '.filter(c => c.id !== payload.archivedId)'),
    ind(16, '.map(c => (data.contact && c.id === data.contact.id) ? data.contact : c));'),
];
// The merge hook's optimistic update, run as written on the rows the screen held.
const dropped = (lines, setter, rows, payload, data) => {
    let got = null;
    run(lines, [setter, 'payload', 'data'], [(f) => { got = f(rows); }, payload, data], 'undefined');
    return got;
};

// A GET's code as it stands (accounts.mjs, contacts.mjs; its comments dropped): every row of the org, then the read
// scope's narrowing — nothing else.
const GET_CODE = (table, sortBy) => [
    "        if (event.httpMethod === 'GET') {",
    `            let results = await db.select().from(${table}).where(eq(${table}.orgId, orgId)).orderBy(asc(${table}.${sortBy}));`,
    '            const readScope = crmReadScope(userRole);',
    "            if (readScope === 'none') {",
    '                results = [];',
    "            } else if (readScope === 'own') {",
    '                const callerId = await getCallerId(userId, orgId);',
    '                results = results.filter(r => !r.ownerId || r.ownerId === callerId);',
    '            }',
    `            return { statusCode: 200, headers, body: JSON.stringify({ ${table}: results }) };`,
].join('\n');

test("T6 — the record is kept: both GETs answer every row of the org, narrowed by the read scope alone (each GET's code, whole), both hooks load every row they are answered, the app's context hands every row on, and the merge hook still drops the row it archived; a link and the account picker read that whole list (run)", () => {
    // Each GET's code, whole: a filter on any column a merge writes (merge_archived, merged_into_id, archived_at) — in
    // the query, on a line of its own or through a helper — changes it. A word list missed archived_at (the review).
    for (const [table, sortBy] of [['accounts', 'name'], ['contacts', 'lastName']]) {
        const get = between(code(read(`netlify/functions/${table}.mjs`)), "        if (event.httpMethod === 'GET') {",
            `            return { statusCode: 200, headers, body: JSON.stringify({ ${table}: results }) };`);
        assert.equal(get, GET_CODE(table, sortBy),
            `REGRESSION: the ${table} GET leaves rows out — a link to a merged-away one reads "can't open", the picker offers Create for the name a merge removed${table === 'contacts' ? ", and an Admin's Select all + Delete equals the whole list and sends clear=true, deleting them (their Undo lost)" : ''} (guide §18b99)`);
    }
    // The load keeps every row the GET answers, and the context hands the whole lists on: a filter at either layer
    // passes every other pin and brings back every break the GET pins name.
    once(code(read('src/hooks/useAccounts.js')), LOAD_ACCOUNTS,
        "REGRESSION: the accounts load leaves rows out — a link to a merged-away account reads \"can't open\", the picker offers Create for its name");
    once(code(read('src/hooks/useContacts.js')), LOAD_CONTACTS,
        "REGRESSION: the contacts load leaves merged-away rows out — an Admin's Select all + Delete then sends clear=true and deletes them (their Undo lost)");
    assert.deepEqual(ids(load(LOAD_ACCOUNTS, 'setAccounts', { accounts: ACCOUNTS })), ids(ACCOUNTS), 'the accounts load: every row answered, merged-away included');
    assert.deepEqual(ids(load(LOAD_CONTACTS, 'setContacts', { contacts: CONTACTS })), ids(CONTACTS), 'the contacts load: every row answered, merged-away included');
    assert.deepEqual(load(LOAD_ACCOUNTS, 'setAccounts', {}), [], 'an answer with no list: none');
    assert.equal(load(LOAD_CONTACTS, 'setContacts', { contacts: CONTACTS }, false), 'not set', 'an answer for an org switched away from is dropped (§0.173)');
    assert.equal(count(code(read('src/App.jsx')), '\n        accounts, setAccounts,\n        contacts, setContacts,\n'), 1,
        "the app's context hands on the whole lists");
    // The merge hook drops the row it archived at once; the scan's key — the list's length and its merged-away count
    // (state §0.207) — moves with the drop, and again when the list read again holds the row merged away.
    const merge = code(read('src/hooks/useMerge.js'));
    order(merge, ...DROP_ACCOUNT);
    order(merge, ...DROP_CONTACT);
    once(merge, DROP_ACCOUNT[1]);
    once(merge, DROP_CONTACT[1]);
    const survivor = { ...ACCOUNTS[0], phone: 'kept from the merge' };
    const afterAccounts = dropped(DROP_ACCOUNT, 'setAccounts', ACCOUNTS, { archivedId: 'acc_resinall_inc' }, { account: survivor });
    assert.ok(!ids(afterAccounts).includes('acc_resinall_inc') && afterAccounts.length === ACCOUNTS.length - 1, 'the account merged away leaves the screen at once');
    assert.equal(afterAccounts[0], survivor, 'the survivor as the server answered it');
    const afterContacts = dropped(DROP_CONTACT, 'setContacts', CONTACTS, { archivedId: 'con_lee_dup' }, {});
    assert.deepEqual(ids(afterContacts), ['con_lee', 'con_ana', 'con_bo'], 'the contact merged away leaves the screen at once');
    // Why the layers keep the rows — illustration: the real readers, run on the made-up rows (no line of this batch).
    const chip = { accountId: 'acc_resinall_inc', company: 'Resinall, Inc.' };
    assert.equal(linkedAccount(chip, ACCOUNTS)?.id, 'acc_resinall', "the whole list: a contact's chip on \"Resinall, Inc.\" opens Resinall");
    assert.equal(linkedAccount(chip, unarchived(ACCOUNTS)), null, 'the shown list alone opens nothing');
    assert.equal(outOfList('acc_resinall_inc', unarchived(ACCOUNTS)), true, "— and draws the link as an account you can't open");
    assert.equal(outOfList('acc_resinall_inc', ACCOUNTS), false, 'the whole list holds the link — it is named, never "an account you can\'t open"');
    // A task's contact chip stored with no name, on the merged-away Lee Ng: named from the whole list.
    assert.equal(chipLabel({ id: 'con_lee_dup', name: '' }, CONTACTS), 'Lee Ng', "the whole list: the chip reads the contact's name");
    assert.equal(chipLabel({ id: 'con_lee_dup', name: '' }, unarchived(CONTACTS)), 'Contact not in your list', 'the shown list alone: "Contact not in your list"');
    const typed = resolveLink({ text: 'Resinall, Inc.', records: ACCOUNTS });
    assert.deepEqual([typed.refusal, typed.into], ['merged', 'Resinall'], 'the whole list: the picker says what it was merged into, and offers no Create');
    assert.equal(resolveLink({ text: 'Resinall, Inc.', records: unarchived(ACCOUNTS) }).refusal, 'none',
        'the shown list alone: Create offered for the name the merge removed');
});

test('T7 — the suites: this file is graded by the harness', () => {
    // The SUITES value itself, never the whole harness: a comment there naming this file met the old pin (§0.204 review P1).
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/merged-away-lists.test.mjs'), 'SUITES runs this file');
});

// ── THE GUARD: every read of the app's whole lists, class-wide (state §0.208) ─

// The lists the app's context hands every screen, merged-away rows kept (T6): `accounts` and `contacts` every row the
// caller may read, `visibleAccounts` and `visibleContacts` narrowed by App.jsx's isRepVisible (the accounts to the top
// level too), never by a merge. A screen that draws, counts or offers one as it stands shows merged-away rows; one that
// resolves a link or a name through it needs every row (T6). Each read is a shape below — one that leaves merged-away
// rows out, resolves a link or a name through them, or draws nothing from the list (a hook's dependencies) — or a read
// named with its reason (an index by id, a scan's key, a lookup by name, a count still to fix).
const WHOLE = ['accounts', 'contacts', 'visibleAccounts', 'visibleContacts'];
const PICK_LINK = 'src/utils/pickLink.js';
// The path a screen imports useApp by: '../AppContext', '../../AppContext.jsx' (the house's only form — the adversary
// counted all 58 imports of it in src).
const CTX_PATH = /^(?:\.\.?\/)+AppContext(?:\.jsx)?$/;

// The guard reads (state §0.208; the cleanup batch, Jeff, 18 Oct: "Three steps" — the guard first, tests only):
//   1. every src file that imports useApp from a relative path ending AppContext (an alias refused) — App.jsx, which
//      builds the context and calls no useApp(), is pinned apart (T8's last part), as are the list hooks; utils are not
//      scanned (each resolver below is checked against its module, and run on a merged-away row by its named test).
//      One road in: every path in src that leads to AppContext is such an import of useApp or AppProvider — a
//      namespace import, a default import, a re-export, a dynamic import or another spelling of the path fails (ROADS).
//      A file whose text never names AppContext cannot import it, so it is not parsed for this;
//   2. in each, every function holding useApp() — named by its own id or the const it is bound to (a `*Host` among
//      them) — and its reads of the four lists: a destructure (an alias and a default followed; a rest element or a
//      computed key refused), a name bound to the whole context (`x.key` and `x?.key` read `key`; a bare test of it is
//      no read; any other use refused unless named in WHOLE_CONTEXT), and `useApp().key`; `useApp?.()` refused (the
//      holder is found by its plain call);
//   3. every component a list is handed to as a JSX attribute — in the same file or by one relative import — its body
//      scanned under the same rules: a destructured first parameter maps the prop to its key, a plain one is followed
//      through `props.<prop>` and a later `const { prop } = props` (any other use of it refused); a receiver the guard
//      cannot find fails, and so do a spread of a list, a rest element that would carry it, and a component declared
//      more than once in its file (a local `const Pane = …` would hide which one renders);
//   4. a name a list is bound to declared again anywhere in a scanned body fails: the scan could not tell its reads apart;
//   5. a whole-context binding handed on whole, as WHOLE_CONTEXT names it: its callee — a module-scope function of the
//      file — is scanned with the parameter the context lands in as a whole-context binding (a destructure of it, or
//      any use but a read by key, refused), and must read none of the four lists.
// Each read is then a SHAPE (each needs no entry; its reason here) or a NAMED read (WHOLE_READS, with its reason):
//   live      — the argument of unarchived(…) (pickLink.js): the merged-away rows left out;
//   deps      — an element of the dependency array of one of React's hooks (useMemo, useEffect, useCallback,
//               useLayoutEffect — imported from 'react', as React.*, or one the file neither imports nor declares; a
//               file's own useMemo is no React hook): worked out again when the list changes (a merge, its Undo), nothing
//               drawn from it;
//   byId      — `list.find(p => p.id === X)` (or `X === p.id`; the receiver the list or `(list || [])`): exactly one
//               `===`, the predicate's own parameter's `.id` on one side, the other not reading it, no ||/&& chain. Its
//               LIMIT (the proof critique, #5; the adversary's C41): it resolves a link by id, and may return a merged-away
//               row where a merge left the link on it — a contact's accountId, an invoice's accountId, a document's link
//               (no merge moves them: OPEN_ITEMS §4.7, batch 3). A new byId whose result is DRAWN should go through
//               linkedAccount / survivorOf (a reviewer's question; no parse can answer it);
//   liveOnly  — `list.filter(p => …)` (or `(list || []).filter`) whose top-level && chain holds `!isMergeArchived(p)` on
//               the predicate's OWN parameter (pickLink.js). Its LIMIT (the adversary's C42): the chain's other terms are
//               trusted — one with a side effect (collecting every row as it is tested) is not seen; no parse tells
//               `all.push(p)` from a pure `matches(p)` — a reviewer's question;
//   resolver  — the list a DIRECT argument of a call to a name in RESOLVERS (or `list || []`, `list ?? []`), or the
//               direct value of a property of an object literal that is one (`{ records: list }`, `{ accounts }`) — the
//               callee bound by an import from that module and declared nowhere else in the file (a same-named local
//               function never launders a read): it resolves a link or a name through the whole list, a merged-away
//               record named as its survivor or never matched. Anything else inside the arguments — a filter, a spread,
//               an assignment, a list built from it — is a read of its own. A resolver whose answer carries the rows it
//               was given (RESOLVERS' 'carries': contactIndex's `list`) must have its answer bound to a name, and that
//               name is then scanned as the list itself;
//   followed  — a JSX attribute handing the list (or `list || []`, `list ?? []`) to a component: its reads are the
//               receiver's, scanned in turn (3).
// Everything else is named. Beyond the parse: a list read out of the context's setters (`setAccounts(prev => …)`) is
// no read here — the adversary's C44 — and is held by tests/deal-modal-saves.test.mjs's guard (no handler sets a shared
// list without a server call).

// Each resolver: [its module, why it may read the whole list, the suite and the test that runs it on a merged-away row,
// and 'carries' when its answer holds the rows it was given]. A name no scanned read uses fails as stale; one that is not
// its module's export fails; one whose named test does not call it (or a helper of that suite that does) with a
// merge-marked row in reach fails (runsOnMerged, and its limit, below).
const RESOLVERS = {
    resolveLink: [PICK_LINK, 'a typed name or a held link resolved through the whole list: a merged-away record is no match for a typed name, and names the record it was merged into — never a Create for its name (T6)',
        'tests/pick-link.test.mjs', 'merged away (D12: "Yes, hide them"): never matched by a typed name; a link to one, held, is kept; accounts and contacts alike'],
    standsFor: [PICK_LINK, "the ids a record stands for — its own and every record merged into it, found through the whole list (the merge marks): the record a merge kept shows what still names the one merged into it (state §0.209); an id set, no rows",
        'tests/merged-away-cleanup.test.mjs', "C1 — pickLink helpers: standsFor, mergedInto, mergedSearchWords, accountOfDeal and heldAccountOption on merged-away rows, a chain, a NULL mark, an undone merge and a rep's list (run)"],
    mergedInto: [PICK_LINK, "a name typed in full that only a merged-away record has: resolveLink's 'merged' over the whole list, naming the one live record it was merged into — the header search's one row (state §0.209)",
        'tests/merged-away-cleanup.test.mjs', "C1 — pickLink helpers: standsFor, mergedInto, mergedSearchWords, accountOfDeal and heldAccountOption on merged-away rows, a chain, a NULL mark, an undone merge and a rep's list (run)"],
    accountOfDeal: [PICK_LINK, "a deal's account by its link, through the whole list: one merged away is named as its survivor; an id-less deal the later LIVE account of its name (state §0.209)",
        'tests/merged-away-cleanup.test.mjs', "C1 — pickLink helpers: standsFor, mergedInto, mergedSearchWords, accountOfDeal and heldAccountOption on merged-away rows, a chain, a NULL mark, an undone merge and a rep's list (run)"],
    openDealsByAccount: [PICK_LINK, "the header search's open-deal counts (state §0.214): each open deal once, on the account accountForDeal finds — a deal on a merged-away account counts on its survivor; an id map of counts, no rows",
        'tests/dispatch-customer.test.mjs', 'openDealsByAccount: each open deal once — by its link, or by the one live account of its name; twins no longer both count an id-less deal'],
    customerForText: ['src/utils/dispatchCustomer.js', "New Job's typed customer name (state §0.214): the one customer of the name, or the one LIVE account of it not yet in Dispatch (unarchived); a name only merged-away accounts have is refused through resolveLink, never made a customer — a check, nothing drawn from the list",
        'tests/dispatch-customer.test.mjs', 'customerForText: the one live account of the name not yet in Dispatch; a merged-away name refused; no record of it — Create'],
    refusalLeads: ['src/utils/dispatchCustomer.js', "what New Job's list leads with under a refusal (state §0.214, the browser check's fix): the records the refusal names, by id — a merged-away name's survivor through survivorOf (a merged-away account is never led: the field drops one by isMergeArchived); ids, no rows drawn",
        'tests/dispatch-customer.test.mjs', 'refusalLeads: what each refusal names — two customers; two twins and the customers that hold them; a merged-away name\'s survivor and its customers'],
    heldAccountOption: [PICK_LINK, "what a select shows for the link it holds when the live options leave it out: the record found by id in the whole list — merged away, named with its survivor; missing, \"an account you can't open\" (state §0.209)",
        'tests/merged-away-cleanup.test.mjs', "C1 — pickLink helpers: standsFor, mergedInto, mergedSearchWords, accountOfDeal and heldAccountOption on merged-away rows, a chain, a NULL mark, an undone merge and a rep's list (run)"],
    siteLine: [PICK_LINK, "a site's line under the Account picker: its parent looked up by id in the whole list — a parent merged away is held there, so the line says \"a site — pick the account it belongs to\", never \"an account you can't open\"",
        'tests/pick-link.test.mjs', "the deal window (F7): 'unreachable' — D11's sentence — only for a site whose account the list does not hold; a site whose account is listed but no deal's (merged away, or a site itself) is a site to refuse, in its own words"],
    linkedAccount: ['src/utils/railLinks.js', "a contact's company chip: its account by id — one merged away opens the account it was merged into (T6)",
        'tests/rail-links.test.mjs', "REGRESSION (the pre-ship audit): a contact's untouched Company linked to an account merged away returns the text it opened with — never the merged-away name — and says untouched, so the rail leaves it out"],
    outOfList: ['src/utils/railLinks.js', "whether the list holds a link's record: on the whole list a merged-away link is held and named, not \"an account you can't open\" (T6)",
        'tests/merged-away-lists.test.mjs', "T6 — the record is kept: both GETs answer every row of the org, narrowed by the read scope alone (each GET's code, whole), both hooks load every row they are answered, the app's context hands every row on, and the merge hook still drops the row it archived; a link and the account picker read that whole list (run)"],
    contactCompany: ['src/utils/railLinks.js', "the contact rail's Company: a typed name never lands on a merged-away account; a link held to one is kept",
        'tests/rail-links.test.mjs', 'contact Company: an account merged away is never matched by a typed name, and a contact linked to one keeps it (D12)'],
    activitySeed: ['src/utils/railLinks.js', "Log Activity's prefill: a merged-away account opens as the one it was merged into, by id",
        'tests/rail-links.test.mjs', "Log Activity opens a NEW activity with its prefill — an account's own rail (D10), a deal (D7), a lead's company — and a merged-away account as the one it was merged into, by id (D12, F4)"],
    activityLinks: ['src/utils/railLinks.js', "Log Activity's Save: a typed name never lands on a merged-away account; a link held or untouched is kept — a new activity's prefill already holds the survivor (activitySeed)",
        'tests/rail-links.test.mjs', "F4: a contact still linked to an account merged into another — its Log buttons fill the account it was merged into, by id, never the merged-away name; with that one out of the list, the contact's own company as typed"],
    companyAfterDealPick: ['src/utils/railLinks.js', "a deal picked fills an empty Company with its account by id — one merged away as the one it was merged into",
        'tests/rail-links.test.mjs', "picking a deal fills an EMPTY Company with the deal's account (D7) — by id where the list holds it live; a Company already shown stays"],
    taskSeed: ['src/utils/taskLinks.js', "the task rail's prefill: each link by id, a merged-away account as the one it was merged into",
        'tests/task-links.test.mjs', 'D12: a typed name never lands on the account merged away; a task already on it keeps it; a new task from its rail opens on the account it was merged into, by id (F4)'],
    taskLinks: ['src/utils/taskLinks.js', "the task rail's Save: a typed name never lands on a merged-away record; a link held to one is kept",
        'tests/task-links.test.mjs', 'D12: a typed name never lands on the account merged away; a task already on it keeps it; a new task from its rail opens on the account it was merged into, by id (F4)'],
    chipLabel: ['src/utils/taskLinks.js', "a contact chip's words: its stored name, else its contact by id in the whole list — a merged-away contact named, never \"Contact not in your list\" (T6)",
        'tests/merged-away-lists.test.mjs', "T6 — the record is kept: both GETs answer every row of the org, narrowed by the read scope alone (each GET's code, whole), both hooks load every row they are answered, the app's context hands every row on, and the merge hook still drops the row it archived; a link and the account picker read that whole list (run)"],
    resolveDealAccount: ['src/utils/dealAccount.js', "the deal window's Account: a typed name never lands on a merged-away account; an untouched link keeps the name the deal stores",
        'tests/deal-account.test.mjs', 'REGRESSION (the pre-ship audit): an untouched Account linked to an account merged away returns the name the deal stores — never the merged-away name — as untouched'],
    isHiddenAccount: ['src/utils/dealAccount.js', "whether the caller's list holds the deal's account: a merged-away one is held, so its name shows",
        'tests/deal-account.test.mjs', "D16: a link to an account the caller's list does not hold is said so — the name the deal stores, the words, an ×; untouched, a Save keeps it"],
    sitesOf: ['src/utils/dealAccount.js', "the Site Name list: an account's own sites by id, nothing merged away",
        'tests/deal-account.test.mjs', "the Site Name list: by the account's id, never its name — the chosen twin's own sites, only real sites (D15), nothing merged away"],
    parentChoices: ['src/utils/accountParent.js', 'the Parent list: the accounts it may stand under — never one merged away',
        'tests/account-parent.test.mjs', 'UKG\'s two "Shell - Port Allen": the Parent list offers the unit, never the site — never either to itself, nor Shell\'s own to Shell — and never a parent its own branch is too deep for'],
    parentLeftOut: ['src/utils/accountParent.js', 'why a name is not on the Parent list — merged away among the reasons',
        'tests/account-parent.test.mjs', 'the reason for a name twins share is the same in either list order — self, then one under it, then a site, then merged away, then too deep — at the Save and on the list (F8)'],
    typedParentRefusal: ['src/utils/accountParent.js', 'a Parent typed in full and not picked: refused by its reason, merged away among them',
        'tests/account-parent.test.mjs', 'the reason for a name twins share is the same in either list order — self, then one under it, then a site, then merged away, then too deep — at the Save and on the list (F8)'],
    planAccountImport: ['src/utils/importLinks.js', "the account import's names at Preview (state §0.215): a row's own name and its Parent Account each one live account or refused — a merged-away account is never matched, its name names the account it was merged into",
        'tests/import-links.test.mjs', 'a Parent Account that is a site, or a name only a merged-away account has, or no account at all, refuses the row — each said; never imported with no parent (REGRESSION: silent)'],
    planContactImport: ['src/utils/importLinks.js', "the contact import's Company and duplicate at Preview (state §0.216): a Company one live account of any tier, or a new company — a merged-away account is never matched, its name names the account it was merged into; the duplicate one live contact, an email only a merged-away contact has naming the one it was merged into",
        'tests/import-links.test.mjs', "THE CONTACT IMPORT (state §0.216): a Company is one account or a new company made once, never the first of a name — twins, a merged-away name and punctuation refused; a duplicate is one contact by email, else by name at its Company; two rows on one contact, or two new rows of one email (Q13), refused"],
    planDealImport: ['src/utils/importLinks.js', "the deal import's Account and duplicate at Preview (state §0.216): one live account the deal window takes — a merged-away account is never matched, its name names the account it was merged into; a deal on an account merged away stands on the one it was merged into",
        'tests/import-links.test.mjs', "THE DEAL IMPORT (state §0.216): an Account is one account the deal window takes — a site typed in full its account, the site its Site Name; none (Q3), twins, a site out of reach and a merged-away name refused; a duplicate is one deal of the name on that account; two rows on one deal, or two new rows of one deal (Q13), refused"],
    contactIndex: ['src/utils/dealEngagement.js', "the deals' people indexed once: a merged duplicate folds into the contact it was merged into — its answer's `list` is every contact it was given, so it CARRIES the list: its answer is bound to a name and scanned as the list (Home's `directory`, read only as dealCommittee's argument)",
        'tests/deal-engagement.test.mjs', "a merged duplicate reads as the contact it was merged into — its touches fold in, its id stands with the survivor's", 'carries'],
    dealCommittee: ['src/utils/dealEngagement.js', "a deal's committee: a merged duplicate reads as the contact it was merged into",
        'tests/deal-engagement.test.mjs', "a merged duplicate reads as the contact it was merged into — its touches fold in, its id stands with the survivor's"],
    engagedContacts: ['src/utils/dealEngagement.js', "a deal's engaged people: a merged duplicate as the contact it was merged into",
        'tests/deal-engagement.test.mjs', "a merged duplicate reads as the contact it was merged into — its touches fold in, its id stands with the survivor's"],
    onDealOf: ['src/utils/dealEngagement.js', 'who is already on a deal: a merged duplicate by the contact it was merged into',
        'tests/deal-engagement.test.mjs', 'a picker offers no one already on the deal — by id, a merged duplicate by its survivor; a name only when it is not there'],
    contactsToAdd: ['src/utils/buyingCommittee.js', "the deal's Contacts tab's add list: never a contact merged into another (D12)",
        'tests/deal-account.test.mjs', "the deal's Contacts tab never offers a contact merged into another (D12) — buyingCommittee.js, run"],
};

// A whole-context binding handed on whole: [the call's exact text, why] — the scan cannot follow what it reads, so the
// callee must read none of the four lists (T8 checks it).
const WHOLE_CONTEXT = {
    'src/Tabs/settings/integrations/AutomationsDetail.jsx': [
        ['recordName(run, lists)', "names a run's record from opportunities, leads and tasks by id (recordName, :325-332) — no account or contact"],
    ],
};

// Every other read, each with why it may read the whole list and its fate: [the context's key, the read's line (trimmed),
// how many reads on it, why, fate] — "stay": the cleanup batch's steps that fixed the rest are done (§0.209, the
// screens; §0.210, the numbers), so every read left here stays, and no reason may name a step to come ("until §0.…").
// A read not here fails; one here read a different number of times fails ("gone or moved: take it out").
const STAY = 'stay';
const BY_NAME = 'matched by name (or email) among the whole list, merged away included — filed: OPEN_ITEMS §4.7, "A record matched by name or email can be a merged-away one"';
const WHOLE_READS = {
    // ── stay ──
    'src/Tabs/DuplicateScanView.jsx': [
        ['accounts', 'const scanKey = `${(accounts || []).length}:${(accounts || []).filter(isMergeArchived).length}`;', 2, "the duplicate scan's key — the list's length and its merged-away count — runs the scan again after a merge or its Undo (state §0.207); the scan itself leaves merged-away rows out (duplicates.mjs)", STAY],
    ],
    'src/Tabs/ContactDuplicateScanView.jsx': [
        ['contacts', 'const scanKey = `${(contacts || []).length}:${(contacts || []).filter(isMergeArchived).length}`;', 2, "the duplicate scan's key, as the accounts' (state §0.207)", STAY],
    ],
    'src/Tabs/HomeTab.jsx': [
        ['accounts', 'const data = { opportunities: visibleOpportunities || [], accounts: accounts || [], leads: leads || [], activities: activities || [], settings: settings || {} };', 1, "Home's reports: the report data handed whole to runReport (reportQuery.js), which leaves merged-away accounts out of the Accounts source and counts a deal on one on its survivor (state §0.210; tests/merged-away-cleanup.test.mjs C15)", STAY],
    ],
    'src/Tabs/TasksTab.jsx': [
        ['accounts', 'account: a.account || resolveActivityAccount(a, opportunities, accounts, contacts),', 1, "the feed's account (resolveActivityAccount, local, :97): by id — the item's own accountId, else its deal's (a merge moves tasks', activities' and deals' accountId, merge.mjs) — else the name it stores; a stale write is the filed edge", STAY],
        ['contacts', 'account: a.account || resolveActivityAccount(a, opportunities, accounts, contacts),', 1, "an activity with no account: its first contact's company, by id — a merge leaves activities' contactIds (OPEN_ITEMS §4.7, batch 3), so a merged-away contact's company can show", STAY],
        ['accounts', 'source: \'all\', type: \'all\', range, account: \'all\', scope, search, currentUserId, opportunities, accounts,', 1, "the feed's filter (applyFilters, local, :300): an item's account by id through resolveAccountName, as above", STAY],
        ['accounts', "const account = resolveAccountName(t, opportunities, accounts) || '';", 2, "a task row's account (resolveAccountName, local, :75): by id, as above", STAY],
    ],
    'src/Tabs/ReportsTab.jsx': [
        ['accounts', 'const builderData = () => ({ opportunities: reportsOpps || [], accounts: accounts || [], leads: leads || [], activities: activities || [], settings: settings || {} });', 1, "the report builder's data handed whole to runReport, which leaves merged-away accounts out (state §0.210; C15)", STAY],
        ['contacts', 'const oppContacts = (contacts||[]).filter(c =>', 1, "a deal's people by their ids — a contact merge rewrites a deal's contactIds (merge.mjs); a stale whole-row save writing one back is OPEN_ITEMS §4.7's stale-write edge", STAY],
    ],
    'src/components/rails/AccountRail.jsx': [
        ['accounts', 'const accountsById = useMemo(() => new Map((accounts || []).map(a => [a.id, a])), [accounts]);', 1, "an index by id: the Parent field's choices (parentChoices, typedParentRefusal and parentLeftOut read it), and the parent named by its id — a merge moves parentAccountId (merge.mjs), so no row names a merged-away parent", STAY],
        ['contacts', 'const accountContacts = (contacts || []).filter(c =>', 1, "the account's contacts, whole on purpose: its Activity tab reads their ids (T4); People and CONTACTS draw unarchived(accountContacts)", STAY],
        ['accounts', 'const candidates = (accounts || []).filter(a => {', 1, `the rail's "Open existing" (checkDuplicate): a name another account has — ${BY_NAME}`, STAY],
    ],
    'src/Tabs/ContactsTab.jsx': [
        ['accounts', 'return (accounts || []).find(a => a.name?.toLowerCase() === activeCompany.name.toLowerCase());', 1, `the Company view's card (CompanyTwoPane's matchedAccount, handed every account) finds its account by name — it lists none; ${BY_NAME}`, STAY],
    ],
    'src/components/layout/AppHeader.jsx': [
        ['accounts', 'const accountsById = React.useMemo(() => new Map((accounts || []).map(a => [a.id, a])), [accounts]);', 1, "the search's account rows: an index by id — each row's parent named by its id (state §0.214); the rows themselves are unarchived(accounts)", STAY],
    ],
    'src/components/layout/MeetingPrepPanel.jsx': [
        ['accounts', "? (accounts || []).find(a => a.name?.toLowerCase() === (matchedOpp.account || '').toLowerCase())", 1, `the meeting's account by the deal's name — ${BY_NAME}`, STAY],
    ],
    'src/components/modals/LeadModal.jsx': [
        ['contacts', 'return findDuplicate(form, normalizedLeads, contacts);', 1, `a lead's duplicate warning by name or email — ${BY_NAME}`, STAY],
    ],
    'src/Tabs/DispatchTab.jsx': [
        ['accounts', 'opportunities, jobs, customers, accounts,', 1, "Dispatch's won-deal jobs (buildWonBridgeJobs): each deal's account by accountForDeal — by its link, one merged away as its survivor; an id-less deal the one live account of its name, never the first of two (state §0.214)", STAY],
        ['accounts', 'const byId = new Map((accounts || []).map(a => [a.id, a]));', 1, "New Job's Customer field: an index by id — a customer row's CRM account and an account row's parent named by their ids (state §0.214); the rows themselves are the live accounts (acctMatches, !isMergeArchived)", STAY],
        ['accounts', "for (const a of accounts || []) if (unlinkedKeys.has(searchKey(a.name || ''))) linkedAccountIds.add(a.id);", 1, "New Job's Customer field: the accounts a customer linked to no account stands for by its name (dispatchCustomer.js rule 2) leave \"CRM accounts — not yet in Dispatch\" — a merged-away one is marked too, and the rows are the live accounts all the same (acctMatches, !isMergeArchived; the second review of the browser check's fix, state §0.214)", STAY],
        ['accounts', 'const accountsById = new Map((accounts || []).map(a => [a.id, a]));', 1, "a customer's Linked CRM account options: an index by id — each option's parent named by its id (state §0.214); the options themselves are unarchived(accounts)", STAY],
    ],
    'src/components/documents/DocumentLinkPicker.jsx': [
        ['accounts', 'const sub = heldLinkSub(l, allAccounts, allContacts);', 1, "a held link's words (heldLinkSub, local): its account found by id in the whole list — one merged away named by the record it was merged into (state §0.209); the offer reads the live lists", STAY],
        ['contacts', 'const sub = heldLinkSub(l, allAccounts, allContacts);', 1, "a held link's words: its contact by id in the whole list, as the accounts'", STAY],
    ],
};
const FATES = new Set([STAY]);

// The components a list is handed to today, every one — each must be reached (a follow that reaches none proves nothing),
// and none reached may be left off (a new hand-off is named here when it is first followed).
const RECEIVERS = [
    'src/Tabs/ReportsTab.jsx ActivityHistoryTab', 'src/Tabs/ReportsTab.jsx SavedReportsTab',
    'src/Tabs/DispatchTab.jsx CustomerTypeahead', 'src/Tabs/DispatchTab.jsx CustomersView', 'src/Tabs/DispatchTab.jsx CustomerEditForm',
    'src/Tabs/ContactsTab.jsx CompanyTwoPane', 'src/components/rails/ActivityRail.jsx ContactMultiSelect',
    'src/components/modals/OpportunityModal.jsx OpportunityModal', 'src/components/modals/OpportunityModal.jsx DealHistoryTab',
    'src/components/modals/OpportunityModal.jsx ContactEngagementTab', 'src/components/modals/OpportunityModal.jsx OppQuotesPanel',
    'src/components/modals/OpportunityModal.jsx RightRail', 'src/components/modals/CsvImportModal.jsx CsvImportModal',
];

const FN = /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression|ObjectMethod|ClassMethod|ClassPrivateMethod)$/;
const NOT_CHILD = new Set(['loc', 'start', 'end', 'extra', 'range', 'leadingComments', 'trailingComments', 'innerComments']);
// A node's children, [key, child], in key order (a loop, not a chain of array copies: every walk runs through it).
const kids = (n) => {
    const out = [];
    for (const k of Object.keys(n)) {
        if (NOT_CHILD.has(k)) continue;
        const v = n[k];
        if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') out.push([k, c]); }
        else if (v && typeof v.type === 'string') out.push([k, v]);
    }
    return out;
};
// A property's own name — a.contacts, { contacts: x }, a method's — reads no list of that name.
const isName = (parent, key) => !!parent && !parent.computed && (
    (/MemberExpression$/.test(parent.type) && key === 'property')
    || (/^(ObjectProperty|ObjectMethod|ClassMethod|ClassPrivateMethod|ClassProperty|ClassPrivateProperty)$/.test(parent.type) && key === 'key'));
// Walks a body: onRead(id, path) for each name read (a shorthand { contacts } and a dependency list among them) — path
// its ancestors, each { node, key } (the key the walk went down by) — and onBind(id) for each name declared: a
// variable, a parameter, a function's or a class's own name, a catch's.
const walk = (node, onRead, onBind) => {
    const path = [];
    const pattern = (p) => {
        if (!p) return;
        if (p.type === 'Identifier') onBind(p);
        else if (p.type === 'ObjectPattern') {
            for (const q of p.properties) {
                if (q.type === 'RestElement') { pattern(q.argument); continue; }
                if (q.computed) expr(q.key);
                pattern(q.value);
            }
        } else if (p.type === 'ArrayPattern') p.elements.forEach(pattern);
        else if (p.type === 'RestElement') pattern(p.argument);
        else if (p.type === 'AssignmentPattern') { pattern(p.left); expr(p.right); }
        else expr(p);   // a member as the target (a.b = …) reads a
    };
    const expr = (n, parent, key) => {
        if (!n || typeof n.type !== 'string') return;
        if (n.type === 'Identifier') {
            if (!isName(parent, key) && key !== 'label') onRead(n, path);
            return;
        }
        const at = { node: n, key: null };
        path.push(at);
        if (n.type === 'VariableDeclarator') { at.key = 'id'; pattern(n.id); at.key = 'init'; expr(n.init, n, 'init'); }
        else if (n.type === 'CatchClause') { at.key = 'param'; pattern(n.param); at.key = 'body'; expr(n.body, n, 'body'); }
        else if (FN.test(n.type) || /^Class(Declaration|Expression)$/.test(n.type)) {
            if (n.id) onBind(n.id);
            if (n.computed) { at.key = 'key'; expr(n.key, n, 'key'); }
            at.key = 'params';
            (n.params || []).forEach(pattern);
            at.key = 'superClass'; expr(n.superClass, n, 'superClass');
            at.key = 'body'; expr(n.body, n, 'body');
        } else for (const [k, c] of kids(n)) { at.key = k; expr(c, n, k); }
        path.pop();
    };
    expr(node);
};
// A call's own name: f(…) or React.f(…).
const calleeName = (c) => (c?.type === 'Identifier' ? c.name
    : (/MemberExpression$/.test(c?.type) && !c.computed && c.object.type === 'Identifier' && c.object.name === 'React' ? c.property.name : null));
const WRAPPERS = /^(memo|forwardRef)$/;

// The files the guard reads, parsed once: `source(path)` answers a repo-relative path's code (LF), or null.
const project = (source) => {
    const cache = new Map();
    const resolve = (from, spec) => {
        if (!/^\.\.?\//.test(spec)) return null;
        const base = posix.normalize(posix.join(posix.dirname(from), spec));
        return [base, `${base}.jsx`, `${base}.js`, `${base}/index.jsx`, `${base}/index.js`]
            .find((p) => /\.jsx?$/.test(p) && source(p) != null) ?? null;
    };
    const info = (file) => {
        if (cache.has(file)) return cache.get(file);
        const src = source(file);
        assert.ok(src != null, `${file}: not found`);
        const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
        const imports = new Map();   // local name -> { source, path (resolved), imported }
        const top = new Map();       // a module-scope function by its name (or { alias })
        const exported = new Set();
        const bound = new Map();     // name -> how many times it is declared anywhere in the file
        const bind = (name) => bound.set(name, (bound.get(name) || 0) + 1);
        const fnOf = (init) => {
            if (init && /CallExpression$/.test(init.type) && WRAPPERS.test(calleeName(init.callee) || '') && FN.test(init.arguments[0]?.type)) return init.arguments[0];
            return init && FN.test(init.type) ? init : null;
        };
        for (const s of ast.program.body) {
            if (s.type === 'ImportDeclaration') {
                for (const sp of s.specifiers) {
                    imports.set(sp.local.name, { source: s.source.value, path: resolve(file, s.source.value),
                        imported: sp.type === 'ImportDefaultSpecifier' ? 'default' : sp.type === 'ImportNamespaceSpecifier' ? '*' : (sp.imported.name ?? sp.imported.value) });
                    bind(sp.local.name);
                }
                continue;
            }
            const named = s.type === 'ExportNamedDeclaration';
            const d = /^Export(Named|Default)Declaration$/.test(s.type) ? s.declaration : s;
            if (named && !s.declaration) for (const sp of s.specifiers) { top.set(sp.exported.name, { alias: sp.local.name }); exported.add(sp.exported.name); }
            if (!d) continue;
            if (s.type === 'ExportDefaultDeclaration') {
                if (FN.test(d.type)) top.set('default', d);
                else if (d.type === 'Identifier') top.set('default', { alias: d.name });
            }
            if (d.type === 'FunctionDeclaration' && d.id) { top.set(d.id.name, d); if (named) exported.add(d.id.name); }
            if (d.type === 'VariableDeclaration') for (const v of d.declarations) {
                if (v.id.type !== 'Identifier') continue;
                if (named) exported.add(v.id.name);
                const f = fnOf(v.init);
                if (f) top.set(v.id.name, f);
            }
        }
        walk(ast.program, () => {}, (id) => bind(id.name));
        const parentOf = new Map();
        const index = (n, parent) => { parentOf.set(n, parent); for (const [, c] of kids(n)) index(c, n); };
        index(ast.program, null);
        const it = { file, src, lines: src.split('\n'), ast, imports, top, exported, bound, parentOf };
        cache.set(file, it);
        return it;
    };
    // A module-scope function of the file by name, through `export default X` / `export { X as Y }`.
    const topFn = (it, name) => {
        let f = it.top.get(name);
        if (f?.alias) f = it.top.get(f.alias);
        return f && FN.test(f.type) ? f : null;
    };
    // A function's own name: its id, or the const it is bound to (through memo / forwardRef).
    const nameOf = (it, fn) => {
        if (fn.id) return fn.id.name;
        let p = it.parentOf.get(fn);
        if (p && /CallExpression$/.test(p.type) && WRAPPERS.test(calleeName(p.callee) || '')) p = it.parentOf.get(p);
        return p?.type === 'VariableDeclarator' && p.id.type === 'Identifier' ? p.id.name : null;
    };
    // `name`, called as `callee`, is the one `module` exports, imported under its own name and declared nowhere else.
    const importedFrom = (it, callee, name, module) => callee?.type === 'Identifier' && callee.name === name
        && it.imports.get(name)?.path === module && it.imports.get(name).imported === name && it.bound.get(name) === 1;
    return { info, topFn, nameOf, importedFrom };
};

const HOOK_DEPS = /^(useMemo|useEffect|useCallback|useLayoutEffect)$/;
// One of React's hooks: React.<hook>, or a name imported from 'react' — or one the file neither imports nor declares
// (a made-up component's bare useMemo); a file's own `useMemo` is not (the adversary's C45).
const reactHook = (it, callee) => callee.type !== 'Identifier'
    || (it.imports.has(callee.name) ? it.imports.get(callee.name).source === 'react' : !it.bound.get(callee.name));
// The shape of a read: R the node that is the whole list (a name, or x.key), anc its ancestors.
const shapeOf = (P, it, R, anc) => {
    const up = (i) => anc[anc.length - 1 - i]?.node;
    if (up(0)?.type === 'ArrayExpression' && /CallExpression$/.test(up(1)?.type) && up(1).arguments[1] === up(0)
        && HOOK_DEPS.test(calleeName(up(1).callee) || '') && reactHook(it, up(1).callee)) return 'deps';
    let node = R, i = 0;
    if (up(0)?.type === 'LogicalExpression' && /^(\|\||\?\?)$/.test(up(0).operator) && up(0).left === R
        && up(0).right.type === 'ArrayExpression' && !up(0).right.elements.length) { node = up(0); i = 1; }
    const p = up(i), pp = up(i + 1);
    if (/CallExpression$/.test(p?.type) && p.arguments.length === 1 && p.arguments[0] === node
        && P.importedFrom(it, p.callee, 'unarchived', PICK_LINK)) return 'live';
    // list.find(…) / list.filter(…) with one predicate of one parameter
    const pred = (method) => {
        if (!(/MemberExpression$/.test(p?.type) && p.object === node && !p.computed && p.property.name === method
            && /CallExpression$/.test(pp?.type) && pp.callee === p && pp.arguments.length === 1)) return null;
        const f = pp.arguments[0];
        if (!/^(ArrowFunctionExpression|FunctionExpression)$/.test(f.type) || f.params.length !== 1 || f.params[0].type !== 'Identifier') return null;
        let body = f.body;
        if (body.type === 'BlockStatement') {
            if (body.body.length !== 1 || body.body[0].type !== 'ReturnStatement') return null;
            body = body.body[0].argument;
        }
        return { param: f.params[0].name, body };
    };
    const reads = (n, name) => { let hit = false; walk(n, (id) => { if (id.name === name) hit = true; }, () => {}); return hit; };
    const byId = pred('find');
    if (byId?.body?.type === 'BinaryExpression' && byId.body.operator === '===') {
        const ownId = (s) => s.type === 'MemberExpression' && !s.computed && s.object.type === 'Identifier' && s.object.name === byId.param && s.property.name === 'id';
        const { left, right } = byId.body;
        if ((ownId(left) && !reads(right, byId.param)) || (ownId(right) && !reads(left, byId.param))) return 'byId';
    }
    const live = pred('filter');
    if (live?.body) {
        const terms = [];
        const and = (n) => { if (n.type === 'LogicalExpression' && n.operator === '&&') { and(n.left); and(n.right); } else terms.push(n); };
        and(live.body);
        if (terms.some((t) => t.type === 'UnaryExpression' && t.operator === '!' && t.argument.type === 'CallExpression'
            && P.importedFrom(it, t.argument.callee, 'isMergeArchived', PICK_LINK) && t.argument.arguments.length === 1
            && t.argument.arguments[0].type === 'Identifier' && t.argument.arguments[0].name === live.param)) return 'liveOnly';
    }
    // A resolver's direct argument, or the direct value of a property of an object literal that is one (fidelity #9;
    // an assignment or a sequence inside the arguments, the adversary's C43, is neither).
    const call = /CallExpression$/.test(p?.type) && p.arguments.includes(node) ? p
        : p?.type === 'ObjectProperty' && p.value === node && !p.computed && pp?.type === 'ObjectExpression'
            && /CallExpression$/.test(up(i + 2)?.type) && up(i + 2).arguments.includes(pp) ? up(i + 2) : null;
    if (call && call.callee.type === 'Identifier' && Object.hasOwn(RESOLVERS, call.callee.name)
        && P.importedFrom(it, call.callee, call.callee.name, RESOLVERS[call.callee.name][0])) return `resolver:${call.callee.name}`;
    if (p?.type === 'JSXSpreadAttribute') assert.fail(`${it.file}:${R.loc.start.line} spreads the app's whole list into a component — the scan cannot follow it`);
    if (p?.type === 'JSXExpressionContainer' && pp?.type === 'JSXAttribute') {
        const el = up(i + 2);
        if (el.name.type !== 'JSXIdentifier' || pp.name.type !== 'JSXIdentifier') assert.fail(`${it.file}:${R.loc.start.line} hands the app's whole list to a component the guard cannot find`);
        if (/^[A-Z]/.test(el.name.name)) return { to: el.name.name, prop: pp.name.name };
    }
    return null;
};

// A file read as text first, parsed only when its text names `re`: a file that never names AppContext cannot import
// from it; one that never names a list endpoint cannot GET it (a parse of every src file made T8 the slowest test —
// the harness review, #6; what the guard finds is the same with them and without).
const naming = (re, source = (p) => fromDisk(p)) => (file) => re.test(source(file) ?? '');

// The guard over `files` (repo-relative paths), reading through `source`. Answers { files: [the files that import
// useApp], holders: { file: [function names] }, reads: [{ file, key, line, at, shape }] (shape null for a named read),
// receivers: Set('file Name'), context: [{ file, text, reads }] }; a shape the scan cannot read fails, saying why.
const guard = (files, source, { context = WHOLE_CONTEXT } = {}) => {
    const P = project(source);
    const out = { files: [], holders: {}, reads: [], receivers: new Set(), context: [] };
    const seen = new Set();
    const lineOf = (it, n) => it.lines[n.loc.start.line - 1].trim();
    const record = (it, R, anc, key) => {
        const s = shapeOf(P, it, R, anc);
        const id = `${it.file}:${R.start}:${key}`;
        if (!seen.has(id)) {
            seen.add(id);
            out.reads.push({ file: it.file, key, at: R.loc.start.line, line: lineOf(it, R), shape: s && typeof s === 'object' ? `followed:${s.to}` : s });
        }
        if (s && typeof s === 'object') follow(it, s.to, s.prop, key, R);
        return s;
    };
    // The body of `fn` in file `it`, its names: tracked (a name -> its key), own (the binding nodes that declare them),
    // ctx (a name bound to the whole context), props ({ name, id, map: prop -> key } for a plain first parameter).
    const scan = (it, fn, { tracked = new Map(), own = new Set(), ctx = new Map(), props = null }) => {
        // A read; and when it is a carrier's argument (RESOLVERS' 'carries'), the name its answer is bound to is the list.
        const rec = (R, anc, key) => {
            const s = record(it, R, anc, key);
            const r = typeof s === 'string' && s.startsWith('resolver:') ? s.slice(9) : null;
            if (!r || RESOLVERS[r][4] !== 'carries') return;
            const at = anc.findLastIndex((x) => /CallExpression$/.test(x.node.type) && x.node.callee.type === 'Identifier' && x.node.callee.name === r);
            const d = anc[at - 1]?.node;
            assert.ok(at > 0 && d?.type === 'VariableDeclarator' && d.init === anc[at].node && d.id.type === 'Identifier',
                `${it.file}:${R.loc.start.line} ${r}(…) hands back the list it is given — bind its answer to a name (const x = ${r}(…)), so the scan reads x as the list`);
            tracked.set(d.id.name, key);
            own.add(d.id);
        };
        walk(fn.body, (id, path) => {
            const last = path.at(-1);
            if (id.name === 'useApp' && last?.key === 'callee' && /CallExpression$/.test(last.node.type)) {
                const m = path.at(-2)?.node;
                if (/MemberExpression$/.test(m?.type) && m.object === last.node) {
                    if (m.computed) assert.fail(`${it.file}:${m.loc.start.line} reads the app's context by a computed key`);
                    if (WHOLE.includes(m.property.name)) rec(m, path.slice(0, -2), m.property.name);
                }
                return;
            }
            if (tracked.has(id.name)) return rec(id, path, tracked.get(id.name));
            const via = ctx.has(id.name) ? 'context' : props && id.name === props.name ? 'props' : null;
            if (!via) return;
            const p = last?.node, k = last?.key;
            if (/MemberExpression$/.test(p?.type) && k === 'object') {
                if (p.computed) assert.fail(`${it.file}:${p.loc.start.line} reads its ${via} by a computed key`);
                const key = via === 'context' ? (WHOLE.includes(p.property.name) ? p.property.name : null) : props.map[p.property.name];
                if (key) rec(p, path.slice(0, -1), key);
                return;
            }
            if (via === 'props') {
                if (p?.type === 'VariableDeclarator' && k === 'init' && p.id.type === 'ObjectPattern') return;   // read before the walk
                assert.fail(`${it.file}:${id.loc.start.line} uses its props whole (${props.name}) — the scan cannot follow ${Object.keys(props.map).join(', ')} through it`);
            }
            if (((p?.type === 'IfStatement' || p?.type === 'ConditionalExpression') && k === 'test') || (p?.type === 'LogicalExpression' && p.operator === '&&' && k === 'left')) return;
            const text = /CallExpression$/.test(p?.type) && k === 'arguments' ? it.src.slice(p.start, p.end) : null;
            if (text && (context[it.file] || []).some(([t]) => t === text)) {
                // The callee, a module-scope function of the file, scanned with the parameter the context lands in as a
                // whole-context binding: what it reads of the four lists is counted (T8 holds it to none).
                const callee = p.callee.type === 'Identifier' ? P.topFn(it, p.callee.name) : null;
                assert.ok(callee, `${it.file}:${id.loc.start.line} ${text} — the context handed to a function the guard cannot find (a module-scope function of this file)`);
                const param = callee.params[p.arguments.indexOf(id)];
                assert.ok(param?.type === 'Identifier', `${it.file}:${id.loc.start.line} ${text} — the context lands in a parameter of ${p.callee.name} that is not a plain name: the scan reads it by key`);
                const before = out.reads.length;
                scan(it, callee, { ctx: new Map([[param.name, param]]) });
                out.context.push({ file: it.file, text, reads: out.reads.length - before });
                return;
            }
            assert.fail(`${it.file}:${id.loc.start.line} uses the app's context whole (${text ?? lineOf(it, id)}) — the scan cannot follow its lists: read them by key, or name the call in WHOLE_CONTEXT with its reason`);
        }, (id) => {
            if ((tracked.has(id.name) && !own.has(id)) || (ctx.has(id.name) && ctx.get(id.name) !== id) || (props && id.name === props.name && id !== props.id)) {
                assert.fail(`${id.name} declared again at line ${id.loc.start.line} — it shadows the app's list, and the scan could not tell its reads apart (${it.file})`);
            }
        });
    };
    // A list handed to <to prop={…}/>: the component in this file, or by one relative import, its body scanned.
    const follow = (it, to, prop, key, at) => {
        let rit = it, rfn = P.topFn(it, to);
        const imp = it.imports.get(to);
        if (!rfn && imp?.path) { rit = P.info(imp.path); rfn = P.topFn(rit, imp.imported); }
        if (!rfn) assert.fail(`${it.file}:${at.loc.start.line} hands the app's whole list to <${to}> — the guard cannot find the component (a module-scope function of this file, or one relative import)`);
        assert.ok((it.bound.get(to) || 0) <= 1, `${it.file}:${at.loc.start.line} <${to}> is declared more than once in the file — the guard cannot tell which one it renders: give each its own name`);
        out.receivers.add(`${rit.file} ${to}`);
        const visit = `${rit.file}:${rfn.start}:${prop}:${key}`;
        if (seen.has(visit)) return;
        seen.add(visit);
        const p0 = rfn.params[0];
        if (!p0) return;
        if (p0.type === 'ObjectPattern') {
            const q = p0.properties.find((x) => x.type !== 'RestElement' && !x.computed && (x.key.name ?? x.key.value) === prop);
            if (!q) {
                assert.ok(!p0.properties.some((x) => x.type === 'RestElement' || x.computed), `${rit.file}:${p0.loc.start.line} <${to}>: a rest element or a computed key would hand ${prop} on under another name`);
                return;
            }
            const v = q.value.type === 'AssignmentPattern' ? q.value.left : q.value;
            assert.equal(v.type, 'Identifier', `${rit.file}:${v.loc.start.line} <${to}>: ${prop} destructured further — the scan follows names`);
            scan(rit, rfn, { tracked: new Map([[v.name, key]]), own: new Set([v]) });
        } else if (p0.type === 'Identifier') {
            const tracked = new Map(), own = new Set();
            const later = (n) => {
                if (n.type === 'VariableDeclarator' && n.init?.type === 'Identifier' && n.init.name === p0.name && n.id.type === 'ObjectPattern') {
                    for (const q of n.id.properties) {
                        assert.ok(q.type !== 'RestElement' && !q.computed, `${rit.file}:${q.loc.start.line} <${to}>: a rest element or a computed key of ${p0.name} would hand ${prop} on under another name`);
                        if ((q.key.name ?? q.key.value) !== prop) continue;
                        const v = q.value.type === 'AssignmentPattern' ? q.value.left : q.value;
                        assert.equal(v.type, 'Identifier', `${rit.file}:${v.loc.start.line} <${to}>: ${prop} destructured further — the scan follows names`);
                        tracked.set(v.name, key);
                        own.add(v);
                    }
                }
                for (const [, c] of kids(n)) later(c);
            };
            later(rfn.body);
            scan(rit, rfn, { tracked, own, props: { name: p0.name, id: p0, map: { [prop]: key } } });
        } else assert.fail(`${rit.file}:${p0.loc.start.line} <${to}>: its first parameter is neither a destructure nor a name — the scan cannot follow ${prop}`);
    };
    for (const file of files) {
        if (!naming(/AppContext/, source)(file)) continue;
        const it = P.info(file);
        const specs = it.ast.program.body.filter((s) => s.type === 'ImportDeclaration' && CTX_PATH.test(s.source.value))
            .flatMap((s) => s.specifiers).filter((sp) => sp.type === 'ImportSpecifier' && (sp.imported.name ?? sp.imported.value) === 'useApp');
        if (!specs.length) continue;
        assert.ok(specs.every((sp) => sp.local.name === 'useApp'), `${file} imports useApp under another name — the scan reads useApp() by its name`);
        out.files.push(file);
        // Each useApp() call, by the function that holds it.
        const byFn = new Map();
        const find = (n, fns, key) => {
            if (n.type === 'Identifier' && n.name === 'useApp') {
                const p = it.parentOf.get(n);
                assert.ok(!(p?.type === 'OptionalCallExpression' && p.callee === n), `${file}:${n.loc.start.line} useApp?.() — call useApp() plainly: the scan finds its holder by that call`);
                assert.ok(p?.type === 'ImportSpecifier' || (/CallExpression$/.test(p?.type) && p.callee === n) || isName(p, key),
                    `${file}:${n.loc.start.line} useApp handed on as a value — the scan reads useApp() where it is called`);
            }
            if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'useApp') {
                assert.ok(fns.length, `${file}:${n.loc.start.line} useApp() outside a component`);
                if (!byFn.has(fns.at(-1))) byFn.set(fns.at(-1), []);
                byFn.get(fns.at(-1)).push(n);
            }
            for (const [k, c] of kids(n)) find(c, FN.test(n.type) ? [...fns, n] : fns, k);
        };
        find(it.ast.program, [], null);
        out.holders[file] = [];
        for (const [fn, calls] of byFn) {
            const name = P.nameOf(it, fn);
            assert.ok(name, `${file}:${fn.loc.start.line} useApp() in a function with no name — not a component the guard can name`);
            out.holders[file].push(name);
            const tracked = new Map(), own = new Set(), ctx = new Map();
            for (const call of calls) {
                const p = it.parentOf.get(call);
                if (p.type === 'VariableDeclarator' && p.init === call && p.id.type === 'ObjectPattern') {
                    for (const q of p.id.properties) {
                        assert.notEqual(q.type, 'RestElement', `${file}:${q.loc.start.line} a rest element would hand every list on under another name`);
                        assert.ok(!q.computed, `${file}:${q.loc.start.line} a computed key of useApp() — the scan reads keys by their names`);
                        const v = q.value.type === 'AssignmentPattern' ? q.value.left : q.value;
                        own.add(v);
                        const key = q.key.name ?? q.key.value;
                        if (!WHOLE.includes(key)) continue;
                        assert.equal(v.type, 'Identifier', `${file}:${v.loc.start.line} ${key}: destructured further — the scan follows names`);
                        tracked.set(v.name, key);
                    }
                } else if (p.type === 'VariableDeclarator' && p.init === call && p.id.type === 'Identifier') ctx.set(p.id.name, p.id);
                else assert.ok(/MemberExpression$/.test(p.type) && p.object === call, `${file}:${call.loc.start.line} useApp() neither destructured, bound to a name, nor read by a key`);
            }
            scan(it, fn, { tracked, own, ctx });
        }
    }
    return Object.assign(out, { project: P });
};

// The tree's src files, by path; a reader of the tree.
const srcFiles = (dir = 'src') => readdirSync(new URL(`${dir}/`, ROOT), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? srcFiles(`${dir}/${e.name}`) : (/\.jsx?$/.test(e.name) ? [`${dir}/${e.name}`] : [])));
const fromDisk = (p) => (existsSync(new URL(p, ROOT)) ? read(p) : null);

// Whether test `label` of `suite` runs `name` on a merged-away row: its body calls the name (or a module-scope helper of
// the suite that does), and reads a row holding a merge mark (`mergeArchived: true`, or `mergedIntoId: '…'`) — in its
// own text, or through a module-scope binding of the suite that holds one. Its LIMIT (the fidelity review, #1): both
// must be in the test, not the one in the other — a test that calls the name on a live list and reads a marked row
// elsewhere passes. Each test named below was read to run the call on a list holding a merged-away row (outOfList's
// and chipLabel's are T6's own assertions on the whole list); a new entry's test is read the same way.
const MERGE_MARK = /mergeArchived: true|mergedIntoId: '/;
const runsOnMerged = (suite, label, name) => {
    const src = read(suite);
    const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
    const names = (n, s = new Set()) => { if (n.type === 'Identifier') s.add(n.name); for (const [, c] of kids(n)) names(c, s); return s; };
    const calls = (n, set) => { let hit = false; const f = (x) => { if (x.type === 'CallExpression' && x.callee.type === 'Identifier' && set.has(x.callee.name)) hit = true; for (const [, c] of kids(x)) f(c); }; f(n); return hit; };
    const decls = ast.program.body.flatMap((s) => (s.type === 'FunctionDeclaration' ? [{ name: s.id.name, node: s }]
        : s.type === 'VariableDeclaration' ? s.declarations.filter((d) => d.id.type === 'Identifier' && d.init).map((d) => ({ name: d.id.name, node: d.init })) : []));
    const helpers = new Set([name]), marked = new Set();
    for (let more = true; more;) {
        more = false;
        for (const d of decls) {
            if (!helpers.has(d.name) && FN.test(d.node.type) && calls(d.node, helpers)) { helpers.add(d.name); more = true; }
            if (!marked.has(d.name) && (MERGE_MARK.test(src.slice(d.node.start, d.node.end)) || [...names(d.node)].some((x) => marked.has(x)))) { marked.add(d.name); more = true; }
        }
    }
    const t = ast.program.body.map((s) => s.expression).find((e) => e?.type === 'CallExpression' && e.callee.name === 'test' && e.arguments[0]?.value === label);
    assert.ok(t, `${suite}: no test "${label}"`);
    return calls(t, helpers) && (MERGE_MARK.test(src.slice(t.start, t.end)) || [...names(t)].some((x) => marked.has(x)));
};

// App.jsx builds the context and calls no useApp(): its lists — `accounts` and `contacts` from the hooks, the
// `visibleAccounts` and `visibleContacts` it narrows from them — are read only where named, and handed to no component
// as a prop (none today: the tabs take them from the context). [key, line, times, why].
const APP_READS = [
    ['accounts', 'const visibleAccounts = (accounts || [])', 1, "the context's visibleAccounts: isRepVisible and the top level — never a merge (the tabs read it through unarchived, T1)"],
    ['contacts', 'const visibleContacts = (contacts || []).filter(c => isRepVisible(c.assignedRep));', 1, "the context's visibleContacts: isRepVisible — never a merge (T2)"],
    ['contacts', 'const allContacts = contacts.filter(c => c.company && names.includes(c.company.toLowerCase()));', 1, "getAccountRollup's allContacts — every contact of the account's names, merged-away included — read by nothing (dead code, found by the cleanup batch's maps, 18 Oct): no screen may read it (CARRIED, T8)"],
    ['accounts', 'accounts, setAccounts,', 1, "the context hands every row on (T6)"],
    ['contacts', 'contacts, setContacts,', 1, "the context hands every row on (T6)"],
    ['visibleAccounts', 'visibleAccounts,', 1, 'the context hands it on'],
    ['visibleContacts', 'visibleContacts,', 1, 'the context hands it on'],
];
// The list hooks are the only screens' reads of either list endpoint: a screen that fetched its own list would be
// outside the guard. Every other call naming the endpoint writes (a method, or a bulk post or put).
const LIST_GETS = [
    "src/hooks/useAccounts.js — dbFetch('/.netlify/functions/accounts')",
    "src/hooks/useContacts.js — dbFetch('/.netlify/functions/contacts')",
];
const LIST_ENDPOINT = /\/\.netlify\/functions\/(accounts|contacts)/;

// One road to the context (the adversary's C33-C35; the fidelity review, #7): every path in a src file that leads to
// src/AppContext — an import's or a re-export's source, a dynamic import's or a require's argument, any string — is the
// source of an `import { useApp }` / `import { AppProvider }` by a path the guard's file pick reads (CTX_PATH). Answers
// each other road, 'file:line path'.
const roads = (P, file) => {
    const it = P.info(file);
    const house = (s) => s.type === 'ImportDeclaration' && CTX_PATH.test(s.source.value)
        && s.specifiers.every((sp) => sp.type === 'ImportSpecifier' && /^(useApp|AppProvider)$/.test(sp.imported.name ?? sp.imported.value));
    // Every road names AppContext in its text: when each time the text does is one of the house's imports, there is none.
    if (count(it.src, 'AppContext') === it.ast.program.body.filter(house).length) return [];
    const toCtx = (spec) => /^\.\.?\//.test(spec) && posix.normalize(posix.join(posix.dirname(file), spec)).replace(/\.jsx?$/, '') === 'src/AppContext';
    const out = [];
    const visit = (n, parent, key) => {
        const text = n.type === 'StringLiteral' ? n.value : n.type === 'TemplateLiteral' && !n.expressions.length ? n.quasis[0].value.cooked : null;
        if (text != null && toCtx(text) && !(key === 'source' && house(parent))) out.push(`${file}:${n.loc.start.line} ${text}`);
        for (const [k, c] of kids(n)) visit(c, n, k);
    };
    visit(it.ast.program, null, null);
    return out;
};

// A list a context function carries out, read by no screen (the adversary's C39): getAccountRollup's allContacts —
// App.jsx builds it from the whole list (APP_READS) and hands the function on the context. In every src file but
// App.jsx, a member read of it (`r.allContacts`, `r?.['allContacts']`) or a destructure naming it (`const { allContacts }
// = …`, at any depth) fails. A component's own prop of that name (AddContactToOppPanel's, ReportsTab.jsx) is a
// parameter, neither of these. Answers each read, 'file:line name'.
const CARRIED = { allContacts: "getAccountRollup's (App.jsx): every contact of the account's names, merged-away included — read by nothing (dead code, filed with the batch's flags, P40)" };
const CARRIED_TEXT = new RegExp(Object.keys(CARRIED).join('|'));
const carried = (P, file) => {
    const hits = [];
    const keyOf = (n, computed) => (computed ? (n.type === 'StringLiteral' ? n.value : null) : (n.name ?? n.value));
    const hit = (name, n) => { if (name != null && Object.hasOwn(CARRIED, name)) hits.push(`${file}:${n.loc.start.line} ${name}`); };
    const pattern = (p) => {
        if (p?.type === 'ObjectPattern') for (const q of p.properties) { if (q.type === 'ObjectProperty') { hit(keyOf(q.key, q.computed), q); pattern(q.value); } }
        else if (p?.type === 'ArrayPattern') p.elements.forEach(pattern);
        else if (p?.type === 'AssignmentPattern') pattern(p.left);
    };
    const visit = (n) => {
        if (/MemberExpression$/.test(n.type)) hit(keyOf(n.property, n.computed), n);
        if (n.type === 'VariableDeclarator') pattern(n.id);
        if (n.type === 'AssignmentExpression') pattern(n.left);
        for (const [, c] of kids(n)) visit(c);
    };
    visit(P.info(file).ast.program);
    return hits;
};

// What App.jsx takes from the two list hooks, key for key (the adversary's C40: a value built there from the whole list
// reaches the context unscanned — getSubAccounts took that road): [the keys that hand on rows, each with why; the keys
// that hand on none — setters, loaders, handlers, a modal's state]. A key taken that is not here fails until classified.
const LIST_HOOK_KEYS = {
    useAccounts: [{ accounts: 'every row, handed on whole (T6)', getSubAccounts: "an account's sub-accounts, merged-away ones left out (T3)" },
        'accountModalError accountModalSaving handleDeleteAccounts handleSaveAccount loadAccounts setAccountModalError setAccountModalSaving setAccounts'],
    useContacts: [{ contacts: 'every row, handed on whole (T6)' },
        'contactModalError contactModalSaving handleDeleteContacts handleSaveContact loadContacts setContactModalError setContactModalSaving setContacts'],
};
// Answers { hook: 'its keys, sorted' } for each list hook `fn` takes by a destructure; anything else of one fails.
const hookKeys = (fn) => {
    const taken = {};
    const visit = (n, d) => {
        if (/CallExpression$/.test(n.type) && n.callee.type === 'Identifier' && Object.hasOwn(LIST_HOOK_KEYS, n.callee.name)) {
            assert.ok(d?.type === 'VariableDeclarator' && d.init === n && d.id.type === 'ObjectPattern', `App.jsx: ${n.callee.name}() taken whole, or not by a destructure — the guard reads its keys by name`);
            assert.ok(!taken[n.callee.name], `App.jsx: ${n.callee.name}() called twice`);
            taken[n.callee.name] = d.id.properties.map((q) => {
                assert.ok(q.type === 'ObjectProperty' && !q.computed, `App.jsx: a rest element or a computed key of ${n.callee.name}() — the guard reads its keys by name`);
                return q.key.name ?? q.key.value;
            }).sort().join(' ');
        }
        for (const [, c] of kids(n)) visit(c, n);
    };
    visit(fn, null);
    return taken;
};

test("T8 — THE GUARD, class-wide (state §0.208): every file that takes the app's lists through useApp(), and every component a list is handed to, reads the whole list only through a shape that leaves merged-away rows out or resolves through them, or where named here with its reason and fate — a view, count, filter, picker or hand-off pointed at the whole list draws merged-away rows again (a parse of every screen); App.jsx and the list hooks pinned", () => {
    const all = srcFiles().filter((f) => f !== 'src/App.jsx');
    const g = guard(all, fromDisk);
    // A scan that finds nothing proves nothing: every file the parse picks, each with its own component, every key read.
    assert.ok(g.files.length >= 57, `the files that import useApp — 57 since §0.208: ${g.files.length} (a file that stopped taking the app's lists on purpose: lower the floor here and say why)`);
    for (const file of g.files) {
        const own = file.match(/(\w+)\.jsx?$/)[1];
        assert.ok(g.holders[file].some((n) => n === own || n === `${own}Host`),
            `${file}: its own component holds useApp() (found: ${g.holders[file].join(', ')}) — name the component after its file (or ${own}Host), so the guard can tell it found the file's own component`);
    }
    for (const key of WHOLE) assert.ok(g.reads.some((r) => r.key === key), `a read of ${key} found`);
    // Every component a list is handed to: reached, and named.
    for (const r of RECEIVERS) assert.ok(g.receivers.has(r), `the hand-off to ${r} not followed — is nothing handed to it any more? Then take it out of RECEIVERS`);
    assert.deepEqual([...g.receivers].filter((r) => !RECEIVERS.includes(r)).sort(), [], "a list handed to a component RECEIVERS does not name — name it there (its reads are scanned under the same rules)");
    // Every read is a shape or named, with its reason; each named read read as many times as said. A named line that
    // changed reads as both — an entry short of its count, and a read on a line not named, in the same file and of the
    // same key: said once, together, before either alone.
    const named = g.reads.filter((r) => !r.shape);
    const listed = (r) => (WHOLE_READS[r.file] || []).some(([key, line]) => key === r.key && line === r.line);
    const unlisted = named.filter((r) => !listed(r));
    const said = (r) => `${r.file}:${r.at} ${r.key} — ${r.line}`;
    for (const [file, entries] of Object.entries(WHOLE_READS)) {
        for (const [key, line, , why, fate] of entries) {
            assert.ok(why && FATES.has(fate), `${file}: ${line} — a reason and a fate (${key})`);
            assert.ok(!/until §0\.\d/.test(why), `${file}: ${line} — its reason names a step to come ("until §0.…"); the cleanup batch's steps are done: say why it stays`);
        }
    }
    const short = Object.entries(WHOLE_READS).flatMap(([file, entries]) => entries
        .filter(([key, line, times]) => named.filter((r) => r.file === file && r.key === key && r.line === line).length !== times)
        .map(([key, line, times]) => ({ file, key, line, times })));
    const changed = short.filter((e) => unlisted.some((r) => r.file === e.file && r.key === e.key));
    assert.deepEqual(changed.map((e) => `${e.file}: ${e.key} read ${e.times}× on: ${e.line}`), [],
        `a line WHOLE_READS names, not found as written — fixed? take it out of the list; moved or reworded? update its text there. The reads on lines it does not name, in the same files: ${unlisted.filter((r) => changed.some((e) => e.file === r.file && e.key === r.key)).map(said).join('; ')}`);
    assert.deepEqual(unlisted.map(said), [],
        "REGRESSION: the app's whole list read where a screen draws, counts, offers or hands on its rows — merged-away rows back on screen (a read that needs the whole list is a shape above, or named in WHOLE_READS with its reason; a call that resolves through the whole list: add it to RESOLVERS, with the test that runs it on a merged-away row)");
    assert.deepEqual(short.map((e) => `${e.file}: ${e.key} read ${e.times}× on: ${e.line}`), [], 'a line WHOLE_READS names, gone or read a different number of times — fixed? take it out of the list');
    // Each resolver: used, its module's own export, and run on a merged-away row by the test it names.
    for (const [name, [module, why, suite, label, carries]] of Object.entries(RESOLVERS)) {
        assert.ok(why, name);
        assert.ok(carries === undefined || carries === 'carries', `RESOLVERS: ${name} — its fifth element is 'carries' or nothing`);
        assert.ok(g.reads.some((r) => r.shape === `resolver:${name}`), `RESOLVERS: ${name} — no scanned read uses it: take it out of the list`);
        assert.ok(g.project.info(module).exported.has(name), `RESOLVERS: ${name} is not an export of ${module}`);
        assert.ok(runsOnMerged(suite, label, name), `RESOLVERS: ${name} — ${suite} "${label.slice(0, 60)}…" does not run it on a merged-away row`);
    }
    // A context handed on whole: each call named once, its callee a function of the file reading none of the lists.
    for (const [file, calls] of Object.entries(WHOLE_CONTEXT)) {
        const it = g.project.info(file);
        for (const [text, why] of calls) {
            assert.ok(why, text);
            const handed = g.context.filter((c) => c.file === file && c.text === text);
            assert.equal(handed.length, 1, `${file}: ${text} — the context handed on, once`);
            assert.equal(handed[0].reads, 0, `${file}: ${text} — its callee reads the four lists through the context it is handed (${handed[0].reads}): read them where useApp() is called, by key`);
            const fn = g.project.topFn(it, text.match(/^(\w+)\(/)[1]);
            assert.ok(fn, `${file}: ${text} — its callee a function of the file`);
            const keys = [];
            walk(fn.body, (id, path) => { const m = path.at(-1)?.node; if (/MemberExpression$/.test(m?.type) && !m.computed && WHOLE.includes(m.property.name)) keys.push(m.property.name); }, () => {});
            assert.deepEqual(keys, [], `${file}: ${text} — its callee reads none of the four lists`);
        }
    }
    // No other road to the context: AppContext.jsx exports the provider and useApp, never the context itself — no
    // default export, no export of all — and every path in src that leads to it is an import of one of the two (ROADS).
    const ctxFile = g.project.info('src/AppContext.jsx');
    assert.deepEqual([...ctxFile.exported].sort(), ['AppProvider', 'useApp'], 'the context object is not exported — useApp() is the one way in');
    assert.deepEqual(ctxFile.ast.program.body.filter((s) => /^Export(Default|All)Declaration$/.test(s.type)).map((s) => s.type), [], 'AppContext.jsx: no default export and no export of all — useApp() is the one way in');
    assert.deepEqual(srcFiles().filter(naming(/AppContext/)).flatMap((f) => roads(g.project, f)), [],
        "a road to the app's context other than import { useApp } (or { AppProvider }) from '…/AppContext' — a namespace or default import, a re-export, a dynamic import or another spelling of the path: the guard would not see the lists it hands on");
    // A list a context function carries out (CARRIED), read by no screen.
    assert.deepEqual(srcFiles().filter((f) => f !== 'src/App.jsx' && naming(CARRIED_TEXT)(f)).flatMap((f) => carried(g.project, f)), [],
        `REGRESSION: a screen reads a list a context function carries out — ${Object.entries(CARRIED).map(([k, why]) => `${k}: ${why}`).join('; ')}`);
    // App.jsx: its lists read only where named; none handed to a component as a prop.
    const app = g.project.info('src/App.jsx');
    const appFn = g.project.topFn(app, 'App');
    const tracked = new Map(), own = new Set();
    const bindings = (n) => {
        if (n.type === 'VariableDeclarator') {
            const hook = n.init?.type === 'CallExpression' && n.init.callee.type === 'Identifier' ? n.init.callee.name : null;
            if (n.id.type === 'ObjectPattern' && (hook === 'useAccounts' || hook === 'useContacts')) {
                for (const q of n.id.properties) {
                    const key = q.type === 'ObjectProperty' ? (q.key.name ?? q.key.value) : null;
                    if (key === (hook === 'useAccounts' ? 'accounts' : 'contacts')) { tracked.set(q.value.name, key); own.add(q.value); }
                }
            }
            if (n.id.type === 'Identifier' && (n.id.name === 'visibleAccounts' || n.id.name === 'visibleContacts')) { tracked.set(n.id.name, n.id.name); own.add(n.id); }
        }
        for (const [, c] of kids(n)) bindings(c);
    };
    bindings(appFn.body);
    assert.deepEqual([...tracked.keys()].sort(), ['accounts', 'contacts', 'visibleAccounts', 'visibleContacts'], "App's four lists found");
    // What App.jsx takes from the list hooks, key for key (LIST_HOOK_KEYS): a new value from one could hand on rows
    // built from the whole list, past every scan.
    for (const [rows] of Object.values(LIST_HOOK_KEYS)) for (const [key, why] of Object.entries(rows)) assert.ok(why, key);
    assert.deepEqual(hookKeys(appFn.body), Object.fromEntries(Object.entries(LIST_HOOK_KEYS).map(([hook, [rows, none]]) => [hook, [...Object.keys(rows), ...none.split(' ')].sort().join(' ')])),
        'REGRESSION: App.jsx takes a new value from a list hook (or no longer takes one) — does it hand on rows built from the whole list? Classify it in LIST_HOOK_KEYS (getSubAccounts leaves merged-away rows out, T3)');
    const appReads = [];
    walk(appFn.body, (id, path) => { if (tracked.has(id.name)) appReads.push({ key: tracked.get(id.name), line: app.lines[id.loc.start.line - 1].trim(), shape: shapeOf(g.project, app, id, path) }); },
        (id) => { if (tracked.has(id.name) && !own.has(id)) assert.fail(`App.jsx: ${id.name} declared again at line ${id.loc.start.line}`); });
    assert.deepEqual(appReads.filter((r) => r.shape && typeof r.shape === 'object').map((r) => r.line), [], 'App.jsx hands no list to a component as a prop');
    const appNamed = appReads.filter((r) => !r.shape);
    assert.deepEqual(appNamed.filter((r) => !APP_READS.some(([key, line]) => key === r.key && line === r.line)).map((r) => `${r.key} — ${r.line}`), [],
        "REGRESSION: App.jsx reads one of its lists where it draws or hands on rows — name it here with its reason");
    for (const [key, line, times, why] of APP_READS) {
        assert.ok(why, line);
        assert.equal(appNamed.filter((r) => r.key === key && r.line === line).length, times, `App.jsx: ${key} read ${times}× on: ${line}`);
    }
    // The list endpoints: GET only by the two hooks (a file whose text never names either endpoint is not parsed).
    const gets = [];
    for (const file of srcFiles().filter(naming(LIST_ENDPOINT))) {
        const it = g.project.info(file);
        const visit = (n, parent, key) => {
            const text = n.type === 'StringLiteral' ? n.value : n.type === 'TemplateLiteral' ? n.quasis[0].value.cooked : null;
            if (text != null && /^\/\.netlify\/functions\/(accounts|contacts)(?=$|[?/])/.test(text)) {
                const call = /CallExpression$/.test(parent?.type) && key === 'arguments' && parent.arguments[0] === n ? parent : null;
                const opts = call?.arguments[1];
                const write = !!call && ((opts?.type === 'ObjectExpression' && opts.properties.some((q) => q.type === 'ObjectProperty' && !q.computed && q.key.name === 'method' && !(q.value.type === 'StringLiteral' && q.value.value === 'GET')))
                    || (/MemberExpression$/.test(call.callee.type) && /^(postNew|putBulk)$/.test(call.callee.property.name)));
                if (!write) gets.push(`${file} — ${it.lines[n.loc.start.line - 1].trim()}`);
            }
            for (const [k, c] of kids(n)) visit(c, n, k);
        };
        visit(it.ast.program, null, null);
    }
    assert.deepEqual(gets, LIST_GETS, 'REGRESSION: a screen reads a list endpoint itself — outside THE GUARD (only the hooks load the lists the context hands on)');
});

test('T9 — the guard sees a view, count or hand-off pointed at the whole list in every form it reads (a shorthand among them, a property name never), follows a list into the component it is handed to, and refuses what would hide a read (made-up components)', () => {
    const scanOf = (map, opts) => guard(Object.keys(map), (p) => (p in map ? map[p].join('\n') : fromDisk(p)), opts);
    const reads = (g) => g.reads.map((r) => `${r.file.split('/').pop()}:${r.at} ${r.key} ${r.shape ?? 'NAMED'}`);
    const named = (g) => g.reads.filter((r) => !r.shape).map((r) => `${r.file.split('/').pop()}:${r.at} ${r.key}`);
    const HEAD = ["import { useApp } from '../AppContext';", "import { unarchived, isMergeArchived, resolveLink } from '../utils/pickLink.js';"];
    const made = (...body) => ({ 'src/Tabs/Made.jsx': [...HEAD, ...body] });
    // Every shape seen to see its read, and to refuse a form that would hide one.
    const g = scanOf(made(
        'export default function Made() {',
        '    const { contacts, visibleContacts: all, accounts: acc = [], settings } = useApp();',
        '    const visibleContacts = useMemo(() => unarchived(all), [all]);',
        '    const rows = (contacts || []).map(c => c.id);',
        '    const meta = { contacts: rows.length, label: settings.accounts, shared: { contacts } };',
        '    const one = acc.find(a => a.id === meta.id) || (acc || []).find(a => meta.id === a.id);',
        '    const byName = acc.find(a => a.name === meta.name);',
        '    const either = acc.find(a => a.id === meta.id || a.name === meta.name);',
        '    const live = acc.filter(a => a.ownerId && !isMergeArchived(a));',
        '    const gone = acc.filter(a => isMergeArchived(a));',
        '    const other = acc.filter(a => !isMergeArchived(one) && a.ownerId);',
        '    const link = resolveLink({ text: meta.name, records: acc }) || other({ records: acc });',
        '    return <Pane accounts={acc} count={contacts.length} rows={rows} live={unarchived(contacts)} />;',
        '}',
        'function Pane({ accounts: list = [], count }) {',
        '    return list.map(a => a.id).length + count;',
        '}',
    ));
    assert.deepEqual(g.holders, { 'src/Tabs/Made.jsx': ['Made'] });
    assert.deepEqual(reads(g), [
        'Made.jsx:5 visibleContacts live', 'Made.jsx:5 visibleContacts deps', 'Made.jsx:6 contacts NAMED', 'Made.jsx:7 contacts NAMED',
        'Made.jsx:8 accounts byId', 'Made.jsx:8 accounts byId', 'Made.jsx:9 accounts NAMED', 'Made.jsx:10 accounts NAMED',
        'Made.jsx:11 accounts liveOnly', 'Made.jsx:12 accounts NAMED', 'Made.jsx:13 accounts NAMED',
        'Made.jsx:14 accounts resolver:resolveLink', 'Made.jsx:14 accounts NAMED',
        'Made.jsx:15 accounts followed:Pane', 'Made.jsx:18 accounts NAMED', 'Made.jsx:15 contacts NAMED', 'Made.jsx:15 contacts live',
    ], "each read once, under the key it is bound from — { contacts: … }'s key, settings.accounts and an attribute's name are none; a lookup by name, by id OR name, a filter keeping merged-away rows or testing another row's mark, a call to anything but an imported resolver: each a read; the list handed to Pane read where Pane reads it");
    // A resolver's name declared in the file launders nothing.
    assert.deepEqual(named(scanOf({ 'src/Tabs/Made.jsx': [
        "import { useApp } from '../AppContext';",
        'function resolveLink(o) { return o.records; }',
        'export default function Made() {',
        '    const { accounts } = useApp();',
        '    return resolveLink({ records: accounts });',
        '}',
    ] })), ['Made.jsx:5 accounts'], 'a local resolveLink is no resolver');
    // A component bound to a const, a *Host, a deeper import: each found and read.
    const deep = scanOf({ 'src/components/made/Deep.jsx': [
        "import { useApp } from '../../AppContext';",
        'export const Deep = () => {',
        '    const { contacts } = useApp();',
        '    return contacts.length;',
        '};',
        'export function DeepHost() {',
        '    const { accounts } = useApp();',
        '    return accounts.length;',
        '}',
    ] });
    assert.deepEqual(deep.holders, { 'src/components/made/Deep.jsx': ['Deep', 'DeepHost'] });
    assert.deepEqual(named(deep), ['Deep.jsx:4 contacts', 'Deep.jsx:8 accounts']);
    // A whole-context binding: x.key and x?.key read; another key, a bare test, useApp().key; handed on whole, refused unless named.
    const ctx = scanOf(made(
        'export default function Made() {',
        '    const app = useApp();',
        "    if (app) app.escapeBlocked?.('x');",
        '    const n = app && app.settings ? app.contacts.length : 0;',
        '    return n + (app?.contacts || []).length + useApp().accounts.length + useApp().settings.length;',
        '}',
    ));
    assert.deepEqual(named(ctx), ['Made.jsx:6 contacts', 'Made.jsx:7 contacts', 'Made.jsx:7 accounts']);
    const callee = (...fn) => made('export default function Made() {', '    const app = useApp();', '    return fn(app);', '}', ...fn);
    const NAMED_FN = { context: { 'src/Tabs/Made.jsx': [['fn(app)', 'made up']] } };
    const handed = callee('function fn(ctx) {', '    return ctx.settings;', '}');
    assert.throws(() => scanOf(handed), /uses the app's context whole \(fn\(app\)\)/);
    assert.deepEqual(scanOf(handed, NAMED_FN).context, [{ file: 'src/Tabs/Made.jsx', text: 'fn(app)', reads: 0 }], 'named: handed on — its callee scanned, reading none of the lists');
    assert.throws(() => scanOf(made('export default function Made() {', '    const app = useApp();', '    const { contacts } = app;', '    return contacts;', '}')), /uses the app's context whole/);
    // The callee of a named hand-off (fidelity #8): the parameter the context lands in read as a whole-context binding —
    // a list read by key counted (T8 holds the count to none), a destructure of it refused; a callee the guard cannot
    // find, or a parameter that is no plain name, refused.
    const viaCallee = scanOf(callee('function fn(ctx) {', '    return (ctx?.contacts || []).length;', '}'), NAMED_FN);
    assert.deepEqual([viaCallee.context[0].reads, named(viaCallee)], [1, ['Made.jsx:8 contacts']], "the callee's read of a list through the context, seen");
    assert.throws(() => scanOf(callee('function fn(ctx) {', '    const { contacts } = ctx;', '    return contacts.length;', '}'), NAMED_FN), /uses the app's context whole/);
    assert.throws(() => scanOf(callee('function fn({ settings }) {', '    return settings;', '}'), NAMED_FN), /not a plain name/);
    assert.throws(() => scanOf(callee(), NAMED_FN), /a function the guard cannot find/);
    // A plain props parameter: props.<prop> and a later destructure followed; props used whole refused.
    const hop = (...pane) => made('export default function Made() {', '    const { contacts } = useApp();', '    return <P rows={contacts} />;', '}', ...pane);
    assert.deepEqual(named(scanOf(hop('function P(props) {', '    const { rows: list } = props;', '    return props.rows.length + list.length + props.title.length;', '}'))),
        ['Made.jsx:9 contacts', 'Made.jsx:9 contacts']);
    assert.throws(() => scanOf(hop('function P(props) {', '    return use(props);', '}')), /uses its props whole/);
    // A hop through a relative import, the list as `x || []`.
    const two = scanOf({
        'src/Tabs/made/Host.jsx': ["import { useApp } from '../../AppContext';", "import { Pane } from './Pane';", 'export default function Host() {', '    const { contacts } = useApp();', '    return <Pane rows={contacts || []} />;', '}'],
        'src/Tabs/made/Pane.jsx': ['export function Pane({ rows }) {', '    return rows.filter(r => r.ownerId).length;', '}'],
    });
    assert.deepEqual(named(two), ['Pane.jsx:2 contacts']);
    assert.ok(two.receivers.has('src/Tabs/made/Pane.jsx Pane'));
    // Refused: a receiver it cannot find, a spread, a rest element that would carry the list, a name declared again
    // (in a receiver too), a rest element or a computed key of useApp(), an alias of useApp, useApp() handed on, and
    // useApp itself handed on as a value.
    assert.throws(() => scanOf(hop()), /cannot find the component/);
    assert.throws(() => scanOf(made('export default function Made() {', '    const { contacts } = useApp();', '    return <P {...contacts} />;', '}', 'function P() { return null; }')), /spreads the app's whole list/);
    assert.throws(() => scanOf(hop('function P({ ...rest }) {', '    return rest.rows.length;', '}')), /a rest element or a computed key would hand rows on/);
    assert.throws(() => scanOf(hop('function P({ rows }) {', '    const f = (rows) => rows;', '    return f(rows);', '}')), /rows declared again at line 8/);
    assert.throws(() => scanOf(made('function Made() {', '    const { contacts } = useApp();', '    const count = (contacts) => contacts.length;', '    return count([]);', '}')), /declared again at line 5/);
    assert.throws(() => scanOf(made('function Made() {', '    const { ...ctx } = useApp();', '    return ctx.contacts.length;', '}')), /a rest element/);
    assert.throws(() => scanOf(made('function Made() {', "    const { ['contacts']: c } = useApp();", '    return c.length;', '}')), /a computed key/);
    assert.throws(() => scanOf({ 'src/Tabs/Made.jsx': ["import { useApp as useCtx } from '../AppContext';", 'export default function Made() {', '    const { contacts } = useCtx();', '    return contacts.length;', '}'] }), /imports useApp under another name/);
    assert.throws(() => scanOf(made('function Made() {', '    return use(useApp());', '}')), /neither destructured, bound to a name, nor read by a key/);
    assert.throws(() => scanOf(made('const ctx = useApp;', 'function Made() {', '    const { contacts } = ctx();', '    return contacts.length;', '}')), /useApp handed on as a value/);
    // useApp() called plainly finds its holder (every case above); `useApp?.()` refused (the adversary's C31).
    assert.throws(() => scanOf(made('export default function Made() {', '    const { contacts } = useApp?.() ?? {};', '    return contacts.length;', '}')), /useApp\?\.\(\) — call useApp\(\) plainly/);
    // A resolver: the list its direct argument, or the direct value of a property of an object literal that is one — no
    // read; anything else inside its arguments — an assignment (the adversary's C43), a filter, a spread — a read.
    const forms = scanOf({ 'src/Tabs/Made.jsx': [...HEAD, "import { linkedAccount } from '../utils/railLinks.js';",
        'export default function Made({ q, c }) {',
        '    const { accounts } = useApp();',
        '    let shown = [];',
        '    const a = resolveLink({ text: q, records: accounts }) && resolveLink({ records: accounts || [] }) && resolveLink({ accounts }) && linkedAccount(c, accounts);',
        '    const b = resolveLink({ text: q, records: (shown = accounts) }) && linkedAccount(c, accounts.filter(x => x.name === q)) && resolveLink({ records: [...accounts] });',
        '    return [a, b, shown];',
        '}',
    ] });
    assert.deepEqual(reads(forms), ['Made.jsx:7 accounts resolver:resolveLink', 'Made.jsx:7 accounts resolver:resolveLink', 'Made.jsx:7 accounts resolver:resolveLink',
        'Made.jsx:7 accounts resolver:linkedAccount', 'Made.jsx:8 accounts NAMED', 'Made.jsx:8 accounts NAMED', 'Made.jsx:8 accounts NAMED'], "a resolver's direct argument or property value is no read; an assignment, a filter or a spread inside its arguments is one");
    // A resolver whose answer carries the list it was given (contactIndex — the adversary's C22): the name its answer is
    // bound to is scanned as the list — handed to another resolver, no read; drawn, a read; left unbound, refused.
    const carrier = (...body) => ({ 'src/Tabs/Made.jsx': [...HEAD, "import { contactIndex, dealCommittee } from '../utils/dealEngagement.js';", ...body] });
    assert.deepEqual(reads(scanOf(carrier(
        'export default function Made({ deal }) {',
        '    const { contacts } = useApp();',
        '    const directory = contactIndex(contacts);',
        '    const people = dealCommittee(deal, directory, []);',
        '    return people.length + directory.list.length;',
        '}',
    ))), ['Made.jsx:6 contacts resolver:contactIndex', 'Made.jsx:7 contacts resolver:dealCommittee', 'Made.jsx:8 contacts NAMED'], "the carrier's answer read as the list it carries");
    assert.deepEqual(named(scanOf(carrier('export default function Made() {', '    const app = useApp();', '    const d = contactIndex(app.contacts);', '    return d.byId.size;', '}'))),
        ['Made.jsx:7 contacts'], "through a whole-context binding too");
    assert.throws(() => scanOf(carrier('export default function Made() {', '    const { contacts } = useApp();', '    return useMemo(() => contactIndex(contacts).list, [contacts]).length;', '}')), /contactIndex\(…\) hands back the list it is given — bind its answer to a name/);
    assert.throws(() => scanOf(carrier('export default function Made() {', '    const { contacts } = useApp();', '    const { list } = contactIndex(contacts);', '    return list.length;', '}')), /bind its answer to a name/);
    // A dependency array is React's (the adversary's C45): a hook imported from react, React.<hook>, or one the file
    // neither imports nor declares — no read; a file's own useMemo, or one imported from elsewhere — a read.
    const depsOf = (...pre) => reads(scanOf({ 'src/Tabs/Made.jsx': [...HEAD, ...pre, 'export default function Made() {', '    const { accounts } = useApp();', '    return useMemo(() => 1, [accounts]) + React.useMemo(() => 2, [accounts]);', '}'] }));
    assert.deepEqual(depsOf("import React, { useMemo } from 'react';"), ['Made.jsx:6 accounts deps', 'Made.jsx:6 accounts deps']);
    assert.deepEqual(depsOf("import React from 'react';", 'const useMemo = (f, deps) => deps[0];'), ['Made.jsx:7 accounts NAMED', 'Made.jsx:7 accounts deps']);
    assert.deepEqual(depsOf("import React from 'react';", "import { useMemo } from '../utils/memo.js';"), ['Made.jsx:7 accounts NAMED', 'Made.jsx:7 accounts deps']);
    // A component a list is handed to, declared once in its file (the adversary's C48): a local alias of its name refused.
    assert.throws(() => scanOf(made('function Pane() { return null; }', 'function Rich({ rows }) { return rows.length; }', 'export default function Made() {',
        '    const { accounts } = useApp();', '    const Pane = Rich;', '    return <Pane rows={accounts} />;', '}')), /<Pane> is declared more than once in the file/);
    // One road to the context (ROADS; the adversary's C33-C35): the house's imports pass; a namespace, default or
    // re-export of it, a dynamic import, an export of all, or another spelling of its path each fail.
    const roadsOf = (map) => { const P = project((p) => (p in map ? map[p].join('\n') : fromDisk(p))); return Object.keys(map).flatMap((f) => roads(P, f)); };
    assert.deepEqual(roadsOf({
        'src/Tabs/Made.jsx': ["import { useApp } from '../AppContext';"],
        'src/components/made/Deep.jsx': ["import { useApp } from '../../AppContext.jsx';"],
        'src/Made.jsx': ["import { AppProvider } from './AppContext';", "const words = 'AppContext';"],
    }), [], "the house's imports, and a string that is no path to it");
    assert.deepEqual(roadsOf({
        'src/Tabs/A.jsx': ["import * as Ctx from '../AppContext';"],
        'src/Tabs/B.jsx': ["export { useApp } from '../AppContext';"],
        'src/Tabs/C.jsx': ["import { useApp } from '../../src/AppContext';"],
        'src/Tabs/D.jsx': ['const ctx = () => import(`../AppContext`);'],
        'src/Tabs/E.jsx': ["import Ctx, { useApp } from '../AppContext';"],
        'src/Tabs/F.jsx': ["export * from '../AppContext.jsx';"],
    }), ['src/Tabs/A.jsx:1 ../AppContext', 'src/Tabs/B.jsx:1 ../AppContext', 'src/Tabs/C.jsx:1 ../../src/AppContext', 'src/Tabs/D.jsx:1 ../AppContext',
        'src/Tabs/E.jsx:1 ../AppContext', 'src/Tabs/F.jsx:1 ../AppContext.jsx'], 'every other road to the context');
    // A list a context function carries out (CARRIED; the adversary's C39): the rollup's other members and a component's
    // own prop of the name are no read; a member read of it, or a destructure naming it, at any depth, each one.
    const carriedOf = (...lines) => carried(project((p) => (p === 'src/Tabs/R.jsx' ? lines.join('\n') : fromDisk(p))), 'src/Tabs/R.jsx');
    assert.deepEqual(carriedOf('export function R({ acc, getAccountRollup }) {', '    const r = getAccountRollup(acc);', '    return r.subCount + r.pipeline;', '}',
        'export function Panel({ allContacts }) { return allContacts.length; }'), [], "the rollup's other members; a component's own prop");
    assert.deepEqual(carriedOf('export function R({ acc, getAccountRollup }) {', '    const r = getAccountRollup(acc);', '    const { allContacts } = getAccountRollup(acc);',
        '    const { rollup: { allContacts: deep } } = { rollup: r };', "    return r.allContacts.length + r?.['allContacts'].length + allContacts.length + deep.length;", '}'),
    ['src/Tabs/R.jsx:3 allContacts', 'src/Tabs/R.jsx:4 allContacts', 'src/Tabs/R.jsx:5 allContacts', 'src/Tabs/R.jsx:5 allContacts'], 'each read of the carried list');
    // What App.jsx takes from a list hook, key by key (LIST_HOOK_KEYS; the adversary's C40): a new key shows — T8
    // refuses it until classified; a rest element, or the hook taken whole, refused.
    const appOf = (...lines) => parse(lines.join('\n'), { sourceType: 'module', plugins: ['jsx'] }).program.body[0];
    const took = hookKeys(appOf('function App() {', '    const { accounts, setAccounts } = useAccounts(_deps);', '    const { contacts, contactsOfCompany } = useContacts(_deps);', '}'));
    assert.deepEqual(took, { useAccounts: 'accounts setAccounts', useContacts: 'contacts contactsOfCompany' }, 'every key App takes, by name');
    assert.throws(() => hookKeys(appOf('function App() {', '    const { accounts, ...rest } = useAccounts(_deps);', '}')), /a rest element or a computed key of useAccounts/);
    assert.throws(() => hookKeys(appOf('function App() {', '    const hook = useContacts(_deps);', '}')), /useContacts\(\) taken whole/);
});

// ── T10: the server's reads of either table ─────────────────────────────────

// Every function that imports `accounts` or `contacts` from the schema, [why, its selects, its hand-offs]: selects —
// each `.from(<table>)`; hand-offs — every other use of the table object: handed to code that selects through it (a
// generic `from(table)` in a helper, a table map, a raw-SQL fragment), to a helper such as `ownerColumnOf(accounts)`, or
// compared (`table === accounts`, _links.mjs) — each counted, so a new one is seen. A write (`.insert`, `.update`,
// `.delete`) and a column (`accounts.orgId`) are neither. A new select or hand-off in a named file fails until it is
// classified here; a function newly reading either table fails until it is named. The generic helpers (_bulk.mjs,
// _lib.mjs) import neither table: they select only through one a caller hands them, counted at the caller. Two roads
// past the import are refused outright: `db.query.accounts` / `db.query.contacts` (db/index.ts builds `db` with the
// schema, so the relational query reads a table it never imports), and raw SQL naming either table in any string.
const KEEP = 'keep whole';
const SERVER_READS = {
    'netlify/functions/accounts.mjs': [`${KEEP}: the GET answers every row of the org, narrowed by the read scope alone (T6), and the Admin's clear reads every account of the org (everyAccount — an open deal on any refuses the clear); the rest read by id — a save's prior row, a delete's lift, a batch's own ids — and the parent rule's names (a merged-away namesake counted as one of the name — found by the cleanup batch's maps, 18 Oct, for batch 3)`, 9, 7],
    'netlify/functions/contacts.mjs': [`${KEEP}: the GET answers every row (T6), and the one-request clear compares the whole list; the rest by id`, 6, 7],
    'netlify/functions/backup.mjs': [`${KEEP}: an org's backup holds every row`, 2, 2],
    'netlify/functions/export-runs.mjs': [`${KEEP}: a Settings → Data export run exports every row of the scope (its SCOPE_TABLE)`, 0, 2],
    'netlify/functions/merge.mjs': [`${KEEP}: the merge and its Undo (state §0.207) read both records, the ones merged away included, by id`, 13, 13],
    'netlify/functions/_links.mjs': [`${KEEP}: a link names a row of the org by id — a merged-away one is a row, its link named by its survivor on screen (guide §18b99)`, 0, 7],
    'netlify/functions/duplicates.mjs': ['filter in JS: the duplicate scans leave merged-away rows out (`!c.mergeArchived`, `!a.mergeArchived`)', 2, 0],
    'netlify/functions/ai-score.mjs': ["follow to the survivor: a deal's people by id, a merged duplicate followed to the contact it was merged into (up to five steps, as contactIndex)", 1, 0],
    'netlify/functions/opportunities.mjs': ["follow to the survivor: a deal's account by id (accountLink), one merged away followed to the account it was merged into — the bulk paths' too, by the same rule over the accounts read for the batch (bulkDealLinks, state §0.216)", 3, 0],
    'netlify/functions/quote-email.mjs': ["filter in JS: the quote's fallback recipient is the first live contact named like the deal's first contact (`c.mergeArchived !== true`, NULL live — state §0.210; tests/merged-away-cleanup.test.mjs C21)", 1, 0],
    'netlify/functions/quote-to-job.mjs': ["follow to the survivor: the deal's account as Dispatch's screen finds it (dispatchCustomer.js customerForDeal through pickLink.js accountForDeal) — by its link, one merged away followed to the account it was merged into; a deal with no account id the one LIVE account of its name — over every account of the org, merge marks included (state §0.214; tests/dispatch-customer.test.mjs)", 1, 0],
    'netlify/functions/public-api.mjs': ["filter in SQL: the public API's accounts and contacts leave merged-away rows out, in `conds` (`is not true`, NULL live), so its totals count what it lists (state §0.210; Jeff, 18 Oct: \"Leave them out\"; C20)", 4, 0],
    'netlify/functions/report-deliveries.mjs': ['the engine: loadReportData hands runReport (reportQuery.js) every account the owner may read (all of the org, or their own for a role that sees only its own), and runReport leaves merged-away accounts out of the Accounts source, a deal on one counted on its survivor (state §0.210; C15)', 0, 1],
    'netlify/functions/documents.mjs': ["filed: a document's links resolve by id and follow no merge (resolveLinks; filed: OPEN_ITEMS §4.2, documents.mjs follows no merge)", 0, 2],
    'netlify/functions/email-inbound.mjs': ["filed: an inbound email's contact is the first of every contact with the address, merged-away included (filed: OPEN_ITEMS §4.7, the matched-by-name item)", 1, 0],
};

// A function file's [selects, hand-offs] of either table, or null when it imports neither; a road T10 cannot count fails.
const RAW_SQL = /\b(from|join|update|into)\s+(?:"?public"?\s*\.\s*)?"?(accounts|contacts)\b/i;
const serverReads = (file, src) => {
    const ast = parse(src, { sourceType: 'module' });
    const tables = new Set();
    for (const s of ast.program.body) {
        if (s.type !== 'ImportDeclaration' || !/(^|\/)db\/schema(\.[jt]s)?$/.test(s.source.value)) continue;
        for (const sp of s.specifiers) {
            assert.equal(sp.type, 'ImportSpecifier', `${file}: the schema imported whole — T10 cannot count its tables`);
            if (/^(accounts|contacts)$/.test(sp.imported.name ?? sp.imported.value)) tables.add(sp.local.name);
        }
    }
    let selects = 0, handed = 0;
    const visit = (n, parent, key) => {
        // No raw SQL names either table but through the table object (a `${accounts}` fragment is a hand-off).
        const text = n.type === 'StringLiteral' ? n.value : n.type === 'TemplateElement' ? n.value.raw : null;
        if (text && RAW_SQL.test(text)) {
            assert.fail(`${file}:${n.loc.start.line} raw SQL names a table T10 cannot count — ${text.trim().slice(0, 80)} — select through the table object (a \`\${accounts}\` fragment is counted); if this is not SQL but words a person reads, reword them: T10 reads every string of a function as SQL`);
        }
        // db.query.accounts / db.query.contacts: the relational query reads the table with no import of it.
        if (/MemberExpression$/.test(n.type) && /MemberExpression$/.test(n.object.type) && !n.object.computed && n.object.property.name === 'query'
            && /^(accounts|contacts)$/.test(n.computed ? (n.property.type === 'StringLiteral' ? n.property.value : '') : n.property.name)) {
            assert.fail(`${file}:${n.loc.start.line} reads a table through db.query — T10 cannot count it: select through the imported table object`);
        }
        if (n.type === 'Identifier' && tables.has(n.name)) {
            if (parent?.type === 'ImportSpecifier' || (/MemberExpression$/.test(parent?.type) && (key === 'object' || (key === 'property' && !parent.computed)))
                || (parent?.type === 'ObjectProperty' && key === 'key' && !parent.computed)) return;
            const method = /CallExpression$/.test(parent?.type) && key === 'arguments' && /MemberExpression$/.test(parent.callee.type) && !parent.callee.computed ? parent.callee.property.name : null;
            if (method === 'from') selects++;
            else if (!/^(insert|update|delete)$/.test(method || '')) handed++;
            return;
        }
        for (const [k, c] of kids(n)) visit(c, n, k);
    };
    visit(ast.program, null, null);
    return tables.size ? [selects, handed] : null;
};

test("T10 — the server's reads of either table: every function that imports accounts or contacts from the schema is named with its reason, its selects and hand-offs counted — a new list answer in a named function, or a function newly reading either table, fails until classified (a parse of every function)", () => {
    // Every .mjs under netlify/functions/, a folder's too.
    const fnFiles = (dir) => readdirSync(new URL(`${dir}/`, ROOT), { withFileTypes: true })
        .flatMap((e) => (e.isDirectory() ? fnFiles(`${dir}/${e.name}`) : (e.name.endsWith('.mjs') ? [`${dir}/${e.name}`] : [])));
    const found = {};
    for (const file of fnFiles('netlify/functions').sort()) {
        const counted = serverReads(file, read(file));
        if (counted) found[file] = counted;
    }
    assert.ok(Object.keys(found).length >= 14, `the functions that read either table — fourteen since §0.208: ${Object.keys(found).length} (one that stopped reading them on purpose: take it out of SERVER_READS, lower the floor here and say why)`);
    assert.deepEqual(Object.keys(found).filter((f) => !Object.hasOwn(SERVER_READS, f)), [], 'REGRESSION: a function reads accounts or contacts and is not named — does it answer merged-away rows? Name it in SERVER_READS with its reason');
    for (const [file, [why, selects, handed]] of Object.entries(SERVER_READS)) {
        assert.ok(why, file);
        assert.ok(!/until §0\.\d/.test(why), `${file}: its reason names a step to come ("until §0.…"); the cleanup batch's steps are done: say what it reads`);
        assert.deepEqual(found[file], [selects, handed], `${file}: ${selects} select(s) and ${handed} hand-off(s) of either table — a new one (or one gone) is classified here first`);
    }
    // Its rules, on made-up function files: a select and a hand-off counted, a write and a column neither; a function
    // importing neither table, null; the schema imported whole, raw SQL naming a table (schema-qualified too), and
    // db.query.<table>, each refused.
    const fn = (...lines) => lines.join('\n');
    const IMPORT = "import { accounts, contacts as people, users } from '../../db/schema.js';";
    assert.deepEqual(serverReads('made.mjs', fn(IMPORT, 'export const a = (db) => db.select().from(accounts).where(eq(accounts.orgId, 1));',
        'export const b = (db) => db.insert(people).values({}); export const c = (db) => everyRow(db, people); export const d = (t) => t === accounts;')), [1, 2]);
    assert.equal(serverReads('made.mjs', fn("import { users } from '../../db/schema.js';", 'export const a = (db) => db.select().from(users);')), null);
    assert.throws(() => serverReads('made.mjs', fn("import * as schema from '../../db/schema.js';", 'export const a = (db) => db.select().from(schema.accounts);')), /the schema imported whole/);
    assert.throws(() => serverReads('made.mjs', fn(IMPORT, 'export const a = (db) => db.execute(sql`select * from contacts where org_id = ${1}`);')), /raw SQL names a table/);
    assert.throws(() => serverReads('made.mjs', fn(IMPORT, "export const a = (db) => db.execute(sql.raw('SELECT id FROM public.accounts'));")), /raw SQL names a table/);
    assert.throws(() => serverReads('made.mjs', fn("import { users } from '../../db/schema.js';", 'export const a = (db) => db.query.contacts.findMany();')), /reads a table through db\.query/);
});
