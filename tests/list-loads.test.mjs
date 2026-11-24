// tests/list-loads.test.mjs (state §0.294; guide §18b139; OPEN_ITEMS §4.2's two Mediums)
// A list that was not read is not a list of none. Each record list's load reports to one tracker (src/utils/listLoads.js,
// useListLoads.js): a failed one stayed [] and every screen drew it as none — "No accounts yet", $0 of pipeline, an import
// that met no duplicate — while the banner that said so was taken down by the next load of any other list that landed.
// The loader, the tracker, the words and the gate are RUN; the screens' own components are rendered where they are small,
// and pinned where they are not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { parse } from '@babel/parser';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LIST_NAMES, TAB_LISTS, RECORD_LISTS, LEAD_LISTS, TEAM_LISTS, PANEL_LISTS, REPORT_LISTS, NO_LOADS, tabLists, loadsReducer, loadsOf, areRead, unreadOf, failedOf,
    unreadWords, loadsBanner, waitsFor, readList } from '../src/utils/listLoads.js';
import { SIGN_IN_WORDS } from '../src/utils/fetchStatus.js';
import { setRequestOrg } from '../src/utils/storage.js';
import { REPORT_SOURCES } from '../src/utils/reportQuery.js';
import { planAccountImport } from '../src/utils/importLinks.js';
import { healthChecksOf, unreadChecksOf } from '../src/utils/settingsCards.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const code = (p) => read(p).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const count = (s, sub) => s.split(sub).length - 1;
const tick = () => new Promise((r) => setImmediate(r));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };
const quietly = async (run) => { const was = console.error; console.error = () => {}; try { return await run(); } finally { console.error = was; } };

// A tracker as useListLoads holds one, over the real reducer.
const tracker = (org = 'org_a') => {
    let state = NO_LOADS;
    return { report: (ev) => { state = loadsReducer(state, ev); }, reset: (o) => { state = loadsReducer(state, { type: 'reset', org: o }); }, loads: (o = org) => loadsOf(state, o), get state() { return state; } };
};
// A load held open: `land(answer)` answers it (a thrown Error throws).
const held = () => { let land; const answer = new Promise((res, rej) => { land = (a) => (a instanceof Error ? rej(a) : res(a)); }); return { read: () => answer, land }; };
const ok = (name, rows = []) => ({ ok: true, status: 200, json: async () => ({ [name]: rows }) });
const refused = (status, body = null) => ({ ok: false, status, json: async () => { if (body === null) throw new SyntaxError('not JSON'); return body; } });
const READ = { read: true, out: false, error: null, auth: false };
const FAILED = (error, more = {}) => ({ read: false, out: false, error, auth: false, ...more });
const allRead = () => Object.fromEntries(Object.keys(LIST_NAMES).map((n) => [n, READ]));

