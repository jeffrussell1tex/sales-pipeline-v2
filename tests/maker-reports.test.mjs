// tests/maker-reports.test.mjs — who made a saved report is the server's (state §0.250, guide §18b125 rule 2;
// OPEN_ITEMS §4.6, the report half of the two "maker" items). Jeff, 14 Nov: "Start the maker items" (all Recommended):
// the maker shown is the LIVE name of the member of THIS org whose Clerk id is the report's ownerId, else the stored
// name, else none; the screens send no maker; a create names the caller's member name, a save keeps the stored one;
// a taken report id is a 409 that writes nothing.
// RUN: namedByMaker (src/utils/reportMaker.js — the GET's and the answers' naming, pure); saved-reports.mjs's
// makersNamed over a stub db (its one org-scoped read; a failed read answers the stored names); the two report saves of
// ReportsTab.jsx (handleSaveReport, handleSaveAsReport) extracted and run over stubs — the body names no maker; an
// answer with no row keeps the stored row's maker on a save in place and names the viewer, locally only, on a create.
// WIRING (§18b23 — the endpoint needs a database, the screens React): saved-reports.mjs's stamp, keep, 409 and one
// org-scoped roster read; the library card's '—'. The handler against a real database: tests/integration/
// saved-reports.itest.mjs (its §0.250 cases).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { namedByMaker } from '../src/utils/reportMaker.js';
import { readRefusal, failureWords } from '../src/utils/refusalWords.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const between = (s, a, b) => { const i = s.indexOf(a); assert.ok(i >= 0, a); const j = s.indexOf(b, i + a.length); assert.ok(j > i, b); return s.slice(i, j); };
const count = (s, needle) => s.split(needle).length - 1;
const order = (s, ...needles) => {
    let at = -1;
    for (const n of needles) { const i = s.indexOf(n, at + 1); assert.ok(i > at, `in order: ${n}`); at = i; }
};

// ── RUN: the naming ─────────────────────────────────────────────────────────────────────────────────────────────

test('namedByMaker: the live roster name by the row\'s ownerId (a Clerk id), else the stored name, else none — never anyone else\'s — RUN', () => {
    const roster = [
        { clerkUserId: 'clerk_karen', name: 'Karen Renamed' },
        { clerkUserId: 'clerk_jeff', name: 'Jeff' },
        { clerkUserId: null, name: 'No login' },
        { clerkUserId: 'clerk_blank', name: '' },
        { clerkUserId: 'clerk_karen', name: 'Second row' },
    ];
    const rows = [
        { id: 'r1', ownerId: 'clerk_karen', ownerName: 'Karen Old' },    // renamed: the live name
        { id: 'r2', ownerId: 'clerk_jeff', ownerName: null },            // stored none: the live name
        { id: 'r3', ownerId: 'clerk_gone', ownerName: 'Gone Member' },   // no member now: the stored name
        { id: 'r4', ownerId: 'clerk_gone', ownerName: null },            // neither: none
        { id: 'r5', ownerId: 'clerk_blank', ownerName: '' },             // a blank name is none
        { id: 'r6', ownerId: null, ownerName: null },                    // no owner id never matches a member with no login
    ];
    const frozen = rows.map((r) => Object.freeze({ ...r }));
    const out = namedByMaker(frozen, roster);
    assert.deepEqual(out.map((r) => [r.id, r.ownerName]), [
        ['r1', 'Karen Renamed'], ['r2', 'Jeff'], ['r3', 'Gone Member'], ['r4', null], ['r5', null], ['r6', null],
    ], 'REGRESSION (§0.250): the maker read from the stored snapshot, or from the wrong member');
    assert.deepEqual(frozen.map((r) => r.ownerName), rows.map((r) => r.ownerName), 'the rows are copied, never changed');
    assert.deepEqual(out[0], { ...rows[0], ownerName: 'Karen Renamed' }, 'only ownerName moves; the owner id stands');
    // The roster is THIS org's: a Clerk id that is a member of another org reads nothing from it.
    assert.deepEqual(namedByMaker([{ id: 'x', ownerId: 'clerk_other_org', ownerName: null }], roster).map((r) => r.ownerName), [null]);
    // No roster, no rows, a row that is not one: never a throw.
    assert.deepEqual(namedByMaker([{ id: 'y', ownerId: 'clerk_jeff', ownerName: 'Stored' }], null).map((r) => r.ownerName), ['Stored']);
    assert.deepEqual(namedByMaker(null, roster), []);
    assert.deepEqual(namedByMaker([undefined], roster), [undefined]);
});

