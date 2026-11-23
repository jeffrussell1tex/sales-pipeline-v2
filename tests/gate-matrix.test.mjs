// THE GUARD (state §0.288): who may do what on the server, run. §0.287's review measured about thirty gate returns —
// `if (forbidden) return forbidden;` — that could be deleted with every unit test passing: no unit test ran a handler
// (they import a database), so each gate was pinned as text or not at all, and the harness, which runs the unit suites
// alone, could not see one go. Here every function of netlify/functions runs for real (a scheduled one to its off switch) as every role and signed out, with
// sign-in, the database, Clerk and the network faked (tests/gates/engine.mjs), and
//   1. each answer is the one written in tests/gates/answers.mjs — who is refused, with what status and words, and who
//      is let past: a gate gone, its return gone, a role added to it or taken from it, a method opened without one;
//   2. every shape its own source looks at (shapesOf says how it reads them) — a request with no query, a body that is a
//      list, each query parameter and body field, each value it compares one with — answers as its method does, or as
//      the table says: a gate that such a branch goes round shows;
//   3. a refusal comes before any write, raw statement, stored file, Clerk write or send (a request named with its reason
//      aside);
//   4. signed out, or refused by sign-in itself, a function says so and asks the database nothing — the public and
//      scheduled ones named;
//   5. every refusal a function returns is left out in memory, one at a time, and some answer must change: a new gate no
//      request reaches fails here until one does, or it is named, and counted, with why nothing can. A refusal is a 401
//      or 403, or a gate's answer (requireRole, requireWrite, requireAdmin, assertOwnership, dispatchGate) returned.
// Not read here: what a 200 holds (which rows, which fields: the lists and masks are their own suites'), an org or owner
// filter in SQL (org-scoping, owner-writes), a write that touched no row (missedWrite) and a bulk write's forbidden rows,
// a refusal said as a 404 that no aimed request asks, sign-in itself (auth.mjs: session-status, org-roles), and rules
// keyed on managedReps or the Clerk org role; a condition of several values or alternatives is cut whole, so one that loses
// a part shows only where a request asks that part.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, TURNED_OFF, ask, functionFiles, gatesOf, load, loadCut, shapesOf, sourceOf } from './gates/engine.mjs';
import { ANSWERS, SAID } from './gates/answers.mjs';
import { REQUESTS as CRM } from './gates/requests-crm.mjs';
import { REQUESTS as SALES } from './gates/requests-sales.mjs';
import { REQUESTS as QUOTES } from './gates/requests-quotes.mjs';
import { REQUESTS as DISPATCH } from './gates/requests-dispatch.mjs';
import { REQUESTS as PEOPLE } from './gates/requests-people.mjs';
import { REQUESTS as REST } from './gates/requests-rest.mjs';

const REQUESTS = {};
for (const set of [CRM, SALES, QUOTES, DISPATCH, PEOPLE, REST]) {
    for (const [f, list] of Object.entries(set)) { assert.ok(!(f in REQUESTS), `${f}: its requests in one file`); REQUESTS[f] = list; }
}
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];
const ASKERS = [...ROLES, null];
const nameOf = (file) => file.replace('netlify/functions/', '').replace('.mjs', '');
const FUNCTIONS = Object.keys(ANSWERS).map(nameOf);

