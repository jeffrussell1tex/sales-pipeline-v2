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
    assert.ok(shapes >= 3340, `the shapes asked (${shapes}; 3,344 on 23 Nov; 3,340 since §0.289 — a body's fromStatus is read in seenIn, src/utils/jobChanges.js, no longer in the function's own file)`);
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
    assert.ok(refused >= 15884 && out >= 3675 && off >= 3277, `the refusals read (${refused}), the signed-out answers (${out}), sign-in's own (${off})`);
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

// The eight Dispatch creates (state §0.290's three; technicians, vehicles, equipment, time off and service plans since §0.291): an id this org
// holds is answered with its record as stored — before a link, a login or a percent is asked, and again when the insert wrote
// nothing, two pressed at once — and another org's id with the words alone; nothing written but the insert that wrote none. Each
// line left out in memory answers otherwise. Moved in §0.291: what a create would be refused for is a list for each, and the column its
// record is named by is said for each.
test("a Dispatch create whose id the org holds answers 409 idInUse with the record as stored, nothing written; another org's id, the words alone — RUN", async () => {
    await asked;
    const row = { id: 'x1', orgId: 'org_a', name: 'As stored', title: 'As stored', firstName: 'As stored', lastName: 'Field', userId: 'user_ana', customerId: 'x1', customerNumber: 'CUST-0007', jobNumber: 'JOB-2026-0007', address: '1 Main St', city: 'Dallas', status: 'scheduled', scheduledDate: '2026-12-01',
        category: 'hvac', cadence: 'annual', techId: 'tech_me', blockType: 'pto', startDate: '2026-12-01', endDate: '2026-12-02', allDay: true };
    const base = { settings: [{ extra: { dispatchEnabled: true } }], dispatch_customers: [{ ...row, id: 'c1' }], dispatch_technicians: [{ id: 'tech_me', orgId: 'org_a' }], users: [{ id: 'usr_ana', orgId: 'org_a', clerkUserId: 'user_ana', name: 'Ana Field' }] };
    // Each: the function, its answer's key, its look and the column its record is named by, its table, and what a create of it
    // sends; refusals: what it would be refused for were it a new one — a link, a login, a percent — and the status of each.
    const LINKS = [[{ accountId: 'acc_gone', customerId: 'c_gone' }, 404]];
    const creates = [
        ['dispatch-jobs', 'job', 'Job', 'title', 'dispatch_jobs', {}, { id: 'x1', customerId: 'c1', title: 'Typed' }, 'That job id is already in use.', LINKS],
        ['dispatch-customers', 'customer', 'Customer', 'name', 'dispatch_customers', {}, { id: 'x1', name: 'Typed' }, 'That customer id is already in use.', LINKS],
        ['dispatch-customers', 'location', 'Location', 'name', 'dispatch_service_locations', { resource: 'locations' }, { id: 'x1', customerId: 'c1', name: 'Typed', address: 'a', city: 'c' }, 'That location id is already in use.', LINKS],
        ['dispatch-technicians', 'technician', 'Technician', 'firstName', 'dispatch_technicians', {}, { id: 'x1', firstName: 'Typed', lastName: 'Typed' }, 'That technician id is already in use.', [[{ assignedVehicleId: 'veh_gone' }, 404], [{ userId: 'usr_gone' }, 404]]],
        ['dispatch-vehicles', 'vehicle', 'Vehicle', 'name', 'dispatch_vehicles', {}, { id: 'x1', name: 'Typed' }, 'That vehicle id is already in use.', [[{ assignedTechId: 'tech_gone' }, 404]]],
        ['dispatch-equipment', 'item', 'Equipment', 'name', 'dispatch_equipment', {}, { id: 'x1', name: 'Typed' }, 'That equipment id is already in use.', [[{ checkedOutToId: 'tech_gone' }, 404], [{ checkedOutJobId: 'job_gone' }, 404]]],
        ['dispatch-schedule-blocks', 'block', 'Block', 'title', 'dispatch_schedule_blocks', {}, { id: 'x1', techId: 'tech_me', title: 'Typed', startDate: '2026-12-05' }, 'That block id is already in use.', [[{ techId: 'tech_gone' }, 404]]],
        ['dispatch-service-plans', 'plan', 'Plan', 'name', 'dispatch_service_plans', {}, { id: 'x1', name: 'Typed' }, 'That plan id is already in use.', [[{ visitTemplateId: 'tpl_gone' }, 404], [{ coveredJobTypes: ['jt_gone'] }, 404], [{ discountPercent: 150 }, 400]]],
    ];
    for (const [f, key, look, named, table, qs, body, words, refusals] of creates) {
        // held(n): whether the n-th read of the whole row at its id finds it. The insert writes nothing unless `lands`.
        const run = async (handler, held, { lands = false, sent = body, linked = true } = {}) => {
            let n = 0, wrote = [], answer = null;
            const rows = ({ kind, table: t, fields }) => {
                if (t !== table) return linked || t === 'settings' ? base[t] || [] : [];   // linked: the records it names are the org's
                if (kind === 'select') return !fields && held(n++) ? [row] : [];   // a read naming its columns is the number's or the account's
                return kind === 'insert' && lands ? [{ ...row, name: 'Made', title: 'Made' }] : [];
            };
            await ask(async (e, c) => { answer = await handler(e, c); wrote = globalThis.__gates.ops.filter((x) => x.kind !== 'select').map((x) => `${x.kind} ${x.table}`); return answer; }, f, { method: 'POST', qs, body: sent, rows }, 'Admin');
            return { status: answer.statusCode, body: JSON.parse(answer.body), wrote };
        };
        const src = sourceOf(f), handler = await load(f);
        assert.ok(refusals.length >= 1, `${key}: what a new one would be refused for`);
        // This create's own copy of a line: the customers' file holds the locations' create first.
        const start = src.indexOf(`const landed = await held${look}(orgId, data.id);`);
        assert.ok(start > 0, `REGRESSION: ${key}: the held look`);
        const cut = async (line) => { const i = src.indexOf(line, start); assert.ok(start >= 0 && i > start, `${key}: ${line}`); return loadCut(f, [i, i + line.length]); };
        const early = await run(handler, () => true, { lands: true });
        assert.deepEqual([early.status, early.body.code, early.body.error, early.wrote], [409, 'idInUse', words, []], `REGRESSION: ${key}: a create of an id the org holds wrote, or did not say so`);
        assert.equal(early.body[key]?.id, 'x1');
        assert.equal(early.body[key][named], 'As stored', `REGRESSION: ${key}: the record as stored, never as sent`);
        const unlooked = await cut('if (landed) return landed;'), past = await run(unlooked, () => true, { lands: true });
        assert.deepEqual([past.status, past.wrote[0]], [201, `insert ${table}`], 'shown red: the look left out, the create writes');
        // A link it names that is no record of the org — or a login of no member, a percent out of range — is never asked of a create
        // that landed.
        for (const [bad, status] of refusals) {
            const at = `${key} ${JSON.stringify(bad)}`, gone = await run(handler, () => true, { linked: false, sent: { ...body, ...bad } });
            assert.deepEqual([gone.status, gone.body.code, gone.wrote], [409, 'idInUse', []], `REGRESSION: ${at}: asked before the held look`);
            const red = await run(unlooked, () => true, { linked: false, sent: { ...body, ...bad } });
            assert.deepEqual([red.status, red.body.code], [status, undefined], `shown red: ${at}: refused over a create that landed`);
            const fresh = await run(handler, () => false, { lands: true, linked: false, sent: { ...body, ...bad } });
            assert.deepEqual([fresh.status, fresh.body.field in bad || key === 'location', fresh.wrote], [status, true, []], `REGRESSION: ${at}: a new one is asked, and refused for it, nothing written`);   // a location's refusal names no field
            if (refusals === LINKS) continue;
            // The refusal of §0.291's five, as each writes it: left out, the new one is made.
            const asks = 'userId' in bad ? 'if (login.status) return ' : 'discountPercent' in bad ? 'if (percentRefused(data.discountPercent, null)) return ' : 'if (linked.error) return ';
            const i = src.indexOf(asks, start), end = src.indexOf('};', i) + 2;
            assert.ok(i > start && end > i && !src.slice(i, end).includes('\n'), `${at}: its refusal, after the held look`);
            const unasked = await run(await loadCut(f, [i, end]), () => false, { lands: true, linked: false, sent: { ...body, ...bad } });
            assert.deepEqual([unasked.status, unasked.wrote[0]], [201, `insert ${table}`], `shown red: ${at}: its refusal left out, it is made`);
        }
        // Two at once: none held when asked, the insert wrote nothing, held now — no history, notice or audit after it.
        const beside = await run(handler, (n) => n > 0);
        assert.deepEqual([beside.status, beside.body.code, beside.body[key]?.id, beside.wrote], [409, 'idInUse', 'x1', [`insert ${table}`]], `REGRESSION: ${key}: the same create pressed twice at once`);
        const alone = await run(await cut('if (beside) return beside;'), (n) => n > 0);
        assert.deepEqual([alone.status, alone.body], [409, { error: words }], 'shown red: the second look left out, the words with no record');
        // Another org's id: held by no row of this org, then or after — the words alone, and nothing after the insert.
        const other = await run(handler, () => false);
        assert.deepEqual([other.status, other.body, other.wrote], [409, { error: words }, [`insert ${table}`]], `REGRESSION: ${key}: another org's id`);
        const on = await run(await cut(`if (!${key === 'job' ? 'written' : 'inserted'}) return { statusCode: 409, headers, body: JSON.stringify({ error: '${words}' }) };`), () => false);
        assert.notDeepEqual([on.status, on.body, on.wrote], [other.status, other.body, other.wrote], 'shown red: the refusal left out, the create goes on');
        // One that lands: the row made, audited as a create.
        const made = await run(handler, () => false, { lands: true });
        assert.deepEqual([made.status, made.body.code, made.wrote[0]], [201, undefined, `insert ${table}`]);
        assert.ok(made.wrote.includes('insert audit_log'), `${key}: ${made.wrote}`);
        // A technician's record names its login's member by their app id, what the screen's picker holds: read in the held look, each
        // time, as a create's answer reads it.
        if (key === 'technician') {
            assert.ok(src.includes('const [member] = await db.select({ id: users.id }).from(users).where(and(eq(users.orgId, orgId), eq(users.clerkUserId, login)));'), "REGRESSION: a login's member read out of its org");
            assert.deepEqual([early.body[key].memberId, beside.body[key].memberId, early.body[key].userId], ['usr_ana', 'usr_ana', 'user_ana'], 'REGRESSION: a technician answered with no member of its login');
            const line = ' ? await memberIdOf(orgId, held.userId) : null;', i = src.indexOf(line);
            assert.ok(i > 0 && src.indexOf(line, i + 1) < 0, 'the member of the login held');
            const unnamed = await run(await loadCut(f, [i, i + line.length]), () => true);
            assert.notEqual(unnamed.body[key]?.memberId, 'usr_ana', 'shown red: the member unread');
            const none = await run(handler, () => true, { linked: false });   // its login no member of this org
            assert.deepEqual([none.status, none.body[key].memberId], [409, null]);
        } else assert.equal('memberId' in early.body[key], false, `${key}: no login`);
    }
    // The look and the insert as written: by id AND org, awaited before the insert and after; the insert gives way on its id
    // alone; none of the eight creates is an upsert again, and each is audited as a create. Moved in §0.291: five more creates, a technician's look
    // reading its login's member between.
    const tables = { Job: 'dispatchJobs', Customer: 'dispatchCustomers', Location: 'dispatchServiceLocations', Technician: 'dispatchTechnicians', Vehicle: 'dispatchVehicles', Equipment: 'dispatchEquipment', Block: 'dispatchScheduleBlocks', Plan: 'dispatchServicePlans' };
    assert.deepEqual(creates.map(([, , look]) => look).sort(), Object.keys(tables).sort(), 'every create run here is read here');
    for (const [f, , key] of creates) {
        const table = tables[key], src = sourceOf(f).split('\r\n').join('\n'), times = (x) => src.split(x).length - 1;
        const member = key === 'Technician' ? '    const memberId = held ? await memberIdOf(orgId, held.userId) : null;\n' : '';
        assert.equal(times(`await db.select().from(${table}).where(and(eq(${table}.id, id), eq(${table}.orgId, orgId)));\n${member}    return held ? { statusCode: 409,`), 1, `REGRESSION: ${key}: the held look in its org`);
        assert.equal(['userId', 'auth.userId'].reduce((n, who) => n + times(`await auditAs(orgId, ${who}, { action: 'dispatch_${key.toLowerCase()}.created', `), 0), 1, `REGRESSION: ${key}: a create audited as anything else`);
        assert.equal(times(`= await held${key}(orgId, data.id);`), 2, `REGRESSION: ${key}: asked before and after its insert, awaited`);
        assert.equal(times(`.onConflictDoNothing({ target: ${table}.id }).returning();`), 1, `REGRESSION: ${key}: its insert`);
        assert.equal(times(`.onConflictDoUpdate({ target: ${table}.id`), 0, `REGRESSION: ${key}: an upsert`);
        assert.equal(src.split(/\s+/).join(' ').includes(`.onConflictDoUpdate({ target: ${table}.id`), false, `REGRESSION: ${key}: an upsert, over lines`);
    }
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