// ── WIRING: the endpoint ────────────────────────────────────────────────────────────────────────────────────────

test('saved-reports.mjs: the create stamps the caller\'s member name after the body\'s keys, a taken id is a 409 with no audit row, a save keeps the stored maker', () => {
    const s = code(read('netlify/functions/saved-reports.mjs'));
    assert.ok(s.includes("import { serverErrorBody, auditAs, getCallerName } from './_lib.mjs';"));
    assert.ok(s.includes("import { namedByMaker } from '../../src/utils/reportMaker.js';"));
    const post = between(s, "        if (event.httpMethod === 'POST') {", "        if (event.httpMethod === 'PUT') {");
    order(post,
        'const payload = sanitize({',
        '...data, orgId, ownerId: userId, config: configFor(data.config, null, delivery),',
        'ownerName: (await getCallerName(userId, orgId)) || null,',
        'const [inserted] = await db.insert(savedReports).values(payload).onConflictDoNothing({ target: savedReports.id }).returning();',
        "if (!inserted) return { statusCode: 409, headers, body: JSON.stringify({ error: 'That report id is already in use.' }) };",
        'await auditAs(orgId, userId, {',
        "action: 'saved_report.created'",
        'return { statusCode: 201, headers, body: JSON.stringify({ report: (await makersNamed([inserted], orgId))[0] }) };');
    assert.ok(!post.includes('data.ownerName'), 'REGRESSION (§0.250): the create takes the body\'s maker');
    const put = between(s, "        if (event.httpMethod === 'PUT') {", "        if (event.httpMethod === 'DELETE') {");
    order(put,
        'ownerId:   existing.ownerId,',
        'ownerName: existing.ownerName ?? null,',
        'return { statusCode: 200, headers, body: JSON.stringify({ report: (await makersNamed([updated], orgId))[0] }) };');
    assert.ok(!put.includes('data.ownerName'), 'REGRESSION (§0.250): a save over a stored none takes the body\'s maker (the Admin\'s name on a teammate\'s report)');
    // The one read of a body's ownerName left is sanitize's, and every call site names the maker after it.
    assert.equal(count(s, 'data.ownerName'), 1, 'only the row builder reads the key');
    assert.ok(s.includes('    ownerName:   data.ownerName   ?? null,'));
});