// Modules of netlify/functions that answer no request.
const LIBRARIES = ['auth', 'crypto', 'dispatch-automations', 'score-lead'];
// The functions, or their methods, a caller need not be signed in to ask, and what stands in sign-in's place.
const ALL = METHODS;
const PUBLIC = {
    'calendar-oauth-callback': [ALL, 'the calendar service sends the browser back: a state signed here, in this browser'],
    'calendar-oauth-start': [['GET'], 'an old Connect link: a fixed redirect home that says it failed'],
    digest: [ALL, 'scheduled'], 'pipeline-alerts': [ALL, 'scheduled'], 'quote-reminders': [ALL, 'scheduled'], 'report-deliveries': [ALL, 'scheduled'],
    'score-deals-batch': [ALL, 'scheduled'], 'score-leads-batch': [ALL, 'scheduled'], 'task-reminders': [ALL, 'scheduled'],
    'dispatch-status': [ALL, "the customer's status page: the job's own token"],
    'email-inbound': [['POST'], "the mail service's webhook: its signature, or the shared secret"],
    'lead-intake': [ALL, "the company's web form: its own token"],
    'public-api': [ALL, 'an API key'],
    'send-email': [ALL, "the server's own calls: the internal secret"], 'send-sms': [ALL, "the server's own calls: the internal secret"],
};
const isPublic = (f, method) => !!PUBLIC[f]?.[0].includes(method);
// Refusals no request reaches: [function, the `if`, what it returns (its start), why].
const UNREACHED = [
    ['ai-models', '!response.ok', 'answer(200', "no refusal of a caller: the words of Anthropic's own 401 or 403, in a 200"],
    ['quote-email', '!nowAccess.canWrite', '{ statusCode: 403', "after an aborted claim, the deal read again: reached only by a member with a roster id from before the app's own, on a deal nobody's when first read and theirs by then"],
    ['quotes', '!access.canWrite', 'refuse(403, forbidden)', 'after an aborted claim, as quote-email'],
];
const unreached = (f, g) => UNREACHED.findIndex(([fn, t, r]) => fn === f && t === g.test && g.returns.startsWith(r));

const CODES = new Map(Object.entries(SAID).map(([code, words]) => [words, code]));
// An answer as the table writes it. Plain: `.` let past, `x` a method it does not take; aimed: the status too.
const written = (x, aimed) => {
    if (x.refused) return CODES.get(`${x.status} ${x.said}`) || `${x.status} ${x.said}`;
    if (aimed) return [x.status, x.said].filter(Boolean).join('_').replace(/ /g, '_');
    return x.status === 405 ? 'x' : '.';
};
// Every answer of one function: the plain lines, then the aimed ones; `seen` hears each answer.
async function answersOf(f, handler, seen = () => {}) {
    const lines = [];
    for (const r of [...METHODS.map((method) => ({ method })), ...(REQUESTS[f] || [])]) {
        const out = [];
        for (const role of ASKERS) { const x = await ask(handler, f, r, role); seen(r, role, x); out.push(written(x, !!r.what)); }
        lines.push(out.join(' '));
    }
    return lines;
}
const tableOf = (f) => {
    const a = ANSWERS[`netlify/functions/${f}.mjs`];
    return [...METHODS.map((m) => a.plain[m]), ...(a.aimed || []).map(([, line]) => line)];
};

test('the table names every function file, and every request by its words — a new function is asked here, or is named as none', () => {
    assert.deepEqual([...FUNCTIONS, ...LIBRARIES].sort(), functionFiles(), 'every file of netlify/functions: in ANSWERS, or a library');
    for (const f of Object.keys(REQUESTS)) assert.ok(FUNCTIONS.includes(f), `${f}: requests for a function that is not there`);
    for (const f of FUNCTIONS) {
        const a = ANSWERS[`netlify/functions/${f}.mjs`];
        assert.deepEqual((a.aimed || []).map(([what]) => what), (REQUESTS[f] || []).map((r) => r.what), `${f}: the aimed lines are its requests, in order`);
        assert.equal(new Set((a.aimed || []).map(([what]) => what)).size, (a.aimed || []).length, `${f}: each request said once`);
        for (const line of tableOf(f)) assert.equal(line?.split(' ').length, ASKERS.length, `${f}: eight answers a line`);
    }
    const used = new Set(FUNCTIONS.flatMap(tableOf).flatMap((l) => l.split(' ')));
    for (const [code, words] of Object.entries(SAID)) {
        assert.ok(used.has(code), `SAID: ${code} is no one's answer`);
        assert.match(words, /^40[13] ./, `${code}: a refusal's status and words`);
        assert.ok(!/^[\dx.]/.test(code), `${code}: never read as a status`);
    }
    assert.equal(CODES.size, Object.keys(SAID).length, 'one code for one refusal');
});