test('L1 — the loader: rows land and are read; each failure is the list\'s, in the house words; an answer with no list is no answer of none — RUN', async () => {
    const one = async (answer, { wait = null } = {}) => {
        const t = tracker(); const took = [];
        setRequestOrg('org_a');
        const r = await quietly(() => readList('accounts', { read: async () => { if (answer instanceof Error) throw answer; return answer; }, take: (rows) => took.push(rows), gen: { current: 0 }, report: t.report, wait }));
        setRequestOrg(null);
        return { r, took, e: t.loads().accounts };
    };
    assert.deepEqual(await one(ok('accounts', [{ id: 'a' }])), { r: { current: true, error: null }, took: [[{ id: 'a' }]], e: READ });
    assert.deepEqual(await one(ok('accounts')), { r: { current: true, error: null }, took: [[]], e: READ }, 'an empty list that was read is read');
    for (const [answer, words, auth] of [
        [refused(500, { error: 'Internal server error', requestId: 'r1' }), 'Internal server error (ref r1)', false],
        [refused(502), 'The server returned 502.', false],
        [refused(401, { error: 'Unauthorized: no token' }), 'Unauthorized: no token', true],
        [refused(403, { error: 'Your access to this organization has been turned off.' }), 'Your access to this organization has been turned off.', true],
        [new TypeError('Failed to fetch'), 'The server could not be reached.', false],
        [{ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token '<'"); } }, 'Its answer could not be read.', false],
        [{ ok: true, status: 200, json: async () => ({}) }, 'Its answer could not be read.', false],
        [{ ok: true, status: 200, json: async () => null }, 'Its answer could not be read.', false],
        [{ ok: true, status: 200, json: async () => ({ accounts: { id: 'a' } }) }, 'Its answer could not be read.', false],
    ]) assert.deepEqual(await one(answer), { r: { current: true, error: words }, took: [], e: FAILED(words, { auth }) }, `${words} — REGRESSION: a failed load lands, or says nothing`);
    // What it waits for comes first, and a wait that fails is a load that failed.
    const order = [];
    setRequestOrg('org_a');
    await readList('tasks', { read: async () => { order.push('asked'); return ok('tasks'); }, take: () => order.push('took'), gen: { current: 0 }, report: () => {}, wait: async () => { order.push('waited'); } });
    setRequestOrg(null);
    assert.deepEqual(order, ['waited', 'asked', 'took']);
    // The rows set, then said read: a screen never reads "read" over the old list.
    const seq = [];
    setRequestOrg('org_a');
    await readList('tasks', { read: async () => ok('tasks', [1]), take: () => seq.push('take'), gen: { current: 0 }, report: (ev) => seq.push(ev.type) });
    setRequestOrg(null);
    assert.deepEqual(seq, ['begin', 'take', 'ok']);
    // A setter that throws is a load that failed (the deals' normalizing).
    const t = tracker();
    setRequestOrg('org_a');
    await quietly(() => readList('opportunities', { read: async () => ok('opportunities', [1]), take: () => { throw new TypeError('getQuarter is not a function'); }, gen: { current: 0 }, report: t.report }));
    setRequestOrg(null);
    assert.deepEqual(t.loads().opportunities, FAILED('Its answer could not be read.'));
    // With no tracker the load still lands (document-refusals renders useDocuments with no reportLoad).
    setRequestOrg('org_a');
    const took = [];
    assert.deepEqual(await readList('tasks', { read: async () => ok('tasks', [7]), take: (x) => took.push(x), gen: { current: 0 } }), { current: true, error: null });
    setRequestOrg(null);
    assert.deepEqual(took, [[7]]);
});

test('L2 — an answer for an org switched away from, and one a later load overtook, set nothing and report nothing — at each step: the answer, a refusal\'s body, the rows, a failure — RUN', async () => {
    // [the step the world moves at, the answer it moves under]
    const moveAt = async (step, move) => {
        const t = tracker(); const took = []; const gen = { current: 0 };
        setRequestOrg('org_a');
        const go = () => move(gen);
        const readOf = {
            answer: async () => { go(); return ok('leads', [{ id: 'l' }]); },
            refusal: async () => ({ ok: false, status: 500, json: async () => { go(); return { error: 'x' }; } }),
            rows: async () => ({ ok: true, status: 200, json: async () => { go(); return { leads: [{ id: 'l' }] }; } }),
            failure: async () => { go(); throw new TypeError('Failed to fetch'); },
        }[step];
        const r = await quietly(() => readList('leads', { read: readOf, take: (x) => took.push(x), gen, report: t.report }));
        setRequestOrg(null);
        return { r, took, e: t.loads().leads };
    };
    const OUT = { read: false, out: true, error: null, auth: false };   // as its begin left it: the later load reports
    for (const step of ['answer', 'refusal', 'rows', 'failure']) {
        assert.deepEqual(await moveAt(step, () => setRequestOrg('org_b')), { r: { current: false, error: null }, took: [], e: OUT }, `REGRESSION: ${step} — another org's answer lands`);
        assert.deepEqual(await moveAt(step, (gen) => { gen.current += 1; }), { r: { current: false, error: null }, took: [], e: OUT }, `REGRESSION: ${step} — an answer a later load overtook lands`);
    }
    // Two loads of one list, the second answered first: the second's alone lands, and the first's late failure is not said.
    const t = tracker(); const took = []; const gen = { current: 0 };
    setRequestOrg('org_a');
    const a = held(), b = held();
    const p1 = readList('leads', { read: a.read, take: (x) => took.push(x), gen, report: t.report });
    const p2 = readList('leads', { read: b.read, take: (x) => took.push(x), gen, report: t.report });
    b.land(ok('leads', ['second'])); await settle();
    await quietly(async () => { a.land(refused(500)); await Promise.all([p1, p2]); });
    setRequestOrg(null);
    assert.deepEqual([took, t.loads().leads], [[['second']], READ], 'REGRESSION: an overtaken load\'s failure is drawn over the one that landed');
});

test('L3 — the tracker: a failed list stays failed while the others land, and leaves by its own next load (the class: the banner was whichever load answered last) — RUN', () => {
    const t = tracker();
    for (const n of ['accounts', 'contacts', 'tasks']) t.report({ org: 'org_a', name: n, type: 'begin' });
    assert.deepEqual(t.loads().accounts, { read: false, out: true, error: null, auth: false });
    t.report({ org: 'org_a', name: 'accounts', type: 'failed', words: 'The server returned 500.' });
    t.report({ org: 'org_a', name: 'contacts', type: 'ok' });
    t.report({ org: 'org_a', name: 'tasks', type: 'ok' });
    assert.equal(loadsBanner(t.loads()).text.startsWith('Accounts could not be loaded. The server returned 500.'), true, 'REGRESSION: the next load that landed took the banner down');
    t.report({ org: 'org_a', name: 'accounts', type: 'begin' });
    assert.deepEqual(t.loads().accounts, { read: false, out: true, error: 'The server returned 500.', auth: false }, 'a retry out keeps why');
    assert.equal(loadsBanner(t.loads()).trying, true);
    t.report({ org: 'org_a', name: 'accounts', type: 'ok' });
    assert.deepEqual([t.loads().accounts, loadsBanner(t.loads())], [READ, null]);
    // Read once, a later load's failure keeps it read.
    t.report({ org: 'org_a', name: 'accounts', type: 'begin' });
    t.report({ org: 'org_a', name: 'accounts', type: 'failed', words: 'W', auth: true });
    assert.deepEqual(t.loads().accounts, { read: true, out: false, error: 'W', auth: true });
    t.report({ org: 'org_a', name: 'accounts', type: 'failed', words: '' });
    assert.deepEqual(t.loads().accounts, { read: true, out: false, error: 'It could not be loaded.', auth: false }, 'never a failure with no words; not a sign-in any more');
    // Another org's: its first load starts from nothing; a late report of the last org's, a reset and no org at all.
    t.report({ org: 'org_b', name: 'tasks', type: 'begin' });
    assert.deepEqual([t.loads('org_b').tasks.out, t.loads('org_b').accounts, t.loads('org_a')], [true, undefined, {}], 'REGRESSION: the last org\'s lists read as this one\'s');
    t.report({ org: 'org_a', name: 'accounts', type: 'ok' });
    assert.deepEqual([t.loads('org_a'), Object.keys(t.loads('org_b'))], [{}, ['tasks']], 'a late answer of the last org\'s is none of this one\'s');
    t.report({ org: null, name: 'accounts', type: 'begin' });
    assert.deepEqual(Object.keys(t.loads('org_b')), ['tasks'], 'a load with no org reports nothing');
    t.report({ org: 'org_b', name: 'tasks', type: 'ok' });
    t.reset('org_b');
    assert.deepEqual(t.loads('org_b'), {}, 'REGRESSION: an emptied list still reads as read');
    assert.deepEqual([loadsOf(null, 'org_a'), loadsOf(t.state, null), loadsOf(NO_LOADS, null)], [{}, {}, {}]);
});

test('L4 — the words: not read is never "none" — failed and why, or loading; the lists named in order, each failure\'s words once — RUN', () => {
    const loads = { ...allRead(), accounts: FAILED('The server returned 500.'), contacts: FAILED('Internal server error (ref r1)'), products: FAILED('No words end here'), tasks: { read: false, out: true, error: null, auth: false }, leads: undefined };
    assert.equal(unreadWords(loads, ['opportunities']), '');
    assert.equal(unreadWords(loads, ['accounts']), 'Accounts could not be loaded — The server returned 500.');
    assert.equal(unreadWords(loads, ['products', 'contacts', 'accounts', 'opportunities']), 'Accounts, contacts and the price book could not be loaded — The server returned 500. Internal server error (ref r1). No words end here.');
    assert.equal(unreadWords({ accounts: FAILED('X.'), contacts: FAILED('X.') }, ['accounts', 'contacts']), 'Accounts and contacts could not be loaded — X.', 'the same words once');
    assert.equal(unreadWords(loads, ['tasks', 'leads']), 'Loading tasks and leads…', 'one not landed yet — and one never begun');
    assert.equal(unreadWords(loads, ['tasks', 'accounts']), 'Accounts could not be loaded — The server returned 500.', 'a failure says first');
    assert.equal(unreadWords(undefined, ['accounts']), 'Loading accounts…', 'nothing handed is nothing read');
    assert.equal(unreadWords({ accounts: { ...READ, error: 'later' } }, ['accounts']), '', 'read once, a later failure is the banner\'s');
    assert.deepEqual([areRead(loads, ['opportunities', 'quotes']), areRead(loads, ['opportunities', 'tasks']), areRead(loads, [])], [true, false, true]);
    assert.deepEqual([unreadOf(loads, ['leads', 'tasks', 'quotes']), failedOf(loads, ['tasks', 'contacts', 'accounts', 'quotes'])], [['tasks', 'leads'], ['accounts', 'contacts']]);
});

test('L5 — the banner: none while nothing failed (a load out or not begun is not a failure); never read, read before, and a refused sign-in said apart; what Try again asks for — RUN', () => {
    assert.deepEqual([loadsBanner({}), loadsBanner(undefined), loadsBanner(allRead()), loadsBanner({ tasks: { read: false, out: true, error: null, auth: false } })], [null, null, null, null]);
    assert.deepEqual(loadsBanner({ ...allRead(), quotes: FAILED('The server could not be reached.'), accounts: FAILED('The server could not be reached.') }), {
        tone: 'outage', failed: ['accounts', 'quotes'], trying: false,
        text: 'Accounts and quotes could not be loaded. The server could not be reached. Nothing is missing from the server.' });
    assert.deepEqual(loadsBanner({ ...allRead(), tasks: { ...READ, error: 'W' } }), { tone: 'outage', failed: ['tasks'], trying: false,
        text: 'Tasks could not be read again — what is shown may be out of date. W.' });
    assert.deepEqual(loadsBanner({ tasks: { ...READ, error: 'W.' }, leads: FAILED('W.', { out: true }) }), { tone: 'outage', failed: ['tasks', 'leads'], trying: false,
        text: 'Leads could not be loaded. Tasks could not be read again — what is shown may be out of date. W. Nothing is missing from the server.' }, 'Try again asks for both');
    assert.deepEqual([loadsBanner({ tasks: FAILED('W.'), leads: FAILED('W.', { out: true }) }).trying, loadsBanner({ tasks: FAILED('W.', { out: true }), leads: FAILED('W.', { out: true }) }).trying], [false, true], 'one slow retry keeps the others\' Try again');
    const auth = loadsBanner({ accounts: FAILED('x'), tasks: FAILED('y', { auth: true }) });
    assert.deepEqual(auth, { tone: 'auth', text: SIGN_IN_WORDS, failed: ['accounts', 'tasks'], trying: false }, 'one refused sign-in: the member signs in again');
});

// ── the components, rendered ─────────────────────────────────────────────────
const require = createRequire(import.meta.url);
const built = (entry) => {
    const out = buildSync({ stdin: { contents: entry, resolveDir: fileURLToPath(ROOT), loader: 'jsx' }, bundle: true, write: false, format: 'cjs',
        jsx: 'transform', external: ['react', 'react-dom'], loader: { '.js': 'jsx' }, banner: { js: 'const React = require("react");' }, logLevel: 'silent', define: { 'import.meta.env': '{}' } });
    const m = { exports: {} };
    new Function('require', 'module', 'exports', out.outputFiles[0].text)(require, m, m.exports);
    return m.exports;
};
const UI = built(`export { default as ListsGate } from './src/components/ui/ListsGate.jsx'; export { default as PanelGate } from './src/components/ui/PanelGate.jsx'; export { default as ListsWait } from './src/components/ui/ListsWait.jsx'; export { AppProvider } from './src/AppContext';`);
const html = (el) => renderToStaticMarkup(el);
const inApp = (value, el) => html(createElement(UI.AppProvider, { value }, el));

test('L6 — the gate: a tab drawn only once every list it draws from was read; until then what is loading, or what failed, why and Try again — RENDERED', () => {
    const gate = (loads, lists = ['accounts', 'tasks']) => html(createElement(UI.ListsGate, { loads, lists, onRetry: () => {} }, createElement('b', null, 'No accounts yet')));
    assert.equal(gate(allRead()), '<b>No accounts yet</b>');
    assert.equal(gate({ accounts: { ...READ, error: 'later' }, tasks: READ }), '<b>No accounts yet</b>', 'read once, a later failure keeps the tab');
    assert.equal(gate({ accounts: READ, tasks: { ...READ, out: true } }), '<b>No accounts yet</b>', 'a load out over a list read');
    const loading = gate({ accounts: READ });
    assert.ok(loading.includes('Loading tasks…') && loading.includes('role="status"') && !loading.includes('No accounts yet') && !loading.includes('<button'), loading);
    const failed = gate({ accounts: FAILED('The server returned 500.'), tasks: READ });
    assert.ok(failed.includes('Accounts could not be loaded — The server returned 500.') && failed.includes('role="alert"') && failed.includes('>Try again</button>') && !failed.includes('No accounts yet'), `REGRESSION: a failed list drawn as none — ${failed}`);
    assert.ok(!failed.includes('disabled=""'));
    const trying = gate({ accounts: FAILED('X.', { out: true }), tasks: READ });
    assert.ok(trying.includes('>Trying…</button>') && trying.includes('disabled=""'));
    const back = html(createElement(UI.ListsGate, { loads: {}, lists: ['leads'], onRetry: () => {}, onBack: () => {} }, null));
    assert.ok(back.includes('← Back') && !loading.includes('Back'), 'a panel keeps its way back');
    // Try again asks for the lists that failed, no other: the press, run.
    const pressOf = (el, label) => { let found = null; const walk = (n) => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) return n.forEach(walk); if (typeof n.type === 'function' && n.type.name === 'Unread') return walk(n.type(n.props)); if (n.type === 'button' && n.props.children === label) found = n.props.onClick; walk(n.props?.children); }; walk(el); return found; };
    const asked = [];
    const el = UI.ListsGate({ loads: { accounts: FAILED('X.'), tasks: { read: false, out: true, error: null, auth: false } }, lists: ['accounts', 'tasks'], onRetry: (n) => asked.push(n), onBack: () => asked.push('back'), children: null });
    pressOf(el, 'Try again')(); pressOf(el, '← Back')();
    assert.deepEqual(asked, [['accounts'], 'back']);
    // A Settings panel's, by its id, from the context: each waits for its own list alone.
    const panel = (id, loads, value = {}) => inApp({ loads, retryLoads: () => {}, ...value }, createElement(UI.PanelGate, { id, onBack: () => {} }, createElement('b', null, 'drawn')));
    for (const [id, [list]] of Object.entries(PANEL_LISTS)) {
        assert.equal(panel(id, { ...Object.fromEntries(Object.keys(LIST_NAMES).map((n) => [n, FAILED('X.')])), [list]: READ }), '<b>drawn</b>', `${id}: ${list} alone`);
        const waits = panel(id, { ...allRead(), [list]: FAILED('X.') });
        assert.ok(waits.includes(unreadWords({ [list]: FAILED('X.') }, [list])) && waits.includes('← Back') && !waits.includes('drawn'), `REGRESSION: ${id} drawn over ${list} that was not read`);
    }
    const src = { panel: code('src/components/ui/PanelGate.jsx'), wait: code('src/components/ui/ListsWait.jsx') };
    assert.ok(src.panel.includes('<ListsGate loads={loads} lists={PANEL_LISTS[id]} onRetry={retryLoads} onBack={onBack}>{children}</ListsGate>'), 'its Try again and its Back are the gate\'s');
    assert.ok(src.wait.includes('<Unread loads={loads} lists={lists} onRetry={retryLoads}>') && src.wait.includes('<button type="button" onClick={onClose} style={quietBtn}>Close</button>'), 'and the wait\'s');
});