test('saved-reports.mjs: every answer names the maker by ONE org-scoped roster read, names and Clerk ids only, mapped in JS — no join; nothing written', () => {
    const s = code(read('netlify/functions/saved-reports.mjs'));
    const named = between(s, 'const makersNamed = async (rows, orgId) => {', '\n};');
    order(named,
        'if (!orgId || !rows.some(Boolean)) return rows;',
        'try {',
        'roster = await db.select({ clerkUserId: users.clerkUserId, name: users.name }).from(users).where(eq(users.orgId, orgId));',
        '} catch (e) {',
        "console.warn('saved-reports makers:', e.message);",
        'return rows;',
        'return namedByMaker(rows, roster);');
    assert.ok(!/\b(insert|update|delete)\(/.test(named), 'read-only');
    const get = between(s, "        if (event.httpMethod === 'GET') {", "        if (event.httpMethod === 'POST' && params.action === 'deliver') {");
    assert.ok(get.includes('return { statusCode: 200, headers, body: JSON.stringify({ reports: await makersNamed(rows, orgId) }) };'), 'the GET names every row\'s maker');
    assert.ok(!s.includes('JSON.stringify({ reports: rows })'), 'REGRESSION (§0.250): the GET answers the stored snapshot');
    assert.equal(count(s, 'makersNamed('), 3, 'the GET, the create and the save answer through it');
    assert.ok(!/Join\(/.test(s), 'no SQL join: the answer stays flat ({ reports: rows }, { report })');
    // THE GUARD's org-scoping scan (tests/ownership-registry.test.mjs, ENDPOINTS), over this file: every users read is by org.
    const lookups = [...s.matchAll(/\.from\(users\)\s*\n?\s*\.where\(([^;]*?)\);/g)];
    assert.equal(lookups.length, 2, 'the schedule\'s recipients and the makers\' names');
    for (const m of lookups) assert.ok(/users\.orgId/.test(m[1]), `REGRESSION: an unscoped users read — ${m[0]}`);
    assert.equal(count(s, '.from(users)'), lookups.length, 'no users read the scan cannot see');
});

// makersNamed lifted out of saved-reports.mjs AS WRITTEN (comments dropped) and run over a stub db: the one read is
// this org's, and a read that fails answers the rows with their stored names — the name is display only, so it never
// turns a create or save that landed, or the library's GET, into a 500.
const USERS = Object.freeze({ clerkUserId: 'users.clerk_user_id', name: 'users.name', orgId: 'users.org_id' });
const makersNamedOf = (db) => {
    const s = code(read('netlify/functions/saved-reports.mjs'));
    const fn = between(s, 'const makersNamed = async (rows, orgId) => {', '\n};') + '\n};';
    const warned = [];
    const run = new Function('db', 'users', 'eq', 'namedByMaker', 'console', `${fn}\nreturn makersNamed;`)(
        db, USERS, (a, b) => ['eq', a, b], namedByMaker, { warn: (...a) => warned.push(a) });
    return { run, warned };
};
const stubDb = (answer) => {
    const asked = [];
    const db = {
        select: (cols) => ({
            from: (table) => ({
                where: async (w) => { asked.push({ cols: Object.keys(cols), table, w }); if (answer instanceof Error) throw answer; return answer; },
            }),
        }),
    };
    return { db, asked };
};

test('makersNamed: one read of THIS org\'s roster names the makers; a roster read that fails answers the stored names, never a throw — RUN', async () => {
    const ROWS = [Object.freeze({ id: 'r1', ownerId: 'clerk_karen', ownerName: 'Karen Old' }), Object.freeze({ id: 'r2', ownerId: 'clerk_gone', ownerName: null })];
    const landed = stubDb([{ clerkUserId: 'clerk_karen', name: 'Karen Renamed' }]);
    const ok = makersNamedOf(landed.db);
    const named = await ok.run(ROWS, 'org_A');
    assert.deepEqual(named.map((r) => [r.id, r.ownerName]), [['r1', 'Karen Renamed'], ['r2', null]], 'the live name by the owner\'s Clerk id');
    assert.equal(landed.asked.length, 1, 'one read');
    assert.deepEqual(landed.asked[0].cols, ['clerkUserId', 'name'], 'names and Clerk ids only');
    assert.equal(landed.asked[0].table, USERS);
    assert.deepEqual(landed.asked[0].w, ['eq', USERS.orgId, 'org_A'], 'REGRESSION: the roster read is not THIS org\'s');
    assert.deepEqual(ok.warned, []);
    // The read fails (rejected, or thrown before it is sent): the rows as stored, the failure logged, no throw.
    const failed = stubDb(new Error('connection reset'));
    const bad = makersNamedOf(failed.db);
    const kept = await bad.run(ROWS, 'org_A');
    assert.equal(kept, ROWS, 'REGRESSION (§0.250): a failed roster read throws — a landed create or save answers 500, the GET loses the library');
    assert.deepEqual(kept.map((r) => r.ownerName), ['Karen Old', null], 'the stored names');
    assert.deepEqual(bad.warned, [['saved-reports makers:', 'connection reset']]);
    const sync = makersNamedOf({ select: () => { throw new Error('no pool'); } });
    assert.equal(await sync.run(ROWS, 'org_A'), ROWS, 'a read that throws before it is sent');
    // No org, or no row: nothing read.
    const idle = stubDb([]);
    const none = makersNamedOf(idle.db);
    assert.equal(await none.run(ROWS, null), ROWS);
    assert.deepEqual(await none.run([], 'org_A'), []);
    assert.equal(idle.asked.length, 0, 'no read without an org or a row');
});

// ── RUN: the screens ────────────────────────────────────────────────────────────────────────────────────────────

const answerOf = (status, body) => ({ ok: status < 400, status, json: async () => { if (body instanceof Error) throw body; return body; } });
const stateOf = (initial) => {
    const s = { value: initial };
    s.set = (u) => { s.value = typeof u === 'function' ? u(s.value) : u; };
    return s;
};
const callbackOf = (src, name, deps) => {
    const head = `    const ${name} = React.useCallback(`;
    const whole = between(src, head, `\n    }, ${deps});`);
    return `const ${name} = ${whole.slice(head.length)}\n    };`;
};
const VIEWER = 'Karen Rep', VIEWER_ID = 'clerk_karen';
const STORED_ROW = Object.freeze({ id: 'rpt_a', name: 'Pipeline by rep', ownerId: 'clerk_jeff', ownerName: 'Jeff', isShared: true, config: Object.freeze({ templateId: 'tpl_pipeline', delivery: Object.freeze({ enabled: true }) }), createdAt: '2026-11-01' });
const saves = (which, list = [STORED_ROW]) => {
    const r = read('src/Tabs/ReportsTab.jsx');
    const st = { list: stateOf(list), sent: [], handed: [], answers: [] };
    const dbFetch = async (url, opts) => { st.sent.push([opts.method, JSON.parse(opts.body)]); return st.answers.shift(); };
    const common = [() => 'org_a', () => true, dbFetch, readRefusal, failureWords, () => {}, { randomUUID: () => 'new' }, VIEWER, VIEWER_ID];
    const names = ['requestOrg', 'stillOrg', 'dbFetch', 'readRefusal', 'failureWords', 'setTimeout', 'crypto', 'currentUser', 'clerkUserId'];
    const noop = () => {};
    if (which === 'library') {
        const fn = callbackOf(r, 'handleSaveReport', '[currentUser, clerkUserId]');
        st.call = new Function(...names, 'setSaveState', 'setSaveError', 'setSavedReportsList', 'setShowCreateReport', 'setCreateMode',
            'setSaveErrorAt', 'savePlaceRef', `${fn}\nreturn handleSaveReport;`)(...common, noop, noop, st.list.set, noop, noop, noop, { current: 'library' });
    } else {
        const fn = callbackOf(r, 'handleSaveAsReport', '[currentUser, clerkUserId, onSaveReport]');
        st.call = new Function(...names, 'setSaveReportState', 'setSaveReportError', 'onSaveReport',
            `${fn}\nreturn handleSaveAsReport;`)(...common, noop, noop, (rep) => st.handed.push(rep));
    }
    return st;
};
const BUILT = { name: 'Pipeline by rep, again', source: 'Opportunities', dims: [], metrics: [], chartType: 'bar', description: null, config: null, filters: { period: 'all' } };
const noMaker = (body) => !('ownerId' in body) && !('ownerName' in body);

test('the builder\'s save sends no maker; an answer with no row keeps the stored row\'s maker in place and names the viewer, here only, on a create — RUN', async () => {
    // A create the server answers with its row: the row, as answered.
    const made = saves('library');
    const ANSWERED = { id: 'rpt_new', name: 'x', ownerId: VIEWER_ID, ownerName: 'Karen (server)' };
    made.answers.push(answerOf(201, { report: ANSWERED }));
    await made.call(BUILT);
    assert.deepEqual(made.sent.map(([m]) => m), ['POST']);
    assert.ok(noMaker(made.sent[0][1]), 'REGRESSION (§0.250): the create\'s body names a maker');
    assert.deepEqual(made.list.value, [ANSWERED, STORED_ROW]);
    // A create answered with no row: the viewer made it — their Clerk id (filed under "Your reports", Share/Deliver/Delete
    // theirs) and their name, in the list only.
    const bare = saves('library');
    bare.answers.push(answerOf(201, {}));
    await bare.call(BUILT);
    assert.ok(noMaker(bare.sent[0][1]));
    assert.deepEqual([bare.list.value[0].id, bare.list.value[0].ownerId, bare.list.value[0].ownerName], ['rpt_new', VIEWER_ID, VIEWER],
        'REGRESSION: a create kept from its payload carried a NAME in the Clerk-id slot');
    assert.equal(bare.list.value[1], STORED_ROW);
    // A save in place answered with no row: merged over the row in the list — the maker, the share and the schedule kept.
    const inPlace = saves('library');
    inPlace.answers.push(answerOf(200, {}));
    await inPlace.call({ ...BUILT, id: 'rpt_a' });
    assert.deepEqual(inPlace.sent.map(([m, b]) => [m, b.id]), [['PUT', 'rpt_a']]);
    assert.ok(noMaker(inPlace.sent[0][1]), 'REGRESSION (§0.250): a save names a maker');
    assert.equal(inPlace.list.value.length, 1);
    const kept = inPlace.list.value[0];
    assert.deepEqual([kept.ownerId, kept.ownerName, kept.isShared, kept.createdAt, kept.name],
        ['clerk_jeff', 'Jeff', true, '2026-11-01', 'Pipeline by rep, again'],
        'REGRESSION (§0.250): a save in place replaced the stored row with its payload — the maker gone, the owner\'s report under "Shared with you"');
    // Its config merged as the server merges it (saved-reports.mjs configFor): a builder save sends config null, and the
    // stored schedule (config.delivery) and template id stand.
    assert.deepEqual(kept.config, { templateId: 'tpl_pipeline', delivery: { enabled: true } },
        'REGRESSION (§0.250): a save in place answered with no row lost the schedule and the template id the server kept');
    // A save naming config keys: they merge over the stored ones; a body's delivery never replaces the stored schedule.
    const keyed = saves('library');
    keyed.answers.push(answerOf(200, {}));
    await keyed.call({ ...BUILT, id: 'rpt_a', config: { templateId: 'tpl_new', delivery: { enabled: false } } });
    assert.deepEqual(keyed.list.value[0].config, { templateId: 'tpl_new', delivery: { enabled: true } }, 'merged as configFor merges');
    // A stored row with NO schedule, a save naming config.delivery: the body's schedule is dropped (configFor deletes it;
    // only a top-level delivery schedules) — the list never shows a schedule the server did not store (the review's gap).
    const noSched = saves('library', [{ ...STORED_ROW, config: { templateId: 'tpl_pipeline' } }]);
    noSched.answers.push(answerOf(200, {}));
    await noSched.call({ ...BUILT, id: 'rpt_a', config: { templateId: 'tpl_new', delivery: { enabled: false } } });
    assert.deepEqual(noSched.list.value[0].config, { templateId: 'tpl_new' }, 'REGRESSION (§0.250): a body\'s schedule shown that configFor drops');
    const onlySched = saves('library', [{ ...STORED_ROW, config: null }]);
    onlySched.answers.push(answerOf(200, {}));
    await onlySched.call({ ...BUILT, id: 'rpt_a', config: { delivery: { enabled: true } } });
    assert.equal(onlySched.list.value[0].config, null, 'REGRESSION (§0.250): a body\'s schedule alone shown over a stored none');
    // No stored config and none named: none.
    const plain = saves('library', [{ ...STORED_ROW, config: null }]);
    plain.answers.push(answerOf(200, {}));
    await plain.call({ ...BUILT, id: 'rpt_a' });
    assert.equal(plain.list.value[0].config, null);
    // A save in place answered with its row: the server's row.
    const answered = saves('library');
    answered.answers.push(answerOf(200, { report: { ...STORED_ROW, name: 'Server name' } }));
    await answered.call({ ...BUILT, id: 'rpt_a' });
    assert.deepEqual(answered.list.value, [{ ...STORED_ROW, name: 'Server name' }]);
    // A save in place of a row the list does not hold, answered with no row: no maker named — never the viewer.
    const stray = saves('library', []);
    stray.answers.push(answerOf(200, {}));
    await stray.call({ ...BUILT, id: 'rpt_elsewhere' });
    assert.ok(noMaker(stray.list.value[0]), 'REGRESSION: a report the viewer did not make named as theirs');
});

test('Activity history\'s "Save as report" sends no maker; an answer with no row hands the viewer\'s row, here only — RUN', async () => {
    const bare = saves('history');
    bare.answers.push(answerOf(201, {}));
    await bare.call('Acme', 'Account');
    assert.deepEqual(bare.sent.map(([m]) => m), ['POST']);
    assert.ok(noMaker(bare.sent[0][1]), 'REGRESSION (§0.250): the history report\'s body names a maker');
    assert.deepEqual([bare.handed.length, bare.handed[0].ownerId, bare.handed[0].ownerName, bare.handed[0].name], [1, VIEWER_ID, VIEWER, 'Account history — Acme'],
        'REGRESSION: a report kept from its payload carried a NAME in the Clerk-id slot');
    const answered = saves('history');
    const ROW = { id: 'rpt_new', ownerId: VIEWER_ID, ownerName: 'Karen (server)' };
    answered.answers.push(answerOf(201, { report: ROW }));
    await answered.call('Acme', 'Account');
    assert.deepEqual(answered.handed, [ROW]);
});

test('ReportsTab.jsx: the library card names the maker or "—", never the viewer; no screen sends a maker; Activity history reads the viewer\'s Clerk id', () => {
    const s = code(read('src/Tabs/ReportsTab.jsx'));
    const card = between(s, 'const LibraryCard = ({ r, mayTouch, pinned, onOpen, onPin, onShare, onDeliver, onDelete }) => {', '\n};');
    assert.ok(card.includes("{r.ownerName || '—'}</span>"), 'a report with no maker reads "—"');
    assert.ok(!card.includes('currentUser'), 'REGRESSION (§0.250): the card names the VIEWER as the maker of a report with none');
    assert.equal(count(s, 'currentUser={currentUser}\n                                onOpen={openCard}'), 0, 'the library hands the card no viewer name');
    assert.ok(!s.includes('ownerId: currentUser'), 'REGRESSION: a display name sent in the Clerk-id slot');
    // ownerName: currentUser stands only in the two answers-with-no-row, beside the viewer's Clerk id, never in a body.
    assert.equal(count(s, 'ownerName: currentUser'), 2);
    assert.ok(s.includes('const listed = data?.report || (existingId ? null : { ...payload, ownerId: clerkUserId, ownerName: currentUser });'));
    assert.ok(s.includes('if (onSaveReport) onSaveReport(data?.report || { ...payload, ownerId: clerkUserId, ownerName: currentUser });'));
    const history = between(s, 'function ActivityHistoryTab(', 'const handleSaveAsReport = React.useCallback(');
    assert.ok(history.includes('const { userId: clerkUserId } = useAuth();'), 'the viewer\'s Clerk id, as the library reads it');
});