// Every function asked once, as it stands: its lines, its shapes' lines, and each answer with who asked what.
const ASKED = [];
const asked = (async () => {
    const all = {};
    for (const f of FUNCTIONS) {
        const handler = await load(f), lines = await answersOf(f, handler, (r, role, x) => ASKED.push([f, r, role, x]));
        const shapes = [];
        for (const r of shapesOf(sourceOf(f))) {
            const out = [];
            for (const role of ASKERS) { const x = await ask(handler, f, r, role); ASKED.push([f, r, role, x]); out.push(written(x, false)); }
            shapes.push([r, out.join(' ')]);
        }
        all[f] = { lines, shapes };
    }
    return all;
})();

test('every function, every role: each answer as written — RUN', async () => {
    const all = await asked, wrong = [];
    for (const f of FUNCTIONS) {
        const is = all[f].lines, want = tableOf(f);
        const names = [...METHODS, ...(REQUESTS[f] || []).map((r) => r.what)];
        is.forEach((line, i) => { if (line !== want[i]) wrong.push(`${f} — ${names[i]}\n      is   ${line}\n      rule ${want[i]}`); });
    }
    assert.deepEqual(wrong, [], `REGRESSION: who may do what changed (in order: ${ASKERS.map((r) => r || 'signed out').join(', ')}):\n   ${wrong.join('\n   ')}\n`);
});

test('every shape a function looks at answers as its method does, or as the table says — no branch goes round a gate — RUN', async () => {
    const all = await asked, wrong = [], left = [];
    let shapes = 0;
    for (const f of FUNCTIONS) {
        const { plain, also = {} } = ANSWERS[`netlify/functions/${f}.mjs`];
        for (const [r, line] of all[f].shapes) {
            shapes += 1;
            const want = also[r.label] ?? plain[r.method];
            if (line !== want) wrong.push(`${f} — ${r.label}\n      is   ${line}\n      rule ${want}`);
        }
        const labels = new Map(all[f].shapes.map(([r]) => [r.label, r.method]));
        for (const [label, line] of Object.entries(also)) if (!labels.has(label) || line === plain[labels.get(label)]) left.push(`${f} — ${label}`);
    }
    assert.ok(shapes >= 3344, `the shapes asked (${shapes}; 3,344 on 23 Nov)`);
    assert.deepEqual(wrong, [], `REGRESSION: a branch answers other roles than its method does (in order: ${ASKERS.map((r) => r || 'signed out').join(', ')}):\n   ${wrong.join('\n   ')}\n`);
    assert.deepEqual(left, [], 'a line of `also` for a shape that is gone, or that answers as its method does — take it out');
});

test('a refusal comes before any write or send; signed out, or refused by sign-in itself, a function says so and asks the database nothing — RUN', async () => {
    await asked;
    const wrote = [], open = new Set();
    let refused = 0, out = 0;
    for (const [f, r, role, x] of ASKED) {
        if (x.refused) refused += 1;
        if (x.refused && x.wrote && !r.afterWrite) wrote.push(`${f} ${r.method} ${r.what || r.label || ''} as ${role || 'signed out'}: ${x.said}`);
        if (role !== null || isPublic(f, r.method)) continue;
        out += 1;
        if ((x.status !== 401 && x.status !== 405) || x.asked) open.add(`${f} ${r.method} ${r.what || r.label || ''}: ${x.status}, ${x.asked} statements`);
    }
    // A member turned off since their session began (or one with no organization) is refused by sign-in with a 403: the
    // function hands that on, and reads nothing.
    let off = 0;
    for (const f of FUNCTIONS) {
        const handler = await load(f);
        for (const r of [...METHODS.map((method) => ({ method })), ...(REQUESTS[f] || []), ...shapesOf(sourceOf(f))]) {
            if (isPublic(f, r.method)) continue;
            const x = await ask(handler, f, r, TURNED_OFF);
            if (x.status === 405) continue;
            off += 1;
            if (x.status !== 403 || !/turned off/.test(x.said) || x.asked) open.add(`${f} ${r.method} ${r.what || r.label || ''}, refused by sign-in: ${x.status} ${x.said}, ${x.asked} statements`);
        }
    }
    assert.ok(refused >= 15775 && out >= 3653 && off >= 3255, `the refusals read (${refused}), the signed-out answers (${out}), sign-in's own (${off})`);
    assert.deepEqual(wrote, [], 'REGRESSION: a write, a Clerk write or a send before its refusal');
    assert.deepEqual([...open], [], 'REGRESSION: answered a caller sign-in refused');
    for (const [f, [methods, why]] of Object.entries(PUBLIC)) assert.ok(FUNCTIONS.includes(f) && methods.length && why.length >= 9, `${f}: a public function that is there`);
    for (const set of Object.values(REQUESTS)) for (const r of set) if ('afterWrite' in r) assert.ok(r.afterWrite.length > 30, `${r.what}: why a write may stand before its refusal`);
});

