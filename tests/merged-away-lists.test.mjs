// tests/merged-away-lists.test.mjs
//
// A merged-away account or contact leaves the lists the screens draw (state §0.206 — OPEN_ITEMS §1 item 1). Jeff,
// 16 Oct, after merging UKG's "Resinall, Inc." into "Resinall": "It said it did it but both still show on the account
// list"; "Hide them" — merged-away accounts leave the Accounts tab and Sub-Accounts, the record kept (its Undo and the
// links that resolve through it unchanged); "Right after 4b-2c" — a batch of its own, the Contacts tab checked for
// the same gap with it; "Hide contacts too" — merged-away contacts leave the Contacts tab, an account's People list
// and the contact counts, in the same batch. Not here ("Undo as its own batch next", "One cleanup batch next"): a
// merge's Undo on screen, and the other lists, counts and pickers.
//
// Before: a merge stored the record merged away (merge_archived, merged_into_id, archived_at), and the merge hook
// dropped it from the screen — then read the list again, and the accounts and contacts GETs answer every row of the
// org, so it came straight back. Since §0.198 the pickers left it out (unarchived) — all but four, the cleanup
// batch's (OPEN_ITEMS §1: the document link picker, Dispatch's two account pickers and Reports' "add contacts to
// this deal"); no list did: the Accounts tab, an account's Sub-Accounts (the tab's badge and drawer, the rail's
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
// before (10aa4b5), run once on the same rows, so the rows are seen to tell the two apart. THE GUARD (T8; T9 runs
// its scan on made-up components): a parse of each tab component holds every read of the app's whole lists to a
// named few, each with its reason, so a view, count or hand-off pointed at the whole list fails it; five lines the
// mutation harness breaks are held by it alone (the Accounts tab's Signal sort and "Needs attention" lane, the
// Contacts tab's Company view, name-sorted rows and header count). Pinned, line for line: every other line the
// harness breaks — it runs the unit suites only (scripts/mutate-import.mjs) — and the layers that must keep the
// rows, each GET's code whole. No server code changed: there is no integration suite for this batch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
import { unarchived, isMergeArchived, resolveLink } from '../src/utils/pickLink.js';
import { linkedAccount, outOfList } from '../src/utils/railLinks.js';

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
// The delete's confirm: the sub-accounts the server will move to the top level.
const PARENT_OF = ind(8, 'const parentOf = (a) => a.parentAccountId || a.parentId || null;');
const CHILDREN = ind(8, 'const children = accounts.filter(a => goingIds.includes(parentOf(a)) && !goingIds.includes(a.id));');