test('L7 — a window asked for before its lists were read waits: why, Try again and Close — RENDERED; over them all, it takes its Escape at the top of theirs', () => {
    const wait = (loads) => inApp({ loads, retryLoads: () => {}, escapeBlocked: () => false }, createElement(UI.ListsWait, { lists: RECORD_LISTS, onClose: () => {} }));
    const failed = wait({ ...allRead(), accounts: FAILED('X.') });
    assert.ok(failed.includes('Accounts could not be loaded — X.') && failed.includes('>Try again</button>') && failed.includes('>Close</button>') && failed.includes('role="dialog"'), failed);
    assert.ok(wait({}).includes('Loading deals, accounts, contacts, tasks and activities…') && wait({}).includes('>Close</button>') && !wait({}).includes('Try again'));
    const src = code('src/components/ui/ListsWait.jsx');
    assert.ok(src.includes("useEscapeLayer(true, onClose, escapeBlocked('recordWait'));") && src.includes('zIndex: 11105') && src.includes('onClick={e => e.stopPropagation()}') && src.includes('<div onClick={onClose} style={{ position: \'fixed\', inset: 0,'));
});

test('L8 — the record windows: drawn only once the lists they read were read, never taken down after; what is asked for waits, and Close takes back each — pinned, and the wait RUN', () => {
    assert.deepEqual(RECORD_LISTS, ['opportunities', 'accounts', 'contacts', 'tasks', 'activities']);
    assert.deepEqual(LEAD_LISTS, ['leads', 'contacts', 'users']);
    assert.deepEqual(TEAM_LISTS, ['users']);
    // The harm the wait is for: over a list that was not read a file meets no duplicate.
    assert.deepEqual([planAccountImport([{ name: 'Shell' }], [2], []).conflicts.length, planAccountImport([{ name: 'Shell' }], [2], [{ id: 'a', name: 'Shell' }]).conflicts.length], [0, 1]);
    const m = code('src/components/layout/ModalLayer.jsx');
    for (const l of ['{showModal && recordsRead && (\n                <OpportunityModal', '{showCsvImportModal && (csvReads ? recordsRead : teamRead) && (\n                <CsvImportModal', '{showLeadModal && leadsRead && (\n                <LeadModal', '{showLeadImportModal && leadsRead && (\n                <LeadImportModal',
        '{recordsRead && <ActivityRail />}', '{recordsRead && <TaskRail />}', '{recordsRead && <ContactRail />}', '{recordsRead && <AccountRail />}', '{recordsRead && <DocumentLinkPicker />}', '{teamRead && <DocumentRail />}', '{teamRead && <DocumentUploadRail />}',
        '{recordsRead && <MergeReviewModal />}', '{recordsRead && <ContactMergeReviewModal />}', '{recordsRead && <ActivityDetailDialogHost />}', '{waiting && <ListsWait lists={recordWait} onClose={stopWaiting}/>}', "const csvReads = csvImportType !== 'users';", 'const recordsRead = areRead(loads, RECORD_LISTS);', 'const leadsRead = areRead(loads, LEAD_LISTS);', 'const teamRead = areRead(loads, TEAM_LISTS);', "const claimsRead = areRead(loads, ['spiffClaims']);", 'const waiting = recordWait.length > 0;']) assert.equal(count(m, l), 1, `REGRESSION: ${l} — drawn over lists that were not read`);
    for (const c of ['OpportunityModal', 'CsvImportModal', 'LeadModal', 'LeadImportModal', 'ActivityRail', 'TaskRail', 'ContactRail', 'AccountRail', 'DocumentLinkPicker', 'DocumentRail', 'DocumentUploadRail', 'MergeReviewModal', 'ContactMergeReviewModal', 'ActivityDetailDialogHost']) assert.equal([...m.matchAll(new RegExp(`<${c}[\\s/]`, 'g'))].length, 1, `${c} drawn once`);
    const app = code('src/App.jsx');
    assert.ok(app.includes('{recordsRead && <MeetingPrepPanel />}') && app.includes('{recordsRead && <QuickLogFab />}') && app.includes('const recordsRead = areRead(loads, RECORD_LISTS);'));
    // The wait itself: RUN over each way a window is asked for.
    const UNREAD = { ...allRead(), accounts: FAILED('X.') };
    const OPENERS = [{ showModal: true }, ...['accounts', 'contacts', 'opportunities'].map((t) => ({ showCsvImportModal: true, csvImportType: t })), { showActivityModal: true }, { taskRailId: 't' }, { contactRailId: 'c' }, { accountRailId: 'new' }, { showDocLinkPicker: true },
        { mergeModal: {} }, { contactMergeModal: {} }, { viewingActivity: {} }, { quickLogOpen: true }, { meetingPrepOpen: true, meetingPrepEvent: {} }];
    for (const o of OPENERS) {
        for (const l of RECORD_LISTS) assert.deepEqual(waitsFor({ ...allRead(), [l]: FAILED('X.') }, o), RECORD_LISTS, `REGRESSION: ${JSON.stringify(o)} — asked for over ${l} that was not read, and nothing says why it does not open`);
        assert.deepEqual(waitsFor(allRead(), o), [], 'read: it opens');
    }
    for (const o of [{ showLeadModal: true }, { showLeadImportModal: true }]) assert.deepEqual([...LEAD_LISTS.map((l) => waitsFor({ ...allRead(), [l]: FAILED('X.') }, o)), waitsFor(UNREAD, o)], [LEAD_LISTS, LEAD_LISTS, LEAD_LISTS, []], 'a lead window waits for its own lists alone');
    assert.deepEqual(waitsFor({}, { showModal: true, showLeadModal: true }), [...RECORD_LISTS, 'leads', 'users'], 'two asked for: each list once');
    const TEAM = { showCsvImportModal: true, csvImportType: 'users' };
    for (const o of [{ documentRailId: 'doc_1' }, { showUploadRail: true }]) assert.deepEqual([waitsFor({ ...allRead(), users: FAILED('X.') }, o), waitsFor(UNREAD, o)], [TEAM_LISTS, []], 'whom a document is shared with');
    assert.deepEqual([waitsFor(UNREAD, {}), waitsFor(UNREAD, { meetingPrepOpen: true }), waitsFor(UNREAD, TEAM), waitsFor({ ...UNREAD, users: FAILED('X.') }, TEAM)], [[], [], [], TEAM_LISTS], 'nothing asked for, nothing over the page; the team import waits for the team alone');
    assert.deepEqual(waitsFor({ ...allRead(), users: FAILED('X.') }, { showCsvImportModal: true, csvImportType: 'accounts' }), [], 'no other import for it');
    // App asks it of every flag it knows, and the Escape order and ModalLayer read the one answer.
    const asked = app.slice(app.indexOf('const recordWait = waitsFor(loads, {'), app.indexOf('const openLayers = {'));
    assert.deepEqual(asked.match(/\b(show\w+|csvImportType|\w+RailId|mergeModal|contactMergeModal|viewingActivity|quickLogOpen|meetingPrep\w+)\b/g).sort(), [...new Set([...OPENERS, { showLeadModal: 1 }, { showLeadImportModal: 1 }, { documentRailId: 1 }, { showUploadRail: 1 }].flatMap(Object.keys))].sort(), 'REGRESSION: a window App opens the wait never hears of');
    assert.ok(app.includes('        recordWait: recordWait.length > 0,') && app.includes('        recordWait, loads, retryLoads,'));
    // Close lets each window go as its own close does: RUN, whole.
    const body = m.slice(m.indexOf('    const stopWaiting = () => {'), m.indexOf('    };\n', m.indexOf('    const stopWaiting = () => {')) + 7);
    const SETS = [...new Set([...body.matchAll(/\b(set\w+)\(/g)].map((x) => x[1]))];
    const close = (recordsRead, leadsRead, csvReads = true, teamRead = true) => { const set = {}; new Function('recordsRead', 'leadsRead', 'csvReads', 'teamRead', ...SETS, `${body}\nstopWaiting();`)(recordsRead, leadsRead, csvReads, teamRead, ...SETS.map((k) => (v) => { set[k] = v; })); return set; };
    const RECORDS_CLOSED = { setShowModal: false, setNewDealSeed: null, setShowCsvImportModal: false, setShowActivityModal: false, setEditingActivity: null, setActivityInitialContext: null, setTaskRailId: null, setEditingTask: null, setContactRailId: null, setAccountRailId: null, setRailStack: [],
        setShowDocLinkPicker: false, setDocLinkPickerContext: null, setMergeModal: null, setContactMergeModal: null, setViewingActivity: null, setQuickLogOpen: false, setMeetingPrepOpen: false, setMeetingPrepOppId: null };
    assert.deepEqual(close(false, true), RECORDS_CLOSED, 'REGRESSION: Close leaves a window asked for, or its seed — the next new task opened as the one let go');
    assert.deepEqual(close(true, false), { setShowLeadModal: false, setShowLeadImportModal: false });
    const { setShowCsvImportModal, ...rest } = RECORDS_CLOSED;
    assert.deepEqual([close(false, true, false), setShowCsvImportModal], [rest, false], 'the team import stays open beside one that waits');
    const DOCS_CLOSED = { setDocumentRailId: null, setShowUploadRail: false, setUploadRailContext: null };
    assert.deepEqual([close(true, true), close(true, true, true, false), close(true, true, false, false)], [{}, DOCS_CLOSED, { setShowCsvImportModal: false, ...DOCS_CLOSED }], 'nothing waiting, Close takes nothing back; what waits for the team, it does');
});

test('L9 — the Settings panels that count a list, or write to the team, wait for it, each by its id', () => {
    assert.deepEqual(PANEL_LISTS, { 'lead-scoring': ['leads'], 'account-segments': ['accounts'], 'buyer-personas': ['contacts'], industries: ['accounts'],
        users: ['users'], teams: ['users'], territories: ['users'], roles: ['users'], 'approval-tiers': ['users'], automations: ['users'] });
    const av = code('src/Tabs/AdminView.jsx');
    for (const [id, comp, lists] of [['lead-scoring', 'LeadScoringDetail', 'leads'], ['account-segments', 'AccountSegmentsDetail', 'accounts'], ['buyer-personas', 'BuyerPersonasDetail', 'contacts'], ['industries', 'IndustriesDetail', 'accounts'], ['users', 'UsersDetail', 'users'], ['teams', 'TeamsDetail', 'users'], ['territories', 'TerritoriesDetail', 'users'],
        ['roles', 'RolesDetail', 'users'], ['approval-tiers', 'ApprovalTiersDetail', 'users'], ['automations', 'AutomationsDetail', 'users']]) {
        assert.equal([...av.matchAll(new RegExp(`if \\(id === '${id}'\\)\\s+return <PanelGate id="${id}" onBack=\\{onBack\\}><${comp}\\s[^\\n]*/></PanelGate>;`, 'g'))].length, 1, `REGRESSION: ${comp} drawn over ${lists} that were not read`);
        assert.equal(count(av, `<${comp}`), 1);
        assert.ok(['salesProcess', 'people', 'quoting', 'integrations'].some((d) => { try { return read(`src/Tabs/settings/${d}/${comp}.jsx`).includes(lists); } catch { return false; } }), comp);
    }
});

// ── THE GUARD ────────────────────────────────────────────────────────────────
// What a tab takes from the app's lists (visibleX is X) must be in TAB_LISTS, or named here with why it needs no gate.
const TAB_FILES = { home: 'HomeTab', pipeline: 'PipelineTab', tasks: 'TasksTab', accounts: 'AccountsTab', contacts: 'ContactsTab', leads: 'LeadsTab', quotes: 'QuotesTab', dispatch: 'DispatchTab', reports: 'ReportsTab', salesManager: 'SalesManagerTab' };
const NO_GATE = {
    'home spiffClaims': "its SPIFFs panel says claims that were not read (below)",
    'home accounts': "a pinned report's source or join alone — each says its own (REPORT_LISTS, pinned below)",
    'home leads': 'the same',
    'pipeline accounts': 'taken from the context and read nowhere',
    'pipeline contacts': 'taken from the context and read nowhere',
};
const UNGATED = { documents: 'says its own failed read (docsError, refusals-said 5d)', settings: 'must open whatever failed; its panels that count a list, or write to the team, wait (L9)' };
const takenLists = (path) => {
    const ast = parse(read(path), { sourceType: 'module', plugins: ['jsx'] });
    const got = new Set();
    const visit = (n) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach(visit); return; }
        if (n.type === 'VariableDeclarator' && n.init?.type === 'CallExpression' && n.init.callee.name === 'useApp' && n.id.type === 'ObjectPattern') {
            for (const p of n.id.properties) { const k = (p.key?.name || '').replace(/^visible(.)/, (m, c) => c.toLowerCase()); if (k in LIST_NAMES) got.add(k); }
        }
        for (const k of Object.keys(n)) if (k !== 'loc') visit(n[k]);
    };
    visit(ast.program);
    return [...got];
};

