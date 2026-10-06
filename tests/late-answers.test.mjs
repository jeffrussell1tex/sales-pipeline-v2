// §0.175 (Jeff: "push dev and start the next batch") — an action begun in one
// org changes nothing after a switch. §0.173 checked every LOAD against the org
// that asked (§18b66.2) and §0.174 put back what was open on a switch (§18b67);
// an ACTION's answer still landed after both. A save's answer appended to the
// list on screen and re-opened forms; a delete offered Undo for the last org's
// rows once its DELETE landed; Log from calendar opened with the last org's
// events. And a request an action sent after the switch carried the NEW org's
// token: a lead's convert, or an Undo's restore, wrote the last org's rows into
// the org on screen.
//
// The rule, scanned over all of src (a parse, not a regex): after an async
// boundary — an `await`, the start of a .then/.catch/.finally or timer callback,
// a loop that awaits — the org is checked (`stillOrg`) before the action sets
// shared state or sends a write. Shared state: the 116 values App puts back on a
// switch (useOrgBoundState) and the shared lists. A late GET needs no check —
// its answer is dropped by the load's own (§0.173).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '@babel/parser';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

const SHARED_LISTS = ['setOpportunities', 'setAccounts', 'setContacts', 'setTasks', 'setActivities', 'setCoachingNotes',
    'setDocuments', 'setQuotes', 'setProducts', 'setLeads', 'setSpiffClaims',
    'setSettings'];   // the org's settings and roster
