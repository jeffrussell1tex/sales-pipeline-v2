// §0.173 (Jeff: "go with your recommendation") — the 2 Oct audit's last reports,
// re-read and checked in the pane, and the first sign-in's last gap:
//   1. In the commit of an org switch a tab's effect fetched with the PREVIOUS
//      org's token (observed on Home's pinned reports): the token getter closed
//      over the org of the render that installed it, and App's effects run after
//      its children's.
//   2. The lists were not emptied on a switch and took any answer: the last org's
//      rows stayed under the new org's name until each answer landed — for good
//      when one failed — and a late answer could land over the new org's.
//   3. Tabs that load once kept the last org's rows (Reports' saved list, Leads'
//      requests), and the profile panel kept the last org's email-logging address
//      — mail BCC'd to it was filed in that org (observed).
//   4. The Sales Manager tab returned early between its hooks: a switch while it
//      was open threw "Rendered fewer hooks than expected" (observed).
//   5. QuotesTab held the org's tiers, approver names and product types in
//      module-level variables assigned after the render that read them.
//   6. Pipeline's saved views were one browser list for every org.
//   7. QuickLog minted 'act_' + Date.now(); the first sign-in's email step
//      answered with a row linked to another identity.
//
// Run here: the REAL request-org rule (storage.js). Scanned: the rest — the
// mutation harness runs unit suites only, so each rule is pinned here too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setRequestOrg, requestOrg, stillOrg } from '../src/utils/storage.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const code = (src) => src.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');
const between = (s, start, end) => {
    const a = s.indexOf(start);
    assert.ok(a >= 0, `missing: ${start}`);
    const b = s.indexOf(end, a + start.length);
    assert.ok(b > a, `no end after: ${start}`);
    return s.slice(a, b + end.length);
};
const count = (s, needle) => s.split(needle).length - 1;
const before = (s, first, second, why) => {
    const a = s.indexOf(first), b = s.indexOf(second);
    assert.ok(a >= 0, `missing: ${first}`);
    assert.ok(b >= 0, `missing: ${second}`);
    assert.ok(a < b, why);
};

// ── 1. The org a request is made for — the real rule ─────────────────────────

test('the request org: an answer is applied only while the org that asked is still the org on screen', () => {
    setRequestOrg('org_A');
    const asked = requestOrg();
    assert.equal(asked, 'org_A');
    assert.equal(stillOrg(asked), true);
    setRequestOrg('org_B');                                  // the switch
    assert.equal(stillOrg(asked), false, 'org A\'s answer is dropped under org B');
    assert.equal(stillOrg('org_B'), true);
    assert.equal(stillOrg(null), false, 'no org asked: nothing applies');
    setRequestOrg(null);
    assert.equal(requestOrg(), null);
    assert.equal(stillOrg(null), false, 'no org on screen matches nothing — null === null is no org');
    setRequestOrg('');
    assert.equal(requestOrg(), null, 'an empty id is no org');
});

test('App sets the request org as it renders, and the token getter reads it when a request is made', () => {
    const app = read('src/App.jsx');
    const setAt = app.indexOf('    setRequestOrg(organization?.id || null);');
    const getterAt = app.indexOf('window.__getClerkToken = () => getToken({ organizationId: requestOrg() });');
    assert.ok(setAt >= 0 && getterAt > setAt, 'set in the render, before the getter is installed');
    assert.ok(!app.includes('getToken({ organizationId: organization.id })'), 'REGRESSION: a getter that closes over the org of the render that installed it');
    assert.ok(app.includes("import { safeStorage, dbFetch, waitForToken, setRequestOrg, requestOrg, stillOrg } from './utils/storage';"));
});

// ── 2. The lists ─────────────────────────────────────────────────────────────