test('THE GUARD — every tab that draws from the app\'s lists is drawn through the gate, for every list its file takes, or the list is named with why it needs no gate; each list has a loader that reports and a Try again that reads it', async () => {
    const app = code('src/App.jsx');
    assert.deepEqual(Object.keys(TAB_LISTS).sort(), Object.keys(TAB_FILES).sort());
    for (const [tab, file] of Object.entries(TAB_FILES)) {
        const taken = takenLists(`src/Tabs/${file}.jsx`);
        assert.ok(taken.length > 0, `${file}: the scan reads what it takes`);
        for (const l of taken) if (!TAB_LISTS[tab].includes(l)) assert.ok(NO_GATE[`${tab} ${l}`], `REGRESSION: the ${tab} tab draws from ${l}, and is drawn before it was read — add it to TAB_LISTS, or name it with its reason`);
        for (const l of TAB_LISTS[tab]) assert.ok(l in LIST_NAMES, l);
        const gated = new RegExp(`<ListsGate \\{\\.\\.\\.gate\\} lists=\\{listsOf\\('${tab}'\\)\\}><${file}[^>]*/></ListsGate>`, 'g');
        assert.equal([...app.matchAll(gated)].length, 1, `REGRESSION: ${file} drawn outside the gate`);
        assert.equal(count(app, `<${file}`), 1, `${file} drawn once`);
    }
    for (const k of Object.keys(NO_GATE)) { const [tab, l] = k.split(' '); assert.ok(takenLists(`src/Tabs/${TAB_FILES[tab]}.jsx`).includes(l) && !TAB_LISTS[tab].includes(l), `${k}: gone or gated — take its name out`); }
    // Every tab App draws is gated or named.
    const drawn = [...app.matchAll(/\{activeTab === '(\w+)' && /g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i);
    for (const tab of drawn) assert.ok(tab in TAB_LISTS || tab in UNGATED, `REGRESSION: the ${tab} tab is neither gated nor named`);
    for (const tab of [...Object.keys(TAB_LISTS), ...Object.keys(UNGATED)]) assert.ok(drawn.includes(tab), `${tab}: drawn by App`);
    // One state, masked by org; the emptied lists unread; the loaders and the retry.
    assert.ok(app.includes('const { loads, reportLoad, resetLoads } = useListLoads(activeOrgId);') && app.includes('        reportLoad,'), 'the hooks report through the shared deps');
    assert.ok(app.includes('const gate = { loads, onRetry: retryLoads };') && app.includes("const listsOf = (tab) => tabLists(tab, { technician: isTechnician(userRole) });"));
    assert.ok(app.includes('} = useQuotes(_deps);') && app.includes('useDocuments(_deps);'));
    const hook = code('src/hooks/useListLoads.js');
    assert.ok(hook.includes('return { loads: loadsOf(state, activeOrgId), reportLoad, resetLoads };') && hook.includes('const reportLoad = useCallback((ev) => dispatch(ev), []);') && hook.includes("const resetLoads = useCallback((org) => dispatch({ type: 'reset', org }), []);") && hook.includes('useReducer(loadsReducer, NO_LOADS)'), 'stable, and the org on screen\'s alone; an emptied org\'s lists unread');
    // No name App or ModalLayer takes from the tracker is one of their own too (App's useMerge hands it a listsRead: the
    // import of that name was never the function, and App crashed on its first render — found in the pane).
    for (const file of ['src/App.jsx', 'src/components/layout/ModalLayer.jsx']) {
        const src = read(file); const names = [...src.matchAll(/import \{([^}]*)\} from '[^']*(?:listLoads|useListLoads)\.js'/g)].flatMap((x) => x[1].split(',').map((y) => y.trim()));
        assert.ok(names.length > 1);
        for (const n of names) assert.ok(!new RegExp(`(?:const|let|var|function)\\s+${n}\\b|[{,]\\s*${n}\\s*[,}][^;]*?=\\s*(?:\\n\\s*)?use[A-Z]`).test(code(file).replace(/^import .*$/gm, '')), `REGRESSION: ${file} — ${n} is declared again`);
    }
    const retry = app.slice(app.indexOf('const retryLoads = (names) => {'), app.indexOf('const loadBanner ='));
    const files = { opportunities: 'src/hooks/useOpportunities.js', accounts: 'src/hooks/useAccounts.js', contacts: 'src/hooks/useContacts.js', tasks: 'src/hooks/useTasks.js', activities: 'src/hooks/useActivities.js', leads: 'src/App.jsx', documents: 'src/hooks/useDocuments.js', quotes: 'src/hooks/useQuotes.js', products: 'src/hooks/useQuotes.js', users: 'src/hooks/useSettings.js', spiffClaims: 'src/App.jsx' };
    const main = app.slice(app.indexOf('const loadData = async () => {'), app.indexOf('loadSettings(clerkUser, orgSwitched'));
    for (const l of Object.keys(LIST_NAMES)) {
        const loader = l === 'documents' ? 'documentsHook.loadDocuments' : l === 'users' ? '() => loadRoster()' : `load${l[0].toUpperCase()}${l.slice(1)}`;
        const body = code(files[l]); const i = body.indexOf(`readList('${l}', {`);
        assert.ok(i > 0 && /report: (deps|_deps)\.reportLoad|report: reportLoad/.test(body.slice(i, body.indexOf('});', i))), `REGRESSION: ${l}'s load reports nothing`);
        assert.ok(retry.includes(`${l}: ${l === 'products' ? '() => loadProducts()' : loader},`) || retry.includes(`${l}: ${loader} `) || retry.includes(`${l}: () => loadProducts(),`), `REGRESSION: Try again does not read ${l}`);
        // With the org: the team with its settings (useSettings), the claims by their own effect (auth-gated-loads).
        if (l !== 'users' && l !== 'spiffClaims') assert.equal(count(main, `${loader}();`), 1, `${l} loaded with the org`);
    }
    assert.ok(retry.includes('for (const n of names) loaders[n]?.();'));
    const again = app.slice(app.indexOf('    const readAllAgain = (orgId) => {'), app.indexOf('    const loadBanner ='));
    const did = [];
    await quietly(async () => { new Function('retryLoads', 'LIST_NAMES', 'loadSettings', 'clerkUser', 'reloadCoachingNotes', `${again}\nreadAllAgain('org_a');`)((n) => did.push(n), LIST_NAMES, (...a) => did.push(a), 'me', () => { did.push('notes'); }); });
    assert.deepEqual(did, [Object.keys(LIST_NAMES).filter((n) => n !== 'users'), ['me', false, 'org_a'], 'notes'], 'RUN: every list, the settings with the team, and the notes — nothing switched');
    assert.equal(count(code('src/hooks/useSettings.js'), '        loadRoster(usersDelay);'), 1, 'the team read with the org\'s settings');
    assert.ok(app.includes('        if (data?.joined) readAllAgain(meOrgId);\n        if (meLoadRef.current !== meLoad) return;\n') && app.includes('        if (prevOrgIdRef.current !== meOrgId) return;\n        if (data?.joined)'), 'REGRESSION: a first sign-in keeps the lists it was answered as no member');
    const ran = []; const retryFn = new Function('loadOpportunities', 'loadAccounts', 'loadContacts', 'loadTasks', 'loadActivities', 'loadLeads', 'documentsHook', 'loadQuotes', 'loadProducts', 'loadRoster', 'loadSpiffClaims', `${retry}\nreturn retryLoads;`)(
        ...['opportunities', 'accounts', 'contacts', 'tasks', 'activities', 'leads'].map((n) => () => ran.push(n)), { loadDocuments: () => ran.push('documents') }, () => ran.push('quotes'), (...a) => ran.push(`products${a.length}`), (...a) => ran.push(`users${a.length}`), () => ran.push('spiffClaims'));
    retryFn(Object.keys(LIST_NAMES)); retryFn(['no such list']);
    assert.deepEqual(ran.sort(), ['accounts', 'activities', 'contacts', 'documents', 'leads', 'opportunities', 'products0', 'quotes', 'spiffClaims', 'tasks', 'users0'], 'RUN: each list by its own loader, the price book the active products alone');
    // The banner: no ✕ — what it says stands until it is read.
    const banner = app.slice(app.indexOf('{loadBanner && ('), app.indexOf('<nav className="nav-tabs">'));
    assert.ok(banner.includes('onClick={() => retryLoads(loadBanner.failed)} disabled={loadBanner.trying}') && count(banner, '<button') === 1 && !banner.includes('✕'));
    assert.ok(app.includes('        recordWait, loads, retryLoads,'), 'the context hands them on');
});

// THE GUARD's other half: every file under src/ that takes a list through useApp() — the lists it takes are read before it
// is drawn (its tab's, its window's, its panel's), or it is named with what it does instead.
const COVERED = {
    'src/components/FunnelView.jsx': TAB_LISTS.pipeline, 'src/components/KanbanView.jsx': TAB_LISTS.pipeline,
    ...Object.fromEntries(['documents/DocumentLinkPicker', 'layout/MeetingPrepPanel', 'layout/QuickLogFab', 'modals/ActivityDetailDialog', 'modals/ContactMergeReviewModal', 'modals/MergeReviewModal',
        'rails/AccountPicker', 'rails/AccountRail', 'rails/ActivityRail', 'rails/ContactRail', 'rails/TaskRail'].map((x) => [`src/components/${x}.jsx`, RECORD_LISTS])),
    'src/components/modals/LeadModal.jsx': LEAD_LISTS,
    'src/components/documents/RecordDocuments.jsx': [...RECORD_LISTS, 'documents'],   // in a record's window; the library says its own (below)
    ...Object.fromEntries(Object.entries({ 'lead-scoring': 'LeadScoringDetail', 'account-segments': 'AccountSegmentsDetail', 'buyer-personas': 'BuyerPersonasDetail', industries: 'IndustriesDetail' }).map(([id, c]) => [`src/Tabs/settings/salesProcess/${c}.jsx`, PANEL_LISTS[id]])),
};
const SAYS_ITS_OWN = {
    'src/components/documents/AttachmentsStrip.jsx': 'the library, said (below)', 'src/components/documents/DocumentPicker.jsx': 'the library, said (below)',
    'src/components/documents/DocumentRail.jsx': 'one document by its id, from a list that names it', 'src/Tabs/DocumentsTab.jsx': 'docsError (refusals-said 5d)',
    'src/components/modals/OpportunityModal.jsx': "a deal's quotes, said (below); its lists are the window's props",
    'src/components/layout/AppHeader.jsx': 'the search and the bell, said (below)',
    'src/components/layout/ModalLayer.jsx': 'hands the lists to the windows it draws once they were read (L8); the claim window waits inside itself (below); the reminders show a task that stands in the list',
    'src/Tabs/DuplicateScanView.jsx': "the scan's own request; the list is its rescan key", 'src/Tabs/ContactDuplicateScanView.jsx': 'the same',
};
const WHOLE = { 'src/Tabs/settings/integrations/AutomationsDetail.jsx': "a run's record named from the lists; one not in them shows its id" };
test('THE GUARD, class-wide — every file that takes a list from the app is drawn once it was read, or is named with what it does instead', () => {
    const walk = (d) => readdirSync(new URL(d, ROOT), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}${e.name}/`) : /\.jsx?$/.test(e.name) ? [d + e.name] : []));
    const files = walk('src/');
    assert.ok(files.length > 250, `the walk sees src/ (${files.length})`);
    const seen = [];
    for (const file of files) {
        const src = code(file);
        if (!/useApp\(/.test(src) || file === 'src/AppContext.jsx') continue;
        // Taken any other way — the whole context held by a name — only where it reads no list of it, or is named.
        const whole = /(?:const|let|var)\s+(\w+)\s*=\s*useApp\(\)/.exec(src)?.[1] || (/useApp\(\)\s*\??\.|\.\.\.useApp\(/.test(src) ? 'useApp\\(\\)' : null);
        if (whole && !WHOLE[file]) for (const l of Object.keys(LIST_NAMES)) assert.ok(!new RegExp(`\\b${whole}\\??\\.(?:${l}|visible${l[0].toUpperCase()}${l.slice(1)})\\b|\\.\\.\\.${whole}\\b`).test(src), `REGRESSION: ${file} reads ${l} of the whole context`);
        const taken = takenLists(file);
        if (!taken.length) continue;
        seen.push(file);
        const tab = Object.keys(TAB_FILES).find((t) => file === `src/Tabs/${TAB_FILES[t]}.jsx`);
        if (tab || SAYS_ITS_OWN[file]) continue;   // the tabs: the test above
        assert.ok(COVERED[file], `REGRESSION: ${file} takes ${taken} and nothing holds it until they were read — gate it, or name it with its reason`);
        for (const l of taken) assert.ok(COVERED[file].includes(l), `REGRESSION: ${file} takes ${l}, which it is drawn before`);
    }
    for (const file of [...Object.keys(COVERED), ...Object.keys(SAYS_ITS_OWN)]) assert.ok(seen.includes(file), `${file}: gone, or takes no list now — take its name out`);
});

// The team is read of the settings copy (settings.users), not destructured: every file that does is held until it was read,
// or named with what it does over a team that was not.
const TEAM_HELD = ['src/Tabs/HomeTab.jsx', 'src/Tabs/DispatchTab.jsx', 'src/components/documents/DocumentRail.jsx', 'src/components/documents/DocumentUploadRail.jsx', 'src/utils/documentPeople.js', 'src/Tabs/LeadsTab.jsx', 'src/Tabs/PipelineTab.jsx', 'src/Tabs/ReportsTab.jsx', 'src/Tabs/SalesManagerTab.jsx', 'src/components/modals/LeadModal.jsx', 'src/Tabs/settings/people/RolesDetail.jsx', 'src/Tabs/settings/people/TeamsDetail.jsx',
    'src/Tabs/settings/people/TerritoriesDetail.jsx', 'src/Tabs/settings/people/UsersDetail.jsx', 'src/Tabs/settings/quoting/ApprovalTiersDetail.jsx', 'src/Tabs/settings/integrations/AutomationsDetail.jsx', 'src/utils/reportScope.js'];
const TEAM_NAMED = {
    'src/App.jsx': 'the Viewing bar\'s names and filters: none to pick, none applied', 'src/Tabs/AccountsTab.jsx': 'an owner filter\'s names', 'src/Tabs/AdminView.jsx': 'the cards and the check, as read (cardSettings)',
    'src/utils/settingsCards.js': 'the same: no team counts nothing, and passes no check (settings-cards)',
    'src/Tabs/QuotesTab.jsx': 'an approver\'s name by id',
    'src/components/layout/AppHeader.jsx': 'a comment, and a rename of one row', 'src/components/layout/ModalLayer.jsx': 'handed to the team import, which waits (TEAM_LISTS)',
    'src/components/modals/CoachingNoteDialog.jsx': 'whom a note is to: none to pick, none sent', 'src/components/modals/OpportunityModal.jsx': 'a rep picker: none to pick, the one stored kept', 'src/components/rails/AccountRail.jsx': 'the same',
    'src/components/rails/ContactRail.jsx': 'the same; an owner named from it says a team that was not read (below)', 'src/components/rails/TaskRail.jsx': 'the same', 'src/Tabs/settings/dispatch/DispatchCrewsDetail.jsx': 'a comment: it reads the technicians',
};
test('THE GUARD — every file that reads the team of the settings copy is held until it was read, or named with what it does instead', () => {
    const walk = (d) => readdirSync(new URL(d, ROOT), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}${e.name}/`) : /\.jsx?$/.test(e.name) ? [d + e.name] : []));
    const reads = walk('src/').filter((f) => /settings\?*\.users\b/.test(read(f)));
    assert.deepEqual(reads.filter((f) => !TEAM_HELD.includes(f) && !TEAM_NAMED[f]), [], 'REGRESSION: a screen reads the team and nothing holds it until it was read');
    for (const f of [...TEAM_HELD, ...Object.keys(TEAM_NAMED)]) assert.ok(reads.includes(f), `${f}: gone, or reads no team now — take its name out`);
    for (const t of ['leads', 'pipeline', 'reports', 'salesManager', 'home', 'dispatch']) assert.ok(TAB_LISTS[t].includes('users'), t);
    assert.ok(code('src/components/rails/ContactRail.jsx').includes("|| (formData.ownerId ? unreadWords(loads, ['users']) : '')} />"), 'REGRESSION: an owned contact reads as nobody\'s over a team that was not read');
    const av = code('src/Tabs/AdminView.jsx');
    assert.ok(av.includes("const cardSettings = areRead(loads, ['users']) ? settings : { ...settings, users: undefined };") && av.includes("failedOf(loads, ['users']).length ? { ...liveCounts, unread: [...(liveCounts.unread || []), 'teams'] } : liveCounts;") && av.includes('<V2Card key={it.id} item={it} settings={cardSettings}'));
    const healthy = (users) => healthChecksOf({ users, pipelines: [1] }, {}).find((c) => c.id === 'teams');
    assert.deepEqual([healthy(undefined), healthy([])?.ok, healthy([{ name: 'A', team: 'T' }])?.ok, healthy([{ name: 'A' }])?.ok], [undefined, true, true, false], 'REGRESSION: a team that was not read passes "Team members assigned"');
    assert.deepEqual(unreadChecksOf({ unread: ['teams', 'jobs'] }).map((c) => c.id), ['jobs', 'teams'], 'in the tile\'s order');
    assert.deepEqual(unreadChecksOf({ unread: ['teams'] }), [{ id: 'teams', label: 'Team members assigned' }]);
});