test('THE GUARD — every refusal a function returns, left out in memory, changes an answer: none can go unseen — RUN', async () => {
    await asked;   // one request at a time: the fakes are shared
    const unseen = [], named = new Map();
    let gates = 0;
    for (const f of FUNCTIONS) {
        const src = sourceOf(f);
        for (const g of gatesOf(src)) {
            gates += 1;
            assert.ok(g.range, `${f}:${g.line}: a refusal under no \`if\` — ${g.returns}`);
            const same = (await answersOf(f, await loadCut(f, g.range))).join('\n') === tableOf(f).join('\n');
            const place = unreached(f, g);
            if (place >= 0) { named.set(place, (named.get(place) || 0) + 1); assert.ok(same, `${f}:${g.line}: named as unreached, but a request reaches it — take its name out`); continue; }
            if (same) unseen.push(`${f}:${g.line}  if (${g.test.slice(0, 90)}) return ${g.returns.slice(0, 90)}`);
        }
    }
    assert.ok(gates >= 217, `the refusals found (${gates}; 217 on 23 Nov) — a scan that stops finding them fails here`);
    assert.deepEqual(unseen, [], 'REGRESSION: a refusal no request reaches — add one to tests/gates/requests-*.mjs (the caller it refuses, and the one it lets by), or name it in UNREACHED with why');
    UNREACHED.forEach(([f, t, r, why], i) => { assert.equal(named.get(i), 1, `${f}: if (${t}) returning ${r} is named as unreached, once — a new one is reached, or named`); assert.ok(why.length > 10); });
});