test('a switch empties the lists before the new org\'s answers; leads and the calendar drop another org\'s', () => {
    const app = code(read('src/App.jsx'));
    const clear = between(app, 'if (listsOrgRef.current && listsOrgRef.current !== organization.id) {', 'listsOrgRef.current = organization.id;');
    for (const s of ['setOpportunities([])', 'setAccounts([])', 'setContacts([])', 'setTasks([])', 'setActivities([])',
                     'setLeads([])', 'documentsHook.setDocuments([])', 'setQuotes([])', 'setProducts([])']) {
        assert.ok(clear.includes(s), `emptied on a switch: ${s}`);
    }
    before(app, 'listsOrgRef.current = organization.id;', 'const loadData = async () => {', 'emptied before the loads start');
    assert.ok(clear.includes('resetLoads(organization.id);'), 'and an emptied list is not one that was read (§0.294)');
    assert.ok(app.includes("const loadLeads = () => readList('leads', {") && app.includes('take: setLeads, gen: leadsGen, report: reportLoad,'), 'leads: the one loader drops another org\'s answer');
    const cal = between(app, 'const fetchCalendarEvents = async () => {', 'const fetchLogFromCalEvents');
    assert.ok(cal.includes('const askedOrg = requestOrg();'));
    assert.equal(count(cal, 'if (!stillOrg(askedOrg)) return;'), 2, 'the calendar: its answer and its error');
});

test('every shared list loader takes the asking org, and drops an answer for another at each step before it sets anything', () => {
    // Moved in §0.294: the nine loads are one loader, which checks when the response arrives, when a refusal's body or the
    // rows are read, and when it fails (tests/list-loads.test.mjs RUNS each step); coaching notes' own is as it was.
    const rl = code(read('src/utils/listLoads.js'));
    const body = between(rl, 'export async function readList(', '\n}\n');
    before(body, 'const askedOrg = requestOrg();', 'const current = () => stillOrg(askedOrg) && gen.current === mine;', 'the org is taken when the load starts');
    before(body, 'const current = () =>', 'take(rows);', 'the rows only for the org that asked');
    assert.equal(count(body, 'if (!current()) return { current: false, error: null };'), 4, '4 checks — a step without one lets another org\'s answer through');
    for (const [file, calls] of [['src/hooks/useOpportunities.js', 1], ['src/hooks/useAccounts.js', 1], ['src/hooks/useContacts.js', 1], ['src/hooks/useTasks.js', 1], ['src/hooks/useActivities.js', 1],
        ['src/hooks/useDocuments.js', 1], ['src/hooks/useQuotes.js', 2], ['src/App.jsx', 1]]) assert.equal(count(code(read(file)), 'readList('), calls, `${file}: its loads are the one loader's`);
    const s = code(read('src/hooks/useCoachingNotes.js'));
    assert.ok(/import \{[^}]*\brequestOrg\b[^}]*\bstillOrg\b[^}]*\} from '\.\.\/utils\/storage(\.js)?';/.test(s), 'imports the rule');
    const notes = between(s, 'const reload = useCallback(async () => {', '}, []);');
    before(notes, 'const askedOrg = requestOrg();', 'stillOrg(askedOrg)', 'the org is taken when the load starts');
    before(notes, 'stillOrg(askedOrg)', 'setCoachingNotes(Array.isArray', 'only for the org that asked');
    assert.equal(count(notes, 'stillOrg(askedOrg)'), 2);
});

// ── 3. What loads once ───────────────────────────────────────────────────────

test('every tab remounts on a switch — one keyed fragment from Home to Settings', () => {
    const app = read('src/App.jsx');
    const open = app.indexOf("<React.Fragment key={activeOrgId || 'no-org'}>");
    const close = app.indexOf('</React.Fragment>', open);
    assert.ok(open >= 0 && close > open, 'the keyed fragment');
    const keyed = app.slice(open, close);
    for (const tab of ['home', 'pipeline', 'tasks', 'accounts', 'contacts', 'leads', 'quotes', 'dispatch', 'documents', 'reports', 'salesManager', 'settings']) {
        assert.ok(keyed.includes(`activeTab === '${tab}'`), `${tab} is inside it`);
    }
});