test('SPIFF claims that were not read: the claim window opens and waits, offering none and saying none claimed; Home says it; a claim another member filed is taken from the refusal', () => {
    const app = code('src/App.jsx');
    const fn = app.slice(app.indexOf('    const promptSpiffClaim = (opp) => {'), app.indexOf('\n    };', app.indexOf('    const promptSpiffClaim = (opp) => {')) + 7);
    const ask = (loads, spiffClaims) => { const did = []; const r = new Function('areRead', 'loads', 'settings', 'spiffClaims', 'setSpiffClaimContext', 'setShowSpiffClaimModal', `${fn}\nreturn promptSpiffClaim;`)(
        areRead, loads, { spiffs: [{ id: 's', active: true }] }, spiffClaims, (v) => did.push(v.opp.id), (v) => did.push(v))({ id: 'd', stage: 'Closed Won' }); return [r, did]; };
    const CLAIMED = [{ opportunityId: 'd', spiffId: 's' }];
    assert.deepEqual([ask(allRead(), CLAIMED), ask(allRead(), []), ask({}, []), ask({ spiffClaims: FAILED('X.') }, CLAIMED)], [[false, []], [true, ['d', true]], [true, ['d', true]], [true, ['d', true]]], 'claimed, as read: no dead end; not read: the window waits');
    const m = code('src/components/layout/ModalLayer.jsx');
    assert.ok(m.includes("                        {!claimsRead ? (\n                            <Unread loads={loads} lists={['spiffClaims']} onRetry={retryLoads}/>\n                        ) : claimableSpiffs.length === 0 ? ("), 'REGRESSION: a SPIFF claimed already is offered over claims that were not read');
    assert.ok(m.includes("if (refused?.code === 'claimed' && refused.spiffClaim) setSpiffClaims(prev => (prev.some(c => c.id === refused.spiffClaim.id) ? prev : [...prev, refused.spiffClaim]));"));
    const home = code('src/Tabs/HomeTab.jsx');
    assert.ok(home.includes("unread={unreadWords(loads, ['spiffClaims'])}") && home.includes('{unread && <div role="status"') && home.includes('{mine.length > 0 && !unread && ('));
});