test('the engine on made-up code: each shape of refusal found, its loss cut where it stands; a cut copy really lost its gate — RUN', async () => {
    await asked;
    const one = (body) => gatesOf(`export const handler = async (event) => {\n${body}\n};`);
    const cutOf = (body) => { const src = `export const handler = async (event) => {\n${body}\n};`; const g = gatesOf(src)[0]; return src.slice(0, g.range[0]) + src.slice(g.range[1]); };
    for (const body of ['if (auth.error) return { statusCode: auth.status || 401, body: auth.error };', 'if (forbidden) return forbidden;', 'if (forbiddenPut) return forbiddenPut;', 'if (denied) return denied;',
        'if (gate.response) return gate.response;', 'if (adminErr) return adminErr;', 'if (refusal) return refusal;', 'if (notYours) return notYours;', 'if (refusedNow) return refusedNow;',
        "if (!ok) return { statusCode: 403, headers };", "if (!ok) return reply(403, 'no');", "if (!ok) { console.warn('x'); return { statusCode: 401 }; }", "if (!ok) return mayRead ? refuse(403, 'no') : refuse(404, 'gone');",
        "const blocked = requireRole(auth, ['Admin'], headers); if (blocked) return blocked;", "const mine = await assertOwnership({ table }); if (mine) return mine;", "const d = await dispatchGate(auth, event, headers); if (d.response) return d.response;",
        "const no = x ? requireRole(auth, ['Admin'], headers) : null; if (no) return no;", "const { response: no } = await dispatchGate(auth, event, headers); if (no) return no;", "let no = null; if (x) no = requireRole(auth, ['Admin'], headers); if (no) return no;"]) {
        assert.equal(one(body).length, 1, `REGRESSION: not read as a refusal: ${body}`);
        assert.ok(!/return/.test(cutOf(body)), `REGRESSION: the refusal left in the cut copy: ${body}`);
    }
    for (const body of ["if (!row) return { statusCode: 404 };", 'if (forbidden) note(forbidden);', 'return { statusCode: 200 };', 'if (x) return forbiddenWords(x);']) assert.deepEqual(one(body), [], `no refusal of a caller: ${body}`);
    // A return among other statements goes alone; the rest of its block still runs.
    assert.match(cutOf("if (tech) { const own = find(); if (!own) { log(); return { statusCode: 403 }; } keep(); }"), /keep\(\)/);
    assert.match(cutOf("if (tech) { const own = find(); return { statusCode: 403 }; }"), /const own = find\(\)/, 'a declaration before it stays');
    assert.equal(one("return { statusCode: 403 };")[0].range, null, 'under no `if`: said, never cut');
    // Run: the tasks write gate left out lets a Dispatcher by; kept, it refuses them.
    const [, gate] = gatesOf(sourceOf('tasks'));
    assert.equal(gate.test, 'forbidden');
    const make = { method: 'POST', body: { id: 'x1', title: 'Call' } };
    assert.deepEqual([(await ask(await load('tasks'), 'tasks', make, 'Dispatcher')).refused, (await ask(await loadCut('tasks', gate.range), 'tasks', make, 'Dispatcher')).refused], [true, false]);
    // A statement that names its columns is answered those alone, each from the column it names; a raw statement, a Clerk
    // write and a send count as writes, a Clerk read does not.
    const { db } = await import('../db/index.js'), { users } = await import('../db/schema.js'), { createClerkClient } = await import('@clerk/backend');
    const rows = { users: [{ id: 'usr_1', name: 'Ann', role: 'User' }] };
    let got;
    await ask(async () => { got = [await db.select({ who: users.name, id: users.id }).from(users), await db.select({ id: users.id }).from(users), await db.select().from(users)]; return { statusCode: 200 }; }, 'tasks', { method: 'GET', rows }, 'Admin');
    assert.deepEqual(got, [[{ who: 'Ann', id: 'usr_1' }], [{ id: 'usr_1' }], rows.users], 'REGRESSION: a read answers a column it did not ask for — a check that stopped reading the owner would pass');
    const { S3Client } = await import('@aws-sdk/client-s3');
    const wrote = async (act) => (await ask(async () => { try { await act(); } catch { /* no network */ } return { statusCode: 200 }; }, 'tasks', { method: 'POST' }, 'Admin')).wrote;
    assert.deepEqual([await wrote(() => db.execute('x')), await wrote(() => fetch('https://x.test')), await wrote(() => new S3Client().send({})), await wrote(() => createClerkClient().users.updateUser('u')), await wrote(() => createClerkClient().users.getUser('u')), await wrote(() => db.select().from(users))],
        [true, true, true, true, false, false], 'REGRESSION: a raw statement, a send, a stored file or a Clerk write before a refusal goes unseen');
    // The shapes a source looks at.
    const shapes = shapesOf(`export const handler = async (event) => { const qs = event.queryStringParameters || {}; const { clear } = event.queryStringParameters || {}; const data = JSON.parse(event.body);
        if (clear === 'true' || event.queryStringParameters?.resource === 'lines') return 1; if (qs.quotas) return 2; if (data.action === 'invite' || data.teamId) return 3;
        const act = qs.act || ''; if (act === 'go') return 4; const { mode } = qs; switch (mode) { case 'fast': return 5; } if (['a', 'b'].includes(qs['pick'])) return 6;
        const sent = JSON.parse(event.body || '{}'); const { kind, deep = 1 } = JSON.parse(event.body); if (sent.dry === true || kind === 'k' || 'note' in data || deep) return 7; };`).map((r) => r.label);
    for (const label of ['DELETE ?clear=true', 'PATCH ?resource=lines', 'PUT ?quotas=true', "POST { action: 'invite' }", "PUT { teamId: 'x' }", 'POST a list', 'GET no query', 'GET ?act=go', 'POST ?mode=fast', 'GET ?pick=b',
        'PATCH { dry: true }', "DELETE { kind: 'k' }", "POST { note: 'x' }", "POST { deep: 'x' }"]) assert.ok(shapes.includes(label), `REGRESSION: a shape not asked: ${label} of ${shapes.join(', ')}`);
    // A request's env is its own.
    await ask(async () => ({ statusCode: 200 }), 'tasks', { method: 'GET', env: { GATES_SAID: 'x' } }, 'Admin');
    assert.equal(process.env.GATES_SAID, undefined);
});