test('the profile panel forgets its calendar record and email-logging addresses on a switch, and drops another org\'s answer', () => {
    const s = code(read('src/components/layout/AppHeader.jsx'));
    assert.ok(/setCalConn\(null\); setCalConnLoaded\(false\);\s*setMyBcc\(null\); setMyBccLoaded\(false\); setMyBccCopied\(false\);\s*\}, \[activeOrgId\]\);/.test(s),
        'REGRESSION: loaded once and kept — the last org\'s address, and mail BCC\'d to it filed in that org');
    for (const [loader, checks] of [['const loadCalConnection = React.useCallback(async () => {', 3], ['const loadMyBcc = React.useCallback(async () => {', 2]]) {
        const body = between(s, loader, '}, []);');
        assert.ok(body.includes('const askedOrg = requestOrg();'), loader);
        assert.equal(count(body, 'stillOrg(askedOrg)'), checks, `${loader} — ${checks} checks`);
    }
});

// ── 4. The Sales Manager tab ─────────────────────────────────────────────────

test('the Sales Manager tab renders for the roles the nav offers it to, and returns nothing early between its hooks', () => {
    const app = read('src/App.jsx');
    assert.ok(app.includes("{activeTab === 'salesManager' && (isAdmin || isManager) && ("), 'gated where it is rendered');
    const smt = code(read('src/Tabs/SalesManagerTab.jsx'));
    assert.ok(!smt.includes('if (!isAdmin && !isManager) return null;'), 'REGRESSION: an early return between the tab\'s hooks — a switch threw');
});

// ── 5. QuotesTab's configuration ─────────────────────────────────────────────

test('QuotesTab reads the org\'s tiers, approver names and types from its provider — no module-level copies', () => {
    const s = read('src/Tabs/QuotesTab.jsx');
    assert.ok(!/^let (APPROVAL_TIERS|APPROVER_NAMES_LIVE|PRODUCT_TYPES_LIVE)\b/m.test(s), 'REGRESSION: a module-level copy of the org\'s configuration');
    assert.ok(!/\b(APPROVAL_TIERS|APPROVER_NAMES_LIVE|PRODUCT_TYPES_LIVE|approverWordsLive)\b/.test(code(s)), 'nothing reads one');
    assert.ok(s.includes('    const quoteConfig = useMemo(() => ({ approvalTiers, approverNames, productTypes }), [approvalTiers, approverNames, productTypes]);'));
    assert.ok(s.includes('        <QuoteConfigContext.Provider value={quoteConfig}>') && s.includes('        </QuoteConfigContext.Provider>'), 'the tab provides it');
    assert.equal(count(s, '= useQuoteConfig();'), 6, 'its readers: the badge, the gauge, a column, the line editor, the configurator, the approvals tab');
});

// ── 6. Pipeline's saved views ────────────────────────────────────────────────

test('Pipeline\'s saved views are kept per org', () => {
    const s = code(read('src/Tabs/PipelineTab.jsx'));
    assert.ok(s.includes("const savedViewsKey = 'pipelineSavedViews:' + (activeOrgId || 'none');"));
    assert.ok(s.includes('localStorage.getItem(savedViewsKey)') && s.includes('localStorage.setItem(savedViewsKey, JSON.stringify(views))'));
    assert.ok(!s.includes("localStorage.getItem('pipelineSavedViews')") && !s.includes("localStorage.setItem('pipelineSavedViews'"), 'REGRESSION: one browser list for every org');
});

// ── 7. QuickLog's id; the first sign-in ──────────────────────────────────────

test('QuickLog mints a UUID, as every other record create does', () => {
    const s = code(read('src/components/layout/QuickLogFab.jsx'));
    // Moved in §0.261 (Part 6): one per draft, kept until it logs — a second press after a lost answer is the same activity.
    assert.ok(s.includes("id: draftIdRef.current || (draftIdRef.current = 'id_' + crypto.randomUUID()),"));
    assert.ok(!/'act_' \+ Date\.now\(\)/.test(s), 'REGRESSION: an id two logs in one millisecond share');
});

test('the first sign-in never answers with a row linked to another identity — the email step refuses it before the link', () => {
    const u = code(read('netlify/functions/users.mjs'));
    const refuse = 'if (row && row.clerkUserId && row.clerkUserId !== userId) row = undefined;';
    assert.ok(u.includes(refuse));
    before(u, 'and(eq(users.email, clerkEmail), eq(users.orgId, orgId))', refuse, 'right after the email lookup');
    before(u, refuse, 'if (row && !row.clerkUserId) {', 'before the link');
    // ensureRosterRow's half is pinned in tests/roster-provision.test.mjs.
});