test('the team\'s load as useSettings has it — RUN: its rows to the settings copy, the 500 ms of a switch waited, a failure reported and the roster held left as it is', async () => {
    const src = code('src/hooks/useSettings.js');
    const i = src.indexOf('    const rosterGen = useRef(0);'); const body = src.slice(i, src.indexOf('\n    });', i) + 8);
    const go = async (answer, delay) => {
        const t = tracker(); const did = { order: [], copy: { a: 1, users: ['held'] } };
        const load = new Function('useRef', 'readList', 'dbFetch', 'setSettings', 'deps', 'waitForToken', 'setTimeout', `${body}\nreturn loadRoster;`)(
            (v) => ({ current: v }), readList, async (u) => { did.order.push(u); return answer; }, (f) => { did.copy = f(did.copy); }, { reportLoad: t.report }, async () => { did.order.push('token'); }, (r, ms) => { did.order.push(ms); r(); });
        setRequestOrg('org_a'); await quietly(() => (delay === undefined ? load() : load(delay))); setRequestOrg(null);
        return { ...did, e: t.loads().users };
    };
    assert.deepEqual(await go(ok('users', [{ id: 'u' }]), 500), { order: ['token', 500, '/.netlify/functions/users'], copy: { a: 1, users: [{ id: 'u' }] }, e: READ });
    // Two out, the second answered first: the count is the team's own, held across loads.
    {
        const hs = [held(), held()]; let n = 0; const took = [];
        const load = new Function('useRef', 'readList', 'dbFetch', 'setSettings', 'deps', 'waitForToken', 'setTimeout', `${body}\nreturn loadRoster;`)((v) => ({ current: v }), readList, () => hs[n++].read(), (f) => took.push(f({}).users), {}, async () => {}, (r) => r());
        setRequestOrg('org_a'); const p = [load(), load()]; await settle();
        hs[1].land(ok('users', ['second'])); await settle(); hs[0].land(ok('users', ['first'])); await Promise.all(p); setRequestOrg(null);
        assert.deepEqual(took, [['second']], 'REGRESSION: an older roster lands over the newer — a first sign-in\'s over the one read again');
    }
    assert.deepEqual(await go(refused(502)), { order: ['token', 0, '/.netlify/functions/users'], copy: { a: 1, users: ['held'] }, e: FAILED('The server returned 502.') }, 'REGRESSION: a refused roster is silent');
});