const orgBoundSetters = () => {
    const out = new Set();
    for (const f of ['src/hooks/useModalState.js', 'src/hooks/useUIState.js', 'src/hooks/useCalendarState.js']) {
        for (const m of read(f).matchAll(/const \[(\w+),\s+(set\w+)\]\s+= useOrgBoundState\(resets, /g)) out.add(m[2]);
    }
    return out;
};

// Files whose own useState IS the shared state; anywhere else a setter declared
// by the file's own useState is that component's local state, not the shared one.
const OWNERS = /^src\/(App\.jsx|hooks\/[^/]+\.js)$/;

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

const isFn = (n) => n && /^(ArrowFunctionExpression|FunctionExpression|FunctionDeclaration|ObjectMethod|ClassMethod)$/.test(n.type);
const isLoop = (n) => n && /^(ForStatement|ForOfStatement|ForInStatement|WhileStatement|DoWhileStatement)$/.test(n.type);
const ASYNC_CB = /^(then|catch|finally)$/;
// The org checks in use: stillOrg (§0.173), the profile load's org ref (§0.163) and
// useSettings' load generation — a newer load owns the state (§0.162).
const CHECK = /stillOrg\(|prevOrgIdRef\.current !== |gen !== loadGenRef\.current/;
const WRITE_METHOD = /^(POST|PUT|PATCH|DELETE)$/;

// A callback a component calls after an await: what the parent does with it — set
// a list, open a record — happens late too. Closing and progress callbacks do not.
const CALLBACK = /^on(?!(Close|Cancel|Back|Progress|Error)$)[A-Z]\w*$/;

// A write request: dbWrite, or dbFetch — or a fetch handed in (fetchFn) — with a
// non-GET method in its options literal.
// Helpers that send a write of their own: the client audit row, the SMS and the
// calendar-event POSTs (src/App.jsx, src/hooks/useOpportunities.js, useTasks.js,
// useActivities.js). Called after a switch, each would carry the new org's token.
const WRITING_HELPERS = /^(addAudit|fireMentionSms|fireActivityCalendarEvent|fireCalendarEvent)$/;

const writeRequest = (call) => {
    const c = call.callee;
    if (c.type !== 'Identifier') return null;
    if (c.name === 'dbWrite') return 'dbWrite';
    if (WRITING_HELPERS.test(c.name)) return c.name;
    if (c.name !== 'dbFetch' && c.name !== 'fetchFn') return null;
    const opts = call.arguments[1];
    if (!opts || opts.type !== 'ObjectExpression') return null;
    const m = opts.properties.find((p) => p.key && (p.key.name === 'method' || p.key.value === 'method'));
    if (!m) return null;
    if (m.value.type === 'StringLiteral') return WRITE_METHOD.test(m.value.value) ? `dbFetch ${m.value.value}` : null;
    return 'dbFetch (computed method)';
};

// Can an await run before a point? Both in one function, the await ending first,
// and not on another branch of an if, a ?: or a switch (a try's catch and finally
// run after its block's awaits, so they count).
const runsBefore = (aw, pt) => {
    if (aw.end > pt.start) return false;
    let i = 0;
    while (i < aw.path.length && i < pt.path.length && aw.path[i] === pt.path[i]) i++;
    const lca = aw.path[i - 1];
    const a = aw.path[i], p = pt.path[i];
    if (!lca || !a || !p) return true;
    // An await on an if's branch that always leaves (its block ends in return or
    // throw) never runs before what follows the if: `if (!res.ok) { await …; return; }`.
    const leaves = (n) => n && (/^(ReturnStatement|ThrowStatement)$/.test(n.type)
        || (n.type === 'BlockStatement' && n.body.length > 0 && /^(ReturnStatement|ThrowStatement)$/.test(n.body[n.body.length - 1].type)));
    for (let k = i; k < aw.path.length - 1; k++) {
        const n = aw.path[k], child = aw.path[k + 1];
        if (n.type === 'IfStatement' && (child === n.consequent || child === n.alternate) && leaves(child)) return false;
    }
    if (lca.type === 'IfStatement' || lca.type === 'ConditionalExpression') return !((a === lca.consequent && p === lca.alternate) || (a === lca.alternate && p === lca.consequent));
    if (lca.type === 'SwitchStatement') return a === lca.discriminant;   // another case is another branch
    return true;
};

const sharedSetters = () => {
    const shared = orgBoundSetters();
    for (const s of SHARED_LISTS) shared.add(s);
    return shared;
};

// Every late set or write in src that no org check precedes.
export const scan = () => {
    const shared = sharedSetters();
    return srcFiles().flatMap((file) => scanText(file, read(file), shared));
};

// One file's late sets and writes that no org check precedes.
export const scanText = (file, src, shared = sharedSetters()) => {
    const out = [];
    {
        const owner = OWNERS.test(file);
        const local = new Set(owner ? [] : [...src.matchAll(/const \[\w+,\s*(set\w+)\]\s*=\s*(?:React\.)?useState\(/g)].map((m) => m[1]));
        const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
        const points = [];   // { node, what, fn, path }
        const visit = (node, path, fns, parent) => {
            if (!node || typeof node.type !== 'string') return;
            let pushedFn = false;
            if (isFn(node)) {
                let lateCb = false;
                if (parent && parent.type === 'CallExpression' && parent.arguments.includes(node)) {
                    const c = parent.callee;
                    if (c.type === 'MemberExpression' && c.property && ASYNC_CB.test(c.property.name)) lateCb = true;
                    if (c.type === 'Identifier' && /^(setTimeout|setInterval)$/.test(c.name)) lateCb = true;
                }
                fns.push({ node, lateCb, awaits: [], depth: path.length });
                pushedFn = true;
            }
            const here = [...path, node];
            // putSettings answers only in the org that asked — after a switch it never
            // settles (src/Tabs/settings/shared/saveSettings.js) — so awaiting it opens no window.
            const settles = !(node.argument && node.argument.type === 'CallExpression' && node.argument.callee.name === 'putSettings');
            if (node.type === 'AwaitExpression' && fns.length && settles) fns[fns.length - 1].awaits.push({ end: node.end, path: here });
            if (node.type === 'CallExpression' && fns.length) {
                const name = node.callee.type === 'Identifier' ? node.callee.name : null;
                const what = (name && shared.has(name) && !local.has(name)) ? name
                    : (name && CALLBACK.test(name)) ? name : writeRequest(node);
                if (what) points.push({ node, what, fn: fns[fns.length - 1], fns: [...fns], path: here });
            }
            for (const key of Object.keys(node)) {
                if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra') continue;
                const v = node[key];
                if (Array.isArray(v)) v.forEach((c) => visit(c, here, fns, node));
                else if (v && typeof v.type === 'string') visit(v, here, fns, node);
            }
            if (pushedFn) fns.pop();
        };
        visit(ast.program, [], [], null);
        for (const pt of points) {
            const fn = pt.fn;
            // 1. an await in the point's own function that runs before it
            let boundary = fn.awaits.filter((aw) => runsBefore(aw, { start: pt.node.start, path: pt.path })).map((aw) => aw.end).pop();
            // 2. a loop around the point, inside its function, that awaits: every pass after the first is late
            if (boundary === undefined) {
                const loops = pt.path.slice(fn.depth).filter((n) => isLoop(n));
                const awaiting = loops.filter((l) => fn.awaits.some((aw) => aw.path.includes(l)));
                if (awaiting.length) boundary = awaiting[awaiting.length - 1].body.start;
            }
            // 3. inside an async callback (at any depth): its start
            if (boundary === undefined) {
                for (let i = pt.fns.length - 1; i >= 0; i--) if (pt.fns[i].lateCb) { boundary = pt.fns[i].node.start; break; }
            }
            if (boundary === undefined) continue;
            if (CHECK.test(src.slice(boundary, pt.node.start))) continue;
            const line = src.split('\n')[pt.node.loc.start.line - 1].trim();
            out.push({ file, at: pt.node.loc.start.line, what: pt.what, line });
        }
    }
    return out;
};

// Late points that are not an action's answer — each read here, with why, as
// { file, line: a substring of the point's line, why }. None today: even a
// click's short handoff to the tab it opens checks the org.
const ALLOWED = [];

test('after an await or in an async callback, the org is checked before shared state is set or a write is sent', () => {
    const misses = scan().filter((v) => !ALLOWED.some((a) => a.file === v.file && v.line.includes(a.line)));
    assert.deepEqual(misses.map((v) => `${v.file}:${v.at} ${v.what} — ${v.line.slice(0, 110)}`), [],
        'an answer that lands after a switch sets the new org\'s screen, or sends a write with its token — check `stillOrg(askedOrg)` first');
});

test('every allowed late point is still in the code — a stale entry hides nothing', () => {
    const all = scan();
    for (const a of ALLOWED) assert.ok(all.some((v) => v.file === a.file && v.line.includes(a.line)), `stale allowance: ${a.file} ${a.line}`);
});

test('the scanner sees what it is for: a late set, a late write, a write in an awaiting loop, a catch after an await — and not a branch beside one', async () => {
    const fixture = [
        'async function a() { const r = await x(); setAccounts([]); }',                                 // late set
        'async function b() { await x(); await dbWrite("/u", { method: "PUT" }); }',                     // late write
        'async function c(rows) { for (const r of rows) { await dbWrite("/u", {}); } }',                 // write in an awaiting loop
        'async function d() { try { await x(); } catch (e) { setUndoToast(e); } }',                      // a catch after an await
        'async function e(f) { if (f) { await x(); } else { setUndoToast(1); } }',                       // a branch beside: not late
        'async function g() { const r = await x(); if (!stillOrg(o)) return; setAccounts([]); }',       // checked
        'function h() { y().then(() => setLeads([])); }',                                                  // late in a .then
        'async function i() { await putSettings({}); setSettings(s => s); }',                            // putSettings never settles after a switch
    ].join('\n');
    const misses = scanText('src/fixture.js', fixture).map((v) => `${v.at} ${v.what}`);
    assert.deepEqual(misses, ['1 setAccounts', '2 dbWrite', '3 dbWrite', '4 setUndoToast', '7 setLeads']);
});

// ── putSettings — run ────────────────────────────────────────────────────────

test('putSettings answers only in the org that asked: after a switch it never settles; without one it answers, and throws on a refusal', async () => {
    const { putSettings } = await import('../src/Tabs/settings/shared/saveSettings.js');
    const { setRequestOrg } = await import('../src/utils/storage.js');
    const PENDING = Symbol('pending');
    const outcome = (pr) => Promise.race([pr.then((v) => ({ v }), (e) => ({ e: e.message })), new Promise((r) => setTimeout(() => r(PENDING), 60))]);
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const savedWindow = globalThis.window, savedFetch = globalThis.fetch;
    globalThis.window = { __getClerkToken: async () => 'token' };
    try {
        let release;
        globalThis.fetch = () => new Promise((r) => { release = r; });
        const answer = (status, body) => release(new Response(JSON.stringify(body), { status }));

        setRequestOrg('org_A');                                   // no switch: the answer
        let pr = putSettings({ teams: [] }); await tick(); answer(200, { settings: { ok: 1 } });
        assert.deepEqual(await outcome(pr), { v: { settings: { ok: 1 } } });

        pr = putSettings({ teams: [] }); await tick(); answer(500, { error: 'refused' });
        assert.deepEqual(await outcome(pr), { e: 'refused' }, 'a refusal in the same org throws, for the panel to show');

        pr = putSettings({ teams: [] }); await tick();            // a switch while it is out
        setRequestOrg('org_B'); answer(200, { settings: { ok: 1 } });
        assert.equal(await outcome(pr), PENDING, 'the last org\'s answer is not handed to the new org\'s screen');

        setRequestOrg('org_A');
        pr = putSettings({ teams: [] }); await tick();
        setRequestOrg('org_B'); answer(500, { error: 'refused' });
        assert.equal(await outcome(pr), PENDING, 'nor is its refusal — the panel would roll back to the last org\'s settings');

        // A switch while the answer's body is read: the answer came in the asking org.
        let releaseBody;
        const slowBody = (ok, status, body) => release({ ok, status, json: () => new Promise((r) => { releaseBody = () => r(body); }) });
        setRequestOrg('org_A');
        pr = putSettings({ teams: [] }); await tick(); slowBody(true, 200, { settings: { ok: 1 } }); await tick();
        setRequestOrg('org_B'); releaseBody();
        assert.equal(await outcome(pr), PENDING, 'a switch during the body read: the answer still goes nowhere');

        setRequestOrg('org_A');
        pr = putSettings({ teams: [] }); await tick(); slowBody(false, 500, { error: 'refused' }); await tick();
        setRequestOrg('org_B'); releaseBody();
        assert.equal(await outcome(pr), PENDING, 'nor a refusal whose body is read across the switch');
    } finally {
        globalThis.window = savedWindow; globalThis.fetch = savedFetch;
        const { setRequestOrg } = await import('../src/utils/storage.js');
        setRequestOrg(null);
    }
});

// ── An import, an upload — run ───────────────────────────────────────────────

test('the bulk client stops before its next chunk once the org that started the import is not on screen — no chunk with the new org\'s token', async () => {
    const { makeBulkClient, BULK_CHUNK, ORG_SWITCHED } = await import('../src/utils/bulkClient.js');
    const rows = Array.from({ length: BULK_CHUNK * 2 + 5 }, (_, i) => ({ id: 'r' + i }));
    let sent = 0, onScreen = 'org_A';
    const fetchFn = async (url, opts) => {
        sent++;
        onScreen = 'org_B';                                       // the switch lands while the first chunk is out
        const chunk = JSON.parse(opts.body);
        return { ok: true, json: async () => (opts.method === 'POST' ? { insertedIds: chunk.map((r) => r.id) } : { updated: chunk.length }) };
    };
    const bulk = makeBulkClient(fetchFn);
    const still = () => onScreen === 'org_A';

    const posted = await bulk.postNew('/x', rows, { stillOrg: still });
    assert.equal(sent, 1, 'one chunk went out, before the switch');
    assert.equal(posted.landed.length, BULK_CHUNK, 'what landed is reported');
    assert.equal(posted.error, ORG_SWITCHED);

    sent = 0; onScreen = 'org_A';
    const put = await bulk.putBulk('/x', rows, { stillOrg: still });
    assert.equal(sent, 1);
    assert.equal(put.error, ORG_SWITCHED);

    sent = 0; onScreen = 'org_A';
    const unasked = await bulk.postNew('/x', rows);               // a caller that hands no check: every chunk, as before
    assert.equal(sent, 3);
    assert.equal(unasked.error, null);
});

test('an upload cut by an org switch after its presign stops there and never settles — the bytes and the record are never sent', async () => {
    const { uploadNewDocument, uploadNewVersion } = await import('../src/utils/documentsStorage.js');
    const { setRequestOrg } = await import('../src/utils/storage.js');
    const PENDING = Symbol('pending');
    const outcome = (pr) => Promise.race([pr.then((v) => ({ v }), (e) => ({ e: e.message })), new Promise((r) => setTimeout(() => r(PENDING), 60))]);
    const file = { name: 'contract.pdf', size: 2048, type: 'application/pdf' };
    // Node has no XMLHttpRequest: an upload that went on to the bytes would throw.
    assert.equal(typeof globalThis.XMLHttpRequest, 'undefined');
    try {
        for (const [label, run] of [
            ['a new document', (f) => uploadNewDocument(f, { file, name: 'Contract' })],
            ['a new version', (f) => uploadNewVersion(f, { file, documentId: 'doc_1' })],
        ]) {
            const asked = [];
            const dbFetch = async (url) => {
                asked.push(url);
                setRequestOrg('org_B');                           // the switch lands while the presign is out
                return { ok: true, json: async () => ({ storageKey: 'k', uploadUrl: 'https://r2.example/put', version: 2 }) };
            };
            setRequestOrg('org_A');
            assert.equal(await outcome(run(dbFetch)), PENDING, `${label}: stops after the presign`);
            assert.equal(asked.length, 1, `${label}: no record request after the switch`);
        }
    } finally {
        setRequestOrg(null);
    }
});

// ── Scanned ──────────────────────────────────────────────────────────────────

test('the modals and rails remount on an org switch — eleven of them stay mounted while hidden and kept the last org\'s drafts', () => {
    const app = read('src/App.jsx');
    assert.ok(app.includes("<ModalLayer key={activeOrgId || 'no-org'} />"));
    assert.equal(app.split('<ModalLayer').length - 1, 1, 'one ModalLayer');
});

test('the Home calendar\'s loading flag is cleared only by the fetch of the org on screen', () => {
    const app = read('src/App.jsx');
    const fn = app.slice(app.indexOf('const fetchCalendarEvents = async () => {'), app.indexOf('// Log from Calendar handlers'));
    assert.ok(fn.includes('if (stillOrg(askedOrg)) setCalendarLoading(false);'), 'the last org\'s fetch leaves the new org\'s flag alone');
    assert.ok(!/finally \{\s*setCalendarLoading\(false\);/.test(fn));
});

test('no array callback is handed a comparison instead of a function — `prev.filter(c.id !== x)` threw on every refused restore', () => {
    const bad = [];
    for (const file of srcFiles()) {
        const src = read(file);
        const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
        const visit = (node) => {
            if (!node || typeof node.type !== 'string') return;
            if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.property
                && /^(filter|map|find|findIndex|some|every|forEach)$/.test(node.callee.property.name)) {
                const arg = node.arguments[0];
                if (arg && /^(BinaryExpression|LogicalExpression|UnaryExpression)$/.test(arg.type)) bad.push(`${file}:${node.loc.start.line}`);
            }
            for (const key of Object.keys(node)) {
                if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra') continue;
                const v = node[key];
                if (Array.isArray(v)) v.forEach(visit);
                else if (v && typeof v.type === 'string') visit(v);
            }
        };
        visit(ast.program);
    }
    assert.deepEqual(bad, []);
});