test("T3 — an account's Sub-Accounts: one merged away is not listed — the tab's badge and drawer, the rail's section and App's rollup read the hook's one rule; the delete's confirm counts what the server lifts, merged-away rows included (run as written)", () => {
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
    // accounts.mjs lifts each row naming the deleted account, merged away or not: the confirm reads the whole list.
    order(hook, PARENT_OF, CHILDREN);
    once(hook, CHILDREN);
    assert.deepEqual(ids(run([PARENT_OF, CHILDREN], ['accounts', 'goingIds'], [ACCOUNTS, ['acc_evonik']], 'children')),
        ['acc_lafayette', 'acc_lafayette_dup', 'acc_mobile', 'acc_legacy'],
        "REGRESSION: the delete's confirm leaves out a merged-away sub-account the server lifts — it under-counts");
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
// The account's contacts, its whole list (by accountId, else by company name): the Activity tab's contact ids read it.
const RAIL_CONTACTS = [
    ind(4, 'const accountContacts = (contacts || []).filter(c =>'),
    ind(8, 'c.accountId ? c.accountId === account?.id : (c.company === account?.name)'),
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
    order(rail, ...RAIL_CONTACTS, RAIL_SHOWN);
    const accountContacts = run(RAIL_CONTACTS, ['contacts', 'account'], [CONTACTS, { id: 'acc_resinall', name: 'Resinall' }], 'accountContacts');
    assert.deepEqual(ids(accountContacts), ['con_lee', 'con_lee_dup', 'con_ana'],
        "REGRESSION: the account's contacts leave a merged-away contact out at their source — its Activity tab drops that contact's activities (their contact ids still name it)");
    assert.deepEqual(ids(run([RAIL_SHOWN], ['unarchived', 'accountContacts'], [unarchived, accountContacts], 'shownContacts')), ['con_lee', 'con_ana'],
        'REGRESSION: Lee Ng listed twice under Resinall after the contact merge');
    // CONTACTS, the People heading ("Contacts (2)" over one row), its empty line (an account whose contacts are all
    // merged away drew nothing), its rows; SUB-ACCTS, and the Sub-Accounts section's test, heading and rows (the
    // re-check, 17 Oct: its rows or its test pointed at the app's whole list passed every suite — Evonik's merged-away
    // site listed again, or "Sub-Accounts (0)" over none). THE GUARD (T8) reads the two tabs only: the rail's other
    // reads of the app's lists are not scanned.
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
    // The scan re-runs when the list's length changes (DuplicateScanView, ContactDuplicateScanView): a merge that marked
    // the row instead of dropping it would leave the merged pair offered, and its second merge answers 409.
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

// ── THE GUARD: every read of the app's whole lists in each tab ──────────────

// The lists the app's context hands every screen, merged-away rows kept (T6): `accounts` and `contacts` every row the
// caller may read, `visibleAccounts` and `visibleContacts` narrowed by App.jsx's isRepVisible (the accounts to the top
// level too), never by a merge. Wherever a tab reads one but through unarchived, it draws or counts merged-away rows.
const WHOLE = ['accounts', 'contacts', 'visibleAccounts', 'visibleContacts'];
// Each tab's reads of them, each with why it may read the whole list: [the context's key, the read's line, how many
// reads on it, why]. Any other read — a view, count, filter or hand-off pointed at the whole list (the review, 16 Oct:
// the Signal view's sort, a Business Book lane, the Company view, the name-sorted rows, the header count) — fails.
const WHOLE_READS = {
    'src/Tabs/AccountsTab.jsx': [
        ['visibleAccounts', 'const live = unarchived(allVisibleAccounts);', 1, "the tab's one list: the app's top-level accounts, the merged-away left out (T1)"],
        ['visibleAccounts', '}, [scope, allVisibleAccounts, currentUserId]);', 1, "that list's dependencies — it is worked out again when the app's list changes; nothing is drawn from them"],
        ['contacts', 'const shownContacts = useMemo(() => unarchived(contacts), [contacts]);', 2, "the contacts a row's \"N contacts\" and the Sub-accounts drawer count, the merged-away left out (T5), and its dependency"],
    ],
    'src/Tabs/ContactsTab.jsx': [
        ['visibleContacts', 'const live = unarchived(allVisibleContacts);', 1, "the tab's one list: the app's contacts, the merged-away left out (T2)"],
        ['visibleContacts', '}, [scope, allVisibleContacts, currentUserId]);', 1, "that list's dependencies — nothing is drawn from them"],
        ['accounts', 'accounts={accounts}', 1, "the Company view's card finds its account by name among every account (CompanyTwoPane's matchedAccount) — it lists none; a merged-away account of the same name can match: found with §0.206, filed (OPEN_ITEMS §4.7), not changed here"],
    ],
};
const FN = /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression|ObjectMethod|ClassMethod|ClassPrivateMethod)$/;
const NOT_CHILD = new Set(['loc', 'start', 'end', 'extra', 'range', 'leadingComments', 'trailingComments', 'innerComments']);
const kids = (n) => Object.keys(n).filter((k) => !NOT_CHILD.has(k))
    .flatMap((k) => (Array.isArray(n[k]) ? n[k].map((c) => [k, c]) : [[k, n[k]]]))
    .filter(([, c]) => c && typeof c.type === 'string');
// A property's own name — a.contacts, { contacts: x }, a method's — reads no list of that name.
const isName = (parent, key) => !!parent && !parent.computed && (
    (/MemberExpression$/.test(parent.type) && key === 'property')
    || (/^(ObjectProperty|ObjectMethod|ClassMethod|ClassPrivateMethod|ClassProperty|ClassPrivateProperty)$/.test(parent.type) && key === 'key'));
// Walks a function's body: onRead(id) for each name read (a shorthand { contacts } and a dependency list among them),
// onBind(id) for each name declared — a variable, a parameter, a function's or a class's own name, a catch's.
const walk = (node, onRead, onBind) => {
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
            if (!isName(parent, key) && key !== 'label') onRead(n);
            return;
        }
        if (n.type === 'VariableDeclarator') { pattern(n.id); expr(n.init, n, 'init'); return; }
        if (n.type === 'CatchClause') { pattern(n.param); expr(n.body, n, 'body'); return; }
        if (FN.test(n.type) || /^Class(Declaration|Expression)$/.test(n.type)) {
            if (n.id) onBind(n.id);
            if (n.computed) expr(n.key, n, 'key');
            (n.params || []).forEach(pattern);
            expr(n.superClass, n, 'superClass');
            expr(n.body, n, 'body');
            return;
        }
        for (const [k, c] of kids(n)) expr(c, n, k);
    };
    expr(node);
};
// Every useApp() destructure in a file, and each read — in the function that holds it — of a whole list it takes:
// { key, line, at }. A useApp() not destructured, a rest element or a name declared again would hide reads: refused.
const wholeReads = (src) => {
    const lines = src.split('\n');
    const isUseApp = (c) => c?.type === 'CallExpression' && c.callee.type === 'Identifier' && c.callee.name === 'useApp';
    const takes = [];
    let calls = 0;
    const find = (n, fns) => {
        if (isUseApp(n)) calls++;
        if (n.type === 'VariableDeclarator' && n.id.type === 'ObjectPattern' && isUseApp(n.init)) takes.push({ decl: n, fn: fns.at(-1) });
        for (const [, c] of kids(n)) find(c, FN.test(n.type) ? [...fns, n] : fns);
    };
    find(parse(src, { sourceType: 'module', plugins: ['jsx'] }).program, []);
    assert.equal(takes.length, calls, 'every useApp() is a destructure the scan reads — none hands the context on whole');
    const reads = [];
    for (const { decl, fn } of takes) {
        assert.ok(fn, 'useApp() is called inside a component');
        const local = new Map();   // the name a whole list is bound to -> its key in the context
        const own = new Set();     // the names the destructure itself declares
        for (const p of decl.id.properties) {
            assert.notEqual(p.type, 'RestElement', 'a rest element would hand every list on under another name');
            const v = p.value.type === 'AssignmentPattern' ? p.value.left : p.value;
            own.add(v);
            const key = p.computed ? null : (p.key.name ?? p.key.value);
            if (!WHOLE.includes(key)) continue;
            assert.equal(v.type, 'Identifier', `${key}: destructured further — the scan follows names`);
            local.set(v.name, key);
        }
        walk(fn.body,
            (id) => { if (local.has(id.name)) reads.push({ key: local.get(id.name), line: lines[id.loc.start.line - 1].trim(), at: id.loc.start.line }); },
            (id) => { if (local.has(id.name) && !own.has(id)) assert.fail(`${id.name} declared again at line ${id.loc.start.line} — it shadows the app's list, and the scan could not tell its reads apart`); });
    }
    return { fns: takes.map((t) => t.fn.id?.name ?? null), reads };
};