test('the notes read again — RUN: an answer a later read overtook, or for another org, dropped; a failed re-read said, for the org that asked', async () => {
    const src = code('src/hooks/useCoachingNotes.js');
    const a = src.indexOf('    const loadGen = useRef(0);'), b = src.indexOf('    useEffect(() => {'); const c = src.indexOf('    const reloadSaid = useCallback('), d = src.indexOf('    }, [reload]);', c) + 17;
    const { requestOrg, stillOrg } = await import('../src/utils/storage.js');
    const { readRefusal, failureWords } = await import('../src/utils/refusalWords.js');
    const make = (open) => { const did = { notes: [], errors: [] }; const go = new Function('useRef', 'useCallback', 'requestOrg', 'stillOrg', 'dbFetch', 'URL', 'readRefusal', 'failureWords', 'setCoachingNotes', 'setCoachingNotesLoaded', 'setCoachingNotesError', `${src.slice(a, b)}\n${src.slice(c, d)}\nreturn reloadSaid;`)(
        (v) => ({ current: v }), (f) => f, requestOrg, stillOrg, open, '/n', readRefusal, failureWords, (v) => did.notes.push(v), () => {}, (v) => did.errors.push(v)); return { did, go }; };
    setRequestOrg('org_a');
    const hs = [held(), held()]; let n = 0;
    const two = make(() => hs[n++].read());
    const p = [two.go(), two.go()]; await settle();
    hs[1].land(ok('coachingNotes', ['theirs'])); await settle(); hs[0].land(ok('coachingNotes', [])); await Promise.all(p);
    assert.deepEqual([two.did.notes, two.did.errors], [[['theirs']], ['']], 'REGRESSION: the notes answered to no one land over a first sign-in\'s own');
    // Overtaken as it fails: a refusal, a request that never left, an answer that cannot be read, one overtaken as it is read.
    const late = { refusal: refused(502), 'a throw': new TypeError('Failed to fetch'), unreadable: { ok: true, status: 200, json: async () => { throw new SyntaxError('<'); } } };
    for (const [what, answer] of Object.entries(late)) {
        const h = [held(), held()]; let k = 0; const m = make(() => h[k++].read()); const q = [m.go(), m.go()]; await settle();
        h[1].land(ok('coachingNotes', ['theirs'])); await settle(); h[0].land(answer); await Promise.all(q);
        assert.deepEqual([m.did.notes, m.did.errors], [[['theirs']], ['']], `REGRESSION: ${what} — an overtaken failure said over the notes read since`);
    }
    { let m; let k = 0; m = make(async () => (k++ ? ok('coachingNotes', ['theirs']) : { ok: true, status: 200, json: async () => { await m.go(); return { coachingNotes: [] }; } })); await m.go();
        assert.deepEqual(m.did.notes, [['theirs']], 'REGRESSION: overtaken while its answer was read'); }
    const failed = make(async () => refused(502)); await failed.go();
    assert.deepEqual([failed.did.notes, failed.did.errors], [[], ['The server returned 502.']], 'REGRESSION: a failed re-read is none');
    const left = make(async () => { setRequestOrg('org_b'); return refused(502); }); await left.go();
    assert.deepEqual([left.did.notes, left.did.errors], [[], []], 'another org\'s failure is not said');
    setRequestOrg(null);
    assert.ok(src.includes('reloadCoachingNotes: reloadSaid,'));
});