test("T8 — THE GUARD — each tab reads the app's whole lists only where named here, each with its reason: a view, count, filter or hand-off pointed at the whole list draws merged-away rows again, or the tab fails to load (a parse of each tab component)", () => {
    for (const [file, named] of Object.entries(WHOLE_READS)) {
        const src = read(file);
        assert.ok(src.includes("import { useApp } from '../AppContext';") && !/\buseContext\b/.test(src), `${file}: the app's lists through useApp() alone`);
        const { fns, reads } = wholeReads(src);
        assert.ok(fns.includes(file.match(/(\w+)\.jsx$/)[1]), `${file}: the tab's own useApp() found (a scan that finds nothing proves nothing)`);
        const allowed = new Set(named.map(([key, line]) => `${key} | ${line}`));
        assert.deepEqual(reads.filter((r) => !allowed.has(`${r.key} | ${r.line}`)).map((r) => `${file}:${r.at} ${r.key} — ${r.line}`), [],
            "REGRESSION: the app's whole list read where the tab draws its rows, counts or views — merged-away rows back on screen, or the tab failing to load (a read the tab needs whole is named above, with its reason)");
        for (const [key, line, times] of named) {
            assert.equal(reads.filter((r) => r.key === key && r.line === line).length, times, `${file}: ${key} read ${times}× on: ${line} — gone or moved: take it out of the list`);
        }
    }
});

test('T9 — the guard sees a view, count or hand-off pointed at the whole list (a shorthand among them, a property name never), and refuses a name declared again, a rest element and a useApp() not destructured (made-up components)', () => {
    const tab = [
        'export default function Tab() {',
        '    const { contacts, visibleContacts: all, accounts: acc, settings } = useApp();',
        '    const visibleContacts = useMemo(() => unarchived(all), [all]);',
        '    const rows = (contacts || []).map(c => c.id);',
        '    const meta = { contacts: rows.length, label: settings.accounts, shared: { contacts } };',
        '    return <Pane accounts={acc} count={contacts.length} rows={rows} meta={meta} />;',
        '}',
    ].join('\n');
    const { fns, reads } = wholeReads(tab);
    assert.deepEqual(fns, ['Tab']);
    assert.deepEqual(reads.map((r) => `${r.at} ${r.key}`), ['3 visibleContacts', '3 visibleContacts', '4 contacts', '5 contacts', '6 accounts', '6 contacts'],
        "each read once, under the key it is bound from; { contacts: … }'s key, settings.accounts and an attribute's name are none");
    const component = (...body) => ['function Tab() {', ...body, '}'].join('\n');
    assert.throws(() => wholeReads(component('    const { contacts } = useApp();', '    const count = (contacts) => contacts.length;', '    return count([]);')), /declared again at line 3/);
    assert.throws(() => wholeReads(component('    const { ...ctx } = useApp();', '    return ctx.contacts.length;')), /a rest element/);
    assert.throws(() => wholeReads(component('    const ctx = useApp();', '    return ctx.contacts.length;')), /every useApp\(\) is a destructure/);
});