test('the loads T16 does not run — the quotes, the price book, the library, the leads: each its own rows to its own setter, its own count of loads, the price book the active products — RUN as written', async () => {
    const q = code('src/hooks/useQuotes.js'), d = code('src/hooks/useDocuments.js'), a = code('src/App.jsx');
    const cutOf = (src, from, to) => { const i = src.indexOf(from); assert.ok(i > 0, from); const j = src.indexOf(to, i); assert.ok(j > i, to); return src.slice(i, j + to.length); };
    const body = {
        quotes: cutOf(q, 'const quotesGen = useRef(0);', '}), []);') , products: cutOf(q, 'const productsGen = useRef(0);', '}), []);'),
        documents: cutOf(d, 'const docsGen = useRef(0);', '}, []);'), leads: cutOf(a, 'const leadsGen = React.useRef(0);', '    });'),
    };
    const ref = (v) => ({ current: v });
    const make = (open) => {
        const did = { took: {}, urls: [], said: [], loading: [], error: [] };
        const t = tracker();
        const set = (n) => (rows) => { did.took[n] = rows; };
        const names = { useRef: ref, React: { useRef: ref }, useCallback: (fn) => fn, readList, dbFetch: (u) => { did.urls.push(u); return open(u); }, waitForToken: async () => {}, deps: { reportLoad: t.report }, _deps: { reportLoad: t.report }, reportLoad: t.report,
            DOCS_FN: '/.netlify/functions/documents', setQuotes: set('quotes'), setProducts: set('products'), setDocuments: set('documents'), setLeads: set('leads'), setDocsLoading: (v) => did.loading.push(v), setDocsError: (v) => did.error.push(v) };
        const loaders = new Function(...Object.keys(names), `${Object.values(body).join('\n')}\nreturn { loadQuotes, loadProducts, loadDocuments, loadLeads };`)(...Object.values(names));
        return { did, t, ...loaders };
    };
    setRequestOrg('org_a');
    try {
        const listOf = (u) => /functions\/(\w+)/.exec(u)[1];
        const r = make(async (u) => ok(listOf(u), [{ id: listOf(u) }]));
        await Promise.all([r.loadQuotes(), r.loadProducts(), r.loadDocuments(), r.loadLeads()]);
        assert.deepEqual(r.did.took, { quotes: [{ id: 'quotes' }], products: [{ id: 'products' }], documents: [{ id: 'documents' }], leads: [{ id: 'leads' }] }, 'REGRESSION: a list read and not set, or one load overtaking another list\'s');
        assert.deepEqual(r.t.loads(), { quotes: READ, products: READ, documents: READ, leads: READ });
        assert.deepEqual(r.did.urls.sort(), ['documents', 'leads', 'products', 'quotes'].map((x) => `/.netlify/functions/${x}`), 'the price book: the active products alone');
        assert.deepEqual([r.did.loading, r.did.error], [[true, false], [null, null]], 'the library: loading, then not; no error');
        await r.loadProducts(true);
        assert.equal(r.did.urls.at(-1), '/.netlify/functions/products?includeInactive=true');
        const f = make(async () => refused(502));
        await quietly(() => Promise.all([f.loadQuotes(), f.loadProducts(), f.loadDocuments(), f.loadLeads()]));
        assert.deepEqual([f.did.took, f.did.loading, f.did.error, Object.values(f.t.loads()).map((e) => e.error)], [{}, [true, false], [null, 'The server returned 502.'], Array(4).fill('The server returned 502.')], 'REGRESSION: the library left loading, its failure never said');
        // Two of one list, the second answered first: the count is the list's own, held across loads.
        for (const l of ['Quotes', 'Products', 'Documents', 'Leads']) {
            const hs = [held(), held()]; let n = 0;
            const g = make(() => hs[n++].read());
            const p = [g[`load${l}`](), g[`load${l}`]()];
            await settle();
            hs[1].land(ok(l.toLowerCase(), ['second'])); await settle(); hs[0].land(ok(l.toLowerCase(), ['first'])); await Promise.all(p);
            assert.deepEqual(g.did.took[l.toLowerCase()], ['second'], `REGRESSION: ${l} — an answer a later load overtook lands after it`);
            if (l === 'Documents') assert.deepEqual(g.did.loading, [true, true, false], 'the overtaken load leaves the later one its state');
        }
    } finally { setRequestOrg(null); }
    // The counts are held across renders, each its own list's.
    for (const [src, n] of [[q, 'quotesGen'], [q, 'productsGen'], [d, 'docsGen'], [a, 'leadsGen']]) { assert.equal([...src.matchAll(new RegExp(`const ${n} = (?:React\\.)?useRef\\(0\\);`, 'g'))].length, 1); assert.equal(count(src, `gen: ${n},`), 1, `${n}: its own load's alone`); }
    // A switch: the emptied lists unread, and a quote's link the Quotes tab has not taken is the last org's.
    const clear = cutOf(a, 'if (listsOrgRef.current && listsOrgRef.current !== organization.id) {', 'listsOrgRef.current = organization.id;');
    assert.ok(clear.includes('resetLoads(organization.id);') && clear.includes('setQuotesDeepLinkOppId(null);') && clear.includes('setSpiffClaims([]);'));
    assert.equal(count(a, 'setSpiffClaims([])'), 1, 'REGRESSION: the claims emptied where they still read as read');
});

test('a technician\'s Dispatch; a saved report\'s lists are named for each source, whole', () => {
    assert.deepEqual([tabLists('reports', { technician: true }), tabLists('settings'), tabLists('reports').includes('leads')], [TAB_LISTS.reports, [], true], 'Reports waits for the leads whatever the Leads feature: a saved report reads them');
    assert.deepEqual([tabLists('dispatch'), tabLists('dispatch', { technician: true })], [['accounts', 'opportunities', 'users'], []], 'the server answers a technician no account and no deal: their day waits for none of them');
    assert.deepEqual(Object.keys(REPORT_LISTS).sort(), [...REPORT_SOURCES].sort());
    assert.deepEqual(REPORT_LISTS, { Opportunities: ['opportunities', 'accounts'], Accounts: ['accounts', 'opportunities', 'activities'], Leads: ['leads'], Activity: ['activities', 'opportunities', 'accounts'] });
    for (const l of Object.values(REPORT_LISTS).flat()) assert.ok(l in LIST_NAMES, l);
    const home = code('src/Tabs/HomeTab.jsx');
    assert.ok(home.includes(`{result && unreadWords(loads, REPORT_LISTS[r.source] || REPORT_LISTS.Opportunities)
                                            ? <div role="status" style={{ fontSize: '0.75rem', color: T.inkMuted, fontFamily: T.sans }}>{unreadWords(loads, REPORT_LISTS[r.source] || REPORT_LISTS.Opportunities)}</div>
                                            : result
                                            ? <ReportChart`), 'a pinned report of a list that was not read says so; one that was draws its chart');
});

test('what is drawn beside the gates — the header\'s search and bell, a deal\'s quotes, a record\'s documents — reads its list first', () => {
    for (const [file, ...lines] of [
        ['src/components/modals/OpportunityModal.jsx', "const quotesUnread = unreadWords(loads, ['quotes']);", "{quotesUnread || 'No quotes yet'}", "{oppQuotes.length === 0 && !quotesUnread ? 'Build First Quote' : 'Open in Quote Builder'}"],
        ['src/components/layout/AppHeader.jsx', "const unread = unreadWords(loads, ['accounts', 'contacts', 'opportunities']);", 'if (noHits && unread) return', '{unread && <div role="status"', "const bellUnread = unreadWords(loads, ['opportunities', 'tasks', 'activities']);", '{bellUnread && notifications.length > 0 && <div role="status"', "{bellUnread || 'No notifications'}"],
        ['src/components/documents/RecordDocuments.jsx', "const docsUnread = unreadWords(loads, ['documents']);", '{docsUnread && docs.length > 0 && <div role="status"', "{docsUnread || 'No documents linked yet.'}", "{docsUnread ? '' :"],
        ['src/components/documents/AttachmentsStrip.jsx', "const docsUnread = unreadWords(loads, ['documents']);", '{docsUnread && docs.length > 0 && <div role="status"', "{docsUnread || 'No attachments.'}"],
        ['src/components/documents/DocumentPicker.jsx', "const docsUnread = unreadWords(loads, ['documents']);", '{docsUnread && rows.length > 0 && <div role="status"', "{docsUnread || 'No other documents available.'}"],
    ]) { const s = read(file); for (const l of lines) assert.equal(count(s, l), 1, `${file}: ${l}`); }
    // Each takes the tracker from the context: handed none, it would say "Loading…" for good.
    for (const file of ['modals/OpportunityModal', 'layout/AppHeader', 'layout/ModalLayer', 'documents/RecordDocuments', 'documents/AttachmentsStrip', 'documents/DocumentPicker', 'ui/ListsWait', 'ui/PanelGate']) {
        const s = read(`src/components/${file}.jsx`);
        assert.ok([...s.matchAll(/const\s*\{([^}]*)\}\s*=\s*useApp\(\)/g)].some((m) => /\bloads\b/.test(m[1].replace(/\/\/.*$/gm, ''))), `${file}: loads from the context`);
    }
});
