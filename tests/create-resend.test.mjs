// tests/create-resend.test.mjs — §0.290 (OPEN_ITEMS §4.8, §0.289's found (1); Jeff, 23 Nov: "Fix New Job resend"): a
// Dispatch create sent again with its id wrote the create's values over the record an earlier press had made — another
// member's schedule, plan or gate code set in between with them (an upsert of the whole row). The server's three POSTs
// are creates now: an id this org holds is answered 409 'idInUse' with the row as stored, nothing written, and the screen
// takes that row (src/utils/createResend.js).
//   C1-C7   heldCreate and overStored, every shape;
//   V1-V11  the customer form (CustomersView) — its state, its effects, its guarded and its save, as they stand in the
//           source, run over a few lines of hooks with the real helpers and the parent's real list code;
//   G1-G3   THE GUARD over netlify/functions: each held read by id and org, asked before any link and again after an
//           insert that wrote nothing; the insert on its id alone; and the three creates' own blocks, RUN.
// New Job's and the Jobs editor's own steps: their own suites; the database's half: tests/integration/dispatch-create.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';
import { heldCreate, overStored } from '../src/utils/createResend.js';
import { writeRefusalOf, refusalError, alreadySaid, unknownOf, thrownSaid, maybeSaid } from '../src/utils/refusalWords.js';
import { defaultWorkWeek } from '../src/utils/workWeek.js';

const ROOT = new URL('../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8').replace(/\r\n/g, '\n');
const parseOf = (src) => parse(src, { sourceType: 'module', plugins: ['jsx'], errorRecovery: false });
const SKIP = new Set(['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments']);
const walk = (node, fn, trail = []) => {
    fn(node, trail);
    for (const k of Object.keys(node)) {
        if (SKIP.has(k)) continue;
        for (const v of Array.isArray(node[k]) ? node[k] : [node[k]]) if (v && typeof v === 'object' && typeof v.type === 'string') walk(v, fn, [node, ...trail]);
    }
};
// The code of a node: its comments out (they hold no strings' ends), its white space one blank.
const codeOf = (src, node) => {
    const drops = [];
    walk(node, (n) => { for (const c of [...(n.leadingComments || []), ...(n.innerComments || []), ...(n.trailingComments || [])]) drops.push([c.start, c.end]); });
    let out = '';
    for (let i = node.start; i < node.end; i++) { const d = drops.find(([a, b]) => i >= a && i < b); if (d) i = d[1] - 1; else out += src[i]; }
    return out.replace(/\s+/g, ' ').trim();
};
const turns = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
const clone = (v) => JSON.parse(JSON.stringify(v));

// ── C: src/utils/createResend.js ──────────────────────────────────────────────────────────────────────────────────

test('C1 — heldCreate: the stored row of the very id sent, on a 409 \'idInUse\' alone', () => {
    const job = { id: 'j1', title: 'Boiler' };
    const body = { error: 'That job id is already in use.', code: 'idInUse', job };
    assert.equal(heldCreate(409, body, 'job', 'j1'), job, 'the row itself');
    assert.equal(heldCreate(409, { ...body, job: undefined, customer: { id: 'c1' } }, 'customer', 'c1').id, 'c1');
    assert.equal(heldCreate(409, { code: 'idInUse', location: { id: 'l1' } }, 'location', 'l1').id, 'l1');
    for (const [status, b, key, id, why] of [
        [200, body, 'job', 'j1', 'landed'], [400, body, 'job', 'j1', 'a 400'], [404, body, 'job', 'j1', 'a 404'], [500, body, 'job', 'j1', 'a 500 proves nothing'],
        ['409', body, 'job', 'j1', 'a status that is text'], [undefined, body, 'job', 'j1', 'no status'],
        [409, { ...body, code: 'stale' }, 'job', 'j1', 'another code'], [409, { ...body, code: 'already' }, 'job', 'j1', 'already: an action\'s'],
        [409, { error: body.error, job }, 'job', 'j1', 'the words alone: another org\'s id'], [409, { error: body.error, code: 'idInUse' }, 'job', 'j1', 'no row'],
        [409, { ...body, job: null }, 'job', 'j1', 'a null row'], [409, { ...body, job: { ...job, id: 'j2' } }, 'job', 'j1', 'a row of another id'],
        [409, { ...body, job: { title: 'Boiler' } }, 'job', 'j1', 'a row with no id'], [409, body, 'customer', 'j1', 'another kind\'s row'],
        [409, { ...body, job: { title: 'x' } }, 'job', undefined, 'no id sent: none is not one'], [409, { ...body, job: { id: '' } }, 'job', '', 'an empty id'],
        [409, { ...body, job: { id: null } }, 'job', null, 'a null id'],
        [409, null, 'job', 'j1', 'a body that was not JSON'], [409, undefined, 'job', 'j1', 'no body'], [409, 'idInUse', 'job', 'j1', 'text'],
    ]) assert.equal(heldCreate(status, b, key, id), null, `REGRESSION — ${why} read as the create that landed`);
});

const over = (typed, stored, sent) => { const r = overStored(typed, stored, sent); return [r.draft, r.mine, r.differs]; };

test('C2 — overStored: standing as typed — none, null, empty, a number and its text are one; nothing differs and the draft is the row stored', () => {
    const stored = { id: 'c1', name: 'Acme', accountId: null, notes: null, creditLimit: '0', qty: 5, doNotService: false, tags: ['a'], customerNumber: 'CUST-0009' };
    const r = overStored({ id: 'c1', _isNew: true, name: 'Acme', accountId: '', notes: undefined, creditLimit: 0, qty: '5', doNotService: false, tags: ['a'], gate: '' }, stored, [{ name: 'Acme' }]);
    assert.deepEqual(r, { draft: stored, mine: [], differs: false });
    assert.notEqual(r.draft, stored, 'a copy: the form never edits the list\'s row');
    assert.deepEqual(over({ name: 'Acme' }, stored), [stored, [], false], 'no bodies named');
    assert.deepEqual(over(null, stored, []), [stored, [], false], 'no form');
    assert.deepEqual(over(undefined, stored, [{ name: 'x' }]), [stored, [], false]);
});

test('C3 — overStored: false, 0 and a list are values — none of them is none, and a list counts its order', () => {
    const sent = [{ dns: false, qty: 0, tags: [] }];
    assert.deepEqual(over({ dns: true }, { dns: false }, sent), [{ dns: true }, ['dns'], true]);
    assert.deepEqual(over({ dns: false }, { dns: true }, sent), [{ dns: true }, [], true], 'sent false, stored true: another member\'s since');
    assert.deepEqual(over({ dns: false }, { dns: null }, [{ dns: true }]), [{ dns: false }, ['dns'], true], 'false is not none');
    assert.deepEqual(over({ qty: 0 }, { qty: null }, [{ qty: 3 }]), [{ qty: 0 }, ['qty'], true], '0 is not none');
    assert.deepEqual(over({ tags: [] }, { tags: null }, [{ tags: ['a'] }]), [{ tags: [] }, ['tags'], true], 'an empty list is not none');
    assert.deepEqual(over({ tags: ['a', 'b'] }, { tags: ['b', 'a'] }, [{ tags: ['b', 'a'] }]), [{ tags: ['a', 'b'] }, ['tags'], true], 'the order counts');
    assert.deepEqual(over({ o: { a: 1 } }, { o: { a: 1 } }, [{}]), [{ o: { a: 1 } }, [], false], 'two objects that say the same');
    assert.deepEqual(over({ name: '' }, { name: 'Acme' }, [{ name: 'Acme' }]), [{ name: '' }, ['name'], true], 'cleared since: the member\'s change, kept as cleared');
    assert.deepEqual(over({ name: null }, { name: 'Acme' }, [{ name: '' }]), [{ name: 'Acme' }, [], true], 'sent empty and still empty: the stored one is another\'s');
});

test('C4 — overStored: one unproven body — typed since is the member\'s; as sent, stored otherwise, is the server\'s or another member\'s', () => {
    const sent = [{ name: 'Acme', notes: 'one', plan: 'p1', link: 'acc_gone' }];
    const stored = { id: 'c1', name: 'Acme', notes: 'one', plan: 'p2', link: null, gate: '1234' };
    assert.deepEqual(over({ name: 'Acme', notes: 'two', plan: 'p1', link: 'acc_gone' }, stored, sent),
        [{ ...stored, notes: 'two' }, ['notes'], true], 'the note typed since over the row; the plan given by another member and the link the server cleared as stored');
    assert.deepEqual(over({ name: 'Acme', notes: 'one', plan: 'p1', link: 'acc_gone' }, stored, sent), [stored, [], true], 'nothing typed since: differs, and nothing is the member\'s');
    // Both changed it: what the member typed since is shown, to save knowingly.
    assert.deepEqual(over({ plan: 'p3' }, stored, sent), [{ ...stored, plan: 'p3' }, ['plan'], true]);
    // A link the server stored in its own form.
    assert.deepEqual(over({ link: 'Acme Co' }, { link: 'acc_1' }, [{ link: 'Acme Co' }]), [{ link: 'acc_1' }, [], true]);
    // A field the body left out was sent as none.
    assert.deepEqual(over({ notes: 'new' }, { notes: null }, [{ name: 'Acme' }]), [{ notes: 'new' }, ['notes'], true], 'left out, stored none: typed since');
    assert.deepEqual(over({ notes: '' }, { notes: 'theirs' }, [{ name: 'Acme' }]), [{ notes: 'theirs' }, [], true], 'left out and none still: the stored one is another\'s');
    assert.deepEqual(over({ notes: 'new' }, {}, [{}]), [{ notes: 'new' }, ['notes'], true], 'a key the row does not hold');
});

test('C5 — overStored: two unproven bodies — any may be the one stored, so a change carried by the second press is still the member\'s over the first; A, B, A', () => {
    const A = { notes: 'A' }, B = { notes: 'B' };
    assert.deepEqual(over(B, { notes: 'A' }, [A, B]), [{ notes: 'B' }, ['notes'], true], 'the first was the one stored: the second wrote nothing');
    assert.deepEqual(over(B, { notes: 'A' }, [B, A]), [{ notes: 'B' }, ['notes'], true], 'in any order');
    assert.deepEqual(over(B, { notes: 'B' }, [A, B]), [{ notes: 'B' }, [], false], 'the second was: nothing differs');
    assert.deepEqual(over(A, { notes: 'B' }, [A, B]), [{ notes: 'A' }, ['notes'], true], 'A, B, A: typed back since the one stored');
    assert.deepEqual(over(A, { notes: 'A' }, [A, B]), [{ notes: 'A' }, [], false], 'A, B, A with A stored');
    assert.deepEqual(over({ notes: 'C' }, { notes: 'A' }, [A, B]), [{ notes: 'C' }, ['notes'], true]);
    assert.deepEqual(over(B, { notes: 'theirs' }, [A, B]), [{ notes: 'theirs' }, [], true], 'what another member wrote over either stands');
    assert.deepEqual(over({ notes: 'C' }, { notes: 'theirs' }, [A, B]), [{ notes: 'C' }, ['notes'], true], 'no body held it: typed since');
    assert.deepEqual(over({ notes: 'B', plan: 'p1' }, { notes: 'A', plan: 'p9' }, [{ ...A, plan: 'p1' }, { ...B, plan: 'p1' }]),
        [{ notes: 'B', plan: 'p9' }, ['notes'], true], 'field by field');
});

test('C6 — overStored: no body sent proves nothing the member\'s; the id and the form\'s own keys never counted', () => {
    assert.deepEqual(over({ notes: 'mine' }, { notes: 'theirs' }, []), [{ notes: 'theirs' }, [], true]);
    assert.deepEqual(over({ notes: 'mine' }, { notes: 'theirs' }), [{ notes: 'theirs' }, [], true], 'left out');
    const r = overStored({ id: 'other', _isNew: true, _why: 'x', name: 'Acme' }, { id: 'c1', name: 'Acme' }, [{ id: 'third', _isNew: false }]);
    assert.deepEqual(r, { draft: { id: 'c1', name: 'Acme' }, mine: [], differs: false }, 'never another id, and no longer a new record\'s form');
    assert.deepEqual(over({ a: 1 }, { a: 2 }, [null, undefined]), [{ a: 1 }, ['a'], true], 'a body that is none was sent with nothing');
});

test('C7 — overStored hands back copies: neither the row, the form nor the bodies are touched', () => {
    const typed = Object.freeze({ notes: 'B', tags: Object.freeze(['t']) }), stored = Object.freeze({ id: 'c1', notes: 'A' }), sent = Object.freeze([Object.freeze({ notes: 'A' })]);
    const r = overStored(typed, stored, sent);
    assert.deepEqual(r.draft, { id: 'c1', notes: 'B', tags: ['t'] });
    assert.deepEqual([stored, typed.notes, sent[0]], [{ id: 'c1', notes: 'A' }, 'B', { notes: 'A' }]);
});

// ── V: the customer form, as it stands in the source ──────────────────────────────────────────────────────────────

const DISPATCH = read('src/Tabs/DispatchTab.jsx');
const DISPATCH_AST = parseOf(DISPATCH);
const constOf = (ast, name) => {
    const found = ast.program.body.map((n) => (n.type === 'ExportNamedDeclaration' ? n.declaration : n))
        .filter((n) => n?.type === 'VariableDeclaration' && n.declarations[0].id.name === name);
    assert.equal(found.length, 1, `one ${name} in the source`);
    return found[0].declarations[0].init;
};
const VIEW = constOf(DISPATCH_AST, 'CustomersView');
const textOf = (n) => DISPATCH.slice(n.start, n.end);
// The view's body to the end of its save: its state, its list, its effects, guarded, startNew and save.
const VIEW_FN = (() => {
    const body = VIEW.body.body;
    const at = body.findIndex((n) => n.type === 'VariableDeclaration' && n.declarations[0].id.name === 'save');
    assert.ok(at > 0, 'the view holds its save');
    return `return (${textOf(VIEW.params[0])}) => {\n${DISPATCH.slice(body[0].start, body[at].end)}\n`
        + 'return { query, selectedId, draft, editing, saving, status, list, selected, creating, set, guarded, startNew, save, setQuery, setSelectedId, setDraft, setEditing, adopting, unproven, savingRef, shownRef };\n};';
})();
const literalOf = (name) => { const n = constOf(DISPATCH_AST, name); assert.equal(n.type, 'StringLiteral'); return n.value; };
const UNSAVED = literalOf('UNSAVED_MSG');
const draftIsDirty = new Function('defaultWorkWeek', `return ${textOf(constOf(DISPATCH_AST, 'draftIsDirty'))};`)(defaultWorkWeek);
// What DispatchTab hands the view: its list code and its banner.
const VIEW_PROPS = (() => {
    const uses = [];
    walk(DISPATCH_AST.program, (n) => { if (n.type === 'JSXOpeningElement' && n.name.name === 'CustomersView') uses.push(n); });
    assert.equal(uses.length, 1, 'CustomersView drawn once');
    return Object.fromEntries(uses[0].attributes.map((a) => [a.name.name, a.value?.expression]));
})();
const parentOnSaved = (setCustomers) => new Function('setCustomers', `return ${textOf(VIEW_PROPS.onSaved)};`)(setCustomers);
const parentOnSaid = (setCreateSaid) => new Function('setCreateSaid', `return ${textOf(VIEW_PROPS.onSaid)};`)(setCreateSaid);

const answerOf = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => (body === undefined ? JSON.parse('<html>') : clone(body)) });
const inUse = (customer) => answerOf(409, { error: 'That customer id is already in use.', code: 'idInUse', customer });
const FAILED = () => answerOf(500, { error: 'Internal server error', requestId: 'r1' });

// The view mounted: hooks in order, a set re-renders in a microtask (a batch, as React draws it), effects run after the
// draw on changed deps; each request held until its answer is given.
const mountView = ({ customers = [], confirms = true } = {}) => {
    const did = { sent: [], said: [], saved: [], asked: [] };
    const org = { now: 'org_a' };
    const props = { customers: clone(customers), accounts: [], techs: [], jobs: [], plans: [], planVisits: [], propertyTypes: [] };
    const slots = [];
    let at = 0, dirty = false, mounted = true, view = null, effects = [], waiting = null;
    const redraw = () => { if (!dirty) { dirty = true; queueMicrotask(draw); } };
    const changed = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
    const React = {
        useState: (init) => {
            const i = at++;
            if (!slots[i]) slots[i] = { v: typeof init === 'function' ? init() : init, set: (v) => {
                const next = typeof v === 'function' ? v(slots[i].v) : v;
                if (!mounted || Object.is(next, slots[i].v)) return;
                slots[i].v = next; redraw();
            } };
            return [slots[i].v, slots[i].set];
        },
        useRef: (init) => { const i = at++; return slots[i] || (slots[i] = { current: init }); },
        useMemo: (make, deps) => { const i = at++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { v: make(), deps }; return slots[i].v; },
        useEffect: (run, deps) => { const i = at++; if (!slots[i] || changed(slots[i].deps, deps)) { const was = slots[i]; slots[i] = { deps, cleanup: null }; effects.push(() => { was?.cleanup?.(); slots[i].cleanup = run() || null; }); } },
    };
    const env = {
        React, useRef: React.useRef, useState: React.useState, useEffect: React.useEffect, useMemo: React.useMemo,
        ymd: () => '2026-11-23', custStats: () => ({ upcoming: 0, completed: 0 }), planVisitState: () => ({}), planPresentation: () => ({}),
        presentationFor: () => null, daysBetween: () => 0, activityBucket: () => 'never', annualPlanValue: () => 0,
        draftIsDirty, UNSAVED_MSG: UNSAVED,
        dbFetch: (url, init) => { did.sent.push([init.method, url, JSON.parse(init.body)]); return new Promise((res, rej) => { waiting = { res, rej }; }); },
        requestOrg: () => org.now, stillOrg: (asked) => asked === org.now,
        writeRefusalOf, refusalError, alreadySaid, unknownOf, thrownSaid, heldCreate, overStored,
    };
    const component = new Function(...Object.keys(env), VIEW_FN)(...Object.values(env));
    const setCustomers = (fn) => { props.customers = fn(props.customers); redraw(); };
    const inner = parentOnSaved(setCustomers);
    props.onSaved = (c) => { did.saved.push(c); inner(c); };
    props.onSaid = parentOnSaid((v) => did.said.push(v));
    props.confirmDiscard = confirms ? (msg, action) => did.asked.push([msg, action]) : undefined;
    function draw() {
        dirty = false;
        if (!mounted) return;
        at = 0; effects = [];
        view = component(props);
        for (const run of effects) run();
    }
    draw();
    const settle = () => turns(4);
    return {
        did, org, props, get v() { return view; }, settle,
        // The answer out, with what happens while it is.
        answer: async (a) => { const w = waiting; waiting = null; assert.ok(w, 'a request is out'); if (a instanceof Error) w.rej(a); else w.res(a); await settle(); },
        press: async () => { view.save(); await settle(); },
        type: async (k, val) => { view.set(k, val); await settle(); },
        unmount: () => { mounted = false; for (const s of slots) s.cleanup?.(); },
    };
};
// A new customer's form, named and sent once with an answer that proved nothing.
const pressedOnce = async (opts, fields = { name: 'Acme', notes: 'one' }) => {
    const m = mountView(opts);
    await m.settle();
    m.v.startNew();
    await m.settle();
    for (const [k, val] of Object.entries(fields)) await m.type(k, val);
    await m.press();
    await m.answer(FAILED());
    return m;
};
const EDIT_WORDS = 'The customer was already created by an earlier press. What you changed since is in the form, not saved yet — Save to keep it.';
const GONE_WORDS = 'The customer was already created by an earlier press. What you changed since was not saved — open the customer to change it.';

// The customer as the server stores a body and answers it: the create's own row builder and the answer's own builder.
const CUSTOMERS = read('netlify/functions/dispatch-customers.mjs');
const JOBS = read('netlify/functions/dispatch-jobs.mjs');
const fnNode = (src, ast, name) => {
    const all = ast.program.body.filter((n) => n.type === 'FunctionDeclaration' && n.id.name === name);
    assert.equal(all.length, 1, `one ${name}`);
    return all[0];
};
const CUSTOMERS_AST = parseOf(CUSTOMERS);
const JOBS_AST = parseOf(JOBS);
const storedAs = (() => {
    let build = null;
    walk(CUSTOMERS_AST.program, (n) => { if (n.type === 'VariableDeclarator' && n.id.name === 'buildRow') { assert.equal(build, null, 'one buildRow'); build = n.init; } });
    const norm = fnNode(CUSTOMERS, CUSTOMERS_AST, 'normaliseCust');
    return (data) => clone(new Function('data', 'orgId', `${CUSTOMERS.slice(norm.start, norm.end)}\nreturn normaliseCust((${CUSTOMERS.slice(build.start, build.end)})('CUST-0007'));`)(clone(data), 'org_a'));
})();

test('V1 — landed: the customer as stored joins the list, selected, the form closed, "Saved."; an answer that cannot be read keeps the copy sent — RUN', async () => {
    for (const unreadable of [false, true]) {
        const m = mountView();
        await m.settle();
        m.v.startNew();
        await m.settle();
        const id = m.v.draft.id;
        await m.type('name', '  Acme ');
        await m.press();
        const [method, url, body] = m.did.sent[0];
        assert.deepEqual([method, url, body.id, body.name, body.accountId, body.servicePlanId, body.preferredTechId, body.planStartDate, '_isNew' in body],
            ['POST', '/.netlify/functions/dispatch-customers', id, 'Acme', null, null, null, null, false]);
        const stored = storedAs(body);
        await m.answer(unreadable ? answerOf(201, undefined) : answerOf(201, { customer: stored }));
        assert.deepEqual(m.did.saved, [unreadable ? body : stored]);
        assert.deepEqual([m.props.customers.map((c) => c.id), m.v.draft, m.v.editing, m.v.selectedId, m.v.saving, m.v.status], [[id], null, false, id, false, { kind: 'ok', msg: 'Saved.' }]);
        assert.deepEqual([m.did.said, m.v.unproven.current], [[], {}]);
    }
});

test('V2 — an answer that proves nothing keeps the form, its id and the body sent; the next press sends the same id — RUN', async () => {
    for (const [answer, words] of [[FAILED(), 'Internal server error (ref r1)'], [answerOf(502, undefined), 'The server returned 502.'],
        [answerOf(409, undefined), 'The server returned 409.'], [new TypeError('Failed to fetch'), 'The server could not be reached.']]) {
        const m = mountView();
        await m.settle();
        m.v.startNew();
        await m.settle();
        await m.type('name', 'Acme');
        await m.press();
        await m.answer(answer);
        const id = m.v.draft.id;
        assert.deepEqual(m.v.status, { kind: 'err', msg: maybeSaid('The customer', 'saved', words) });
        assert.deepEqual([m.v.draft._isNew, m.v.editing, m.v.saving, m.v.savingRef.current, m.did.saved, m.props.customers], [true, true, false, false, [], []]);
        assert.deepEqual(m.v.unproven.current, { [id]: [m.did.sent[0][2]] }, 'the body as sent is held');
        await m.press();
        assert.deepEqual([m.did.sent[1][0], m.did.sent[1][2].id], ['POST', id], 'the same create again');
        // …which lands: the customer as stored, and no body held for an id that is done.
        await m.answer(answerOf(201, { customer: storedAs(m.did.sent[1][2]) }));
        assert.deepEqual([m.props.customers.length, m.v.draft, m.v.status, m.v.unproven.current], [1, null, { kind: 'ok', msg: 'Saved.' }, {}]);
    }
});

test('V3 — the server\'s own refusal is no unproven body: a 403 the role\'s sentence, a 400 and a 409 without the row its words; the form kept — RUN', async () => {
    for (const [answer, words] of [
        [answerOf(403, { error: 'Forbidden' }), 'Your role cannot change customers.'],
        [answerOf(400, { error: 'id and name required' }), 'id and name required'],
        [answerOf(409, { error: 'Acme is already in Dispatch.', field: 'accountId' }), 'Acme is already in Dispatch.'],
        [answerOf(409, { error: 'That customer id is already in use.' }), 'That customer id is already in use.'],           // another org's id
        [answerOf(409, { error: 'That customer id is already in use.', code: 'idInUse' }), 'That customer id is already in use.'],   // no row
        [answerOf(409, { error: 'That customer id is already in use.', code: 'idInUse', customer: { id: 'cust_other', name: 'Theirs' } }), 'That customer id is already in use.'],
    ]) {
        const m = mountView();
        await m.settle();
        m.v.startNew();
        await m.settle();
        await m.type('name', 'Acme');
        await m.press();
        await m.answer(answer);
        assert.deepEqual([m.v.status, m.did.saved, m.did.said, m.props.customers], [{ kind: 'err', msg: words }, [], [], []], `REGRESSION — ${words}`);
        assert.deepEqual([m.v.draft.name, m.v.draft._isNew, m.v.editing, m.v.saving, m.v.savingRef.current, m.v.unproven.current], ['Acme', true, true, false, false, {}]);
    }
    // After one that proved nothing: what it held is kept for the press after (the first press may have landed).
    const m = await pressedOnce();
    const id = m.v.draft.id;
    await m.press();
    await m.answer(answerOf(403, { error: 'Forbidden' }));
    assert.equal(m.v.unproven.current[id].length, 1);
});

test('V4 — held, untouched since and standing as sent: this press\'s customer — listed as stored once, closed, "Saved.", nothing said — RUN', async () => {
    // The whole new-customer form, as the server's own builders store and answer it: no default reads as a change.
    const m = await pressedOnce();
    const body = m.did.sent[0][2];
    const stored = storedAs(body);
    assert.deepEqual(overStored(body, stored, [body]), { draft: stored, mine: [], differs: false }, 'PARITY: the row a create stores is the form that sent it');
    await m.press();
    assert.deepEqual(m.did.sent[1], m.did.sent[0], 'the same create');
    await m.answer(inUse(stored));
    assert.deepEqual([m.did.saved, m.props.customers, m.v.draft, m.v.editing, m.v.selectedId], [[stored], [stored], null, false, body.id]);
    assert.deepEqual([m.v.status, m.did.said, m.v.saving, m.v.savingRef.current, m.v.unproven.current], [{ kind: 'ok', msg: 'Saved.' }, [], false, false, {}]);
    assert.equal(m.did.sent.length, 2, 'nothing written over it');
});

test('V5 — held, standing otherwise and nothing typed since: the row as stored, the form closed, said above every view — RUN', async () => {
    const m = await pressedOnce();
    const body = m.did.sent[0][2];
    const stored = { ...storedAs(body), notes: 'their note', doNotService: true, gateCode: '1234' };   // another member's since
    await m.press();
    await m.answer(inUse(stored));
    assert.deepEqual([m.did.saved, m.props.customers, m.v.draft, m.v.editing, m.v.selectedId], [[stored], [stored], null, false, body.id]);
    assert.deepEqual(m.did.said, [{ text: alreadySaid('The customer', 'created') }]);
    assert.deepEqual([m.v.status, m.v.unproven.current, m.did.sent.length], [{ kind: 'ok', msg: 'Saved.' }, {}, 2]);
});

test('V6 — held, typed since: the form is an edit of the customer as stored with what was typed over it, said, nothing written; its Save is a PUT — RUN', async () => {
    const other = { id: 'cust_0', name: 'Zed', notes: 'zed\'s' };
    const m = await pressedOnce({ customers: [other] });
    const body = m.did.sent[0][2];
    const id = body.id;
    const stored = { ...storedAs(body), serviceCity: 'Reno', doNotService: true };   // another member's since
    await m.type('notes', 'two');
    await m.press();
    // Typed while the answer is out: kept too.
    await m.type('contactName', 'Ann');
    await m.answer(inUse(stored));
    assert.deepEqual([m.did.saved, m.props.customers], [[stored], [other, stored]], 'the row as stored joins the list');
    assert.deepEqual(m.v.draft, { ...stored, notes: 'two', contactName: 'Ann' }, 'the row as stored, what was typed since over it — never a blank over another member\'s');
    assert.deepEqual([m.v.creating, m.v.editing, m.v.selectedId, m.v.selected.id, m.v.saving, m.v.savingRef.current], [false, true, id, id, false, false]);
    assert.deepEqual(m.v.status, { kind: 'err', msg: EDIT_WORDS });
    assert.deepEqual([m.did.said, m.v.unproven.current, m.v.adopting.current, m.did.sent.length], [[], {}, null, 2], 'nothing written by itself');
    // Its Save: an edit of that customer, with what both hold.
    await m.press();
    const [method, url, put] = m.did.sent[2];
    assert.deepEqual([method, url], ['PUT', '/.netlify/functions/dispatch-customers?id=' + encodeURIComponent(id)]);
    assert.deepEqual([put.notes, put.contactName, put.serviceCity, put.doNotService, put.customerNumber], ['two', 'Ann', 'Reno', true, 'CUST-0007']);
    const after = { ...stored, notes: 'two', contactName: 'Ann' };
    await m.answer(answerOf(200, { customer: after }));
    assert.deepEqual([m.props.customers, m.v.draft, m.v.editing, m.v.status], [[other, after], null, false, { kind: 'ok', msg: 'Saved.' }], 'the one row, never a second');
    // …and a PUT\'s refusal is an edit's: a 409 'idInUse' of a PUT is no create that landed.
    const e = mountView({ customers: [stored] });
    await e.settle();
    e.v.setEditing(true);
    await e.settle();
    await e.type('notes', 'three');
    await e.press();
    await e.answer(inUse(stored));
    assert.deepEqual([e.did.sent[0][0], e.v.status, e.did.saved, e.v.draft.notes], ['PUT', { kind: 'err', msg: 'That customer id is already in use.' }, [], 'three']);
    // …and a PUT whose answer proved nothing is no unproven create.
    await e.press();
    await e.answer(FAILED());
    assert.deepEqual(e.v.unproven.current, {});
});

test('V6b — a name typed with a stray space is the name sent: another rename stands in the form, never the spaced one over it — RUN', async () => {
    const m = await pressedOnce({}, { name: ' Acme ', notes: 'one' });
    const body = m.did.sent[0][2];
    assert.equal(body.name, 'Acme');
    await m.type('notes', 'two');
    await m.press();
    await m.answer(inUse({ ...storedAs(body), name: 'Acme Inc' }));
    assert.deepEqual([m.v.draft.name, m.v.draft.notes], ['Acme Inc', 'two'], "REGRESSION: the form's untrimmed name read as the member's change — the next Save writes it back over the rename");
});

test('V7 — held after two presses that proved nothing: a change the second carried is still the member\'s over the first; typed back too — RUN', async () => {
    for (const [storedNote, typed, expect] of [['one', 'two', 'two'], ['two', 'one', 'one'], ['two', 'two', null], ['one', 'one', null], ['theirs', 'two', null], ['theirs', 'three', 'three']]) {
        const m = await pressedOnce();
        const stored = { ...storedAs(m.did.sent[0][2]), notes: storedNote };
        await m.type('notes', 'two');
        await m.press();
        await m.answer(FAILED());
        assert.equal(m.v.unproven.current[stored.id].length, 2, 'both bodies held');
        await m.type('notes', typed);
        await m.press();
        await m.answer(inUse(stored));
        if (expect) assert.deepEqual([m.v.draft?.notes, m.v.status?.msg, m.v.editing], [expect, EDIT_WORDS, true], `stored ${storedNote}, typed ${typed}`);
        else assert.deepEqual([m.v.draft, m.v.status, m.did.said.length, m.props.customers[0].notes],
            [null, { kind: 'ok', msg: 'Saved.' }, storedNote === typed ? 0 : 1, storedNote], `stored ${storedNote}, typed ${typed}`);
        assert.equal(m.did.sent.length, 3, 'nothing written by itself');
    }
});

test('V8 — held with the view gone: the row joins the list and the banner says what was not saved; nothing typed since is said only when it stands otherwise — RUN', async () => {
    const run = async (typed, change) => {
        const m = await pressedOnce();
        const stored = { ...storedAs(m.did.sent[0][2]), ...change };
        if (typed) await m.type('notes', typed);
        await m.press();
        m.unmount();
        await m.answer(inUse(stored));
        assert.deepEqual([m.props.customers, m.did.sent.length], [[stored], 2]);
        return m.did.said;
    };
    assert.deepEqual(await run('two', {}), [{ text: GONE_WORDS }]);
    assert.deepEqual(await run('two', { notes: 'theirs' }), [{ text: GONE_WORDS }]);
    assert.deepEqual(await run(null, { notes: 'theirs' }), [{ text: alreadySaid('The customer', 'created') }]);
    assert.deepEqual(await run(null, {}), []);
});

test('V9 — after an org switch the answer changes nothing: held, landed, refused or unreadable — RUN', async () => {
    for (const answerFor of [inUse, (c) => inUse({ ...c, notes: 'theirs' }), (c) => answerOf(201, { customer: c }), () => answerOf(201, undefined), () => answerOf(403, { error: 'Forbidden' })]) {
        for (const typed of [null, 'two']) {
            const m = await pressedOnce();
            const stored = storedAs(m.did.sent[0][2]);
            if (typed) await m.type('notes', typed);
            const draft = m.v.draft;
            await m.press();
            m.org.now = 'org_b';
            await m.answer(answerFor(stored));
            assert.deepEqual([m.did.saved, m.did.said, m.props.customers, m.v.status], [[], [], [], null], 'REGRESSION — an answer from the org left said or written');
            assert.deepEqual([m.v.draft, m.v.editing, m.v.saving, m.v.savingRef.current], [draft, true, false, false], 'the hold let go');
        }
    }
});

test('V10 — the effects: the form taken over keeps what it holds; a filter never moves an edit to another record; a pick loads its record — RUN', async () => {
    const A = { id: 'a', name: 'Alpha', notes: 'A' }, B = { id: 'b', name: 'Beta', notes: 'B' };
    const m = mountView({ customers: [B, A] });
    await m.settle();
    assert.equal(m.v.selectedId, 'a', 'the first of the list as the view opens');
    m.v.setQuery('beta');
    await m.settle();
    assert.equal(m.v.selectedId, 'b', 'no form open: a filter moves the record shown');
    m.v.setEditing(true);
    await m.settle();
    assert.deepEqual(m.v.draft, B, 'the form opens on the record');
    await m.type('notes', 'typed');
    m.v.setQuery('alpha');
    await m.settle();
    assert.deepEqual([m.v.list.map((c) => c.id), m.v.selectedId, m.v.draft.id, m.v.draft.notes], [['a'], 'b', 'b', 'typed'], 'REGRESSION — a filter moved the form to another record');
    m.v.setQuery('nothing');
    await m.settle();
    assert.deepEqual([m.v.list, m.v.selectedId, m.v.draft.notes], [[], 'b', 'typed']);
    // Closed, the filter's own record again.
    m.v.setEditing(false); m.v.setDraft(null); m.v.setQuery('alpha');
    await m.settle();
    assert.equal(m.v.selectedId, 'a');
    // Editing with nothing selected takes the first of the list.
    m.v.setEditing(true); m.v.setSelectedId(null);
    await m.settle();
    assert.deepEqual([m.v.selectedId, m.v.draft.id], ['a', 'a']);
    // A pick while editing loads its record, the status cleared.
    m.v.setQuery(''); m.v.setSelectedId('b');
    await m.settle();
    assert.deepEqual([m.v.draft, m.v.status], [B, null]);
    // A new form is no record's: the list's first never loads over it.
    m.v.guarded(() => {});
    m.v.startNew();
    await m.settle();
    assert.deepEqual([m.v.selectedId, m.v.draft._isNew, m.v.draft.name], [null, true, '']);
    // The take-over holds for its one draw: the pick after it loads the record picked (and back, the one stored).
    const t = await pressedOnce({ customers: [A, B] });
    const stored = storedAs(t.did.sent[0][2]);
    await t.type('notes', 'two');
    await t.press();
    t.v.setQuery('zzz');   // and a filter that hides the one made: the form still holds it
    await t.settle();
    await t.answer(inUse(stored));
    assert.deepEqual([t.v.list, t.v.selectedId, t.v.draft.notes], [[], stored.id, 'two']);
    t.v.setQuery('');
    t.v.setSelectedId('a');
    await t.settle();
    assert.deepEqual([t.v.draft, t.v.adopting.current], [A, null]);
    t.v.setSelectedId(stored.id);
    await t.settle();
    assert.deepEqual(t.v.draft, stored, 'as stored: what was typed was discarded with the move');
});

test('V11 — nothing leaves the form while its Save is out: guarded is held, and a discard answered late does nothing — RUN', async () => {
    const A = { id: 'a', name: 'Alpha' };
    const m = mountView({ customers: [A] });
    await m.settle();
    m.v.startNew();
    await m.settle();
    await m.type('name', 'Acme');
    let moved = 0;
    m.v.guarded(() => { moved += 1; });
    assert.deepEqual([m.did.asked.length, m.did.asked[0][0], moved], [1, UNSAVED, 0], 'typed: asked first');
    const late = m.did.asked[0][1];
    await m.press();
    assert.deepEqual([m.v.saving, m.v.savingRef.current], [true, true]);
    late();
    m.v.guarded(() => { moved += 1; });
    m.v.startNew();
    await m.settle();
    assert.deepEqual([moved, m.did.asked.length, m.v.draft.name], [0, 1, 'Acme'], 'REGRESSION — the form left with its Save out');
    await m.answer(FAILED());
    late();
    assert.equal(moved, 1, 'the answer in: the discard does as it says');
    m.v.guarded(() => { moved += 1; });
    assert.equal(m.did.asked.length, 2, 'and the form asks again');
    // Nothing typed: nothing asked; no dialog to ask with: it goes.
    const clean = mountView({ customers: [A] });
    await clean.settle();
    clean.v.startNew();
    await clean.settle();
    clean.v.guarded(() => { moved += 1; });
    assert.deepEqual([moved, clean.did.asked], [2, []]);
    const bare = mountView({ confirms: false });
    await bare.settle();
    bare.v.startNew();
    await bare.settle();
    await bare.type('name', 'Acme');
    bare.v.guarded(() => { moved += 1; });
    assert.equal(moved, 3);
    // No name: nothing sent, nothing held.
    await bare.type('name', '   ');
    await bare.press();
    assert.deepEqual([bare.did.sent, bare.v.status, bare.v.savingRef.current], [[], { kind: 'err', msg: 'Name is required.' }, false]);
});

// ── G: the three creates ──────────────────────────────────────────────────────────────────────────────────────────

const CREATES = [
    { what: 'job', src: JOBS, ast: JOBS_AST, held: 'heldJob', table: 'dispatchJobs', key: 'job', normalise: 'normaliseJob', made: 'written', links: 'const linked = await checkLinks(JOB_LINKS, data, null, orgId);',
        number: 'await nextJobNumber(orgId)', words: 'That job id is already in use.', first: "await recordStatusChange(orgId, data.id, null, row.status, userId, 'Job created');" },
    { what: 'customer', src: CUSTOMERS, ast: CUSTOMERS_AST, held: 'heldCustomer', table: 'dispatchCustomers', key: 'customer', normalise: 'normaliseCust', made: 'inserted', links: 'const linked = await checkLinks(CUSTOMER_LINKS, data, null, orgId);',
        number: 'await nextCustomerNumber(orgId)', words: 'That customer id is already in use.', first: "await auditAs(orgId, auth.userId, { action: 'dispatch_customer.created'" },
    { what: 'location', src: CUSTOMERS, ast: CUSTOMERS_AST, held: 'heldLocation', table: 'dispatchServiceLocations', key: 'location', normalise: 'normaliseLoc', made: 'inserted',
        links: 'const [ownCust] = await db.select({ id: dispatchCustomers.id }).from(dispatchCustomers) .where(and(eq(dispatchCustomers.id, data.customerId), eq(dispatchCustomers.orgId, orgId)));',
        number: null, words: 'That location id is already in use.', first: "await auditAs(orgId, auth.userId, { action: 'dispatch_location.created'" },
];
const isCall = (n) => n.type === 'CallExpression' || n.type === 'OptionalCallExpression';
const isInsertOf = (n, table) => isCall(n) && n.callee.property?.name === 'insert' && n.arguments[0]?.type === 'Identifier' && n.arguments[0].name === table;
// The chain an insert opens: [name, arguments] outward.
const chainOf = (trail, from) => {
    const out = [];
    let cur = from;
    for (let i = 0; i + 1 < trail.length && trail[i].object === cur && isCall(trail[i + 1]) && trail[i + 1].callee === trail[i]; i += 2) { out.push([trail[i].property.name, trail[i + 1].arguments]); cur = trail[i + 1]; }
    return out;
};
// A create's own block: the POST the table's one insert stands in.
const postOf = (c) => {
    const found = [];
    walk(c.ast.program, (n, trail) => { if (isInsertOf(n, c.table)) found.push([n, trail]); });
    assert.equal(found.length, 1, `${c.what}: one insert of its table in the file`);
    const [node, trail] = found[0];
    const post = trail.find((t) => t.type === 'IfStatement');
    assert.equal(codeOf(c.src, post.test), "event.httpMethod === 'POST'", `${c.what}: the insert stands in its POST`);
    return { node, trail, block: post.consequent };
};

test('G1 — THE GUARD: the functions that answer a held id with its row are these three; each reads by the id AND the org, awaited, and answers only that — RUN', async () => {
    const found = [];
    for (const f of readdirSync(new URL('netlify/functions/', ROOT)).filter((n) => n.endsWith('.mjs')).sort()) {
        const src = read(`netlify/functions/${f}`);
        if (!src.includes("'idInUse'")) continue;
        for (const n of parseOf(src).program.body.map((b) => (b.type === 'ExportNamedDeclaration' && b.declaration ? b.declaration : b))) {
            const name = n.type === 'FunctionDeclaration' ? n.id.name : n.type === 'VariableDeclaration' ? n.declarations[0].id.name : null;
            if (name && name !== 'handler' && codeOf(src, n).includes("'idInUse'")) found.push(`${f} ${name}`);
        }
    }
    assert.deepEqual(found, ['dispatch-customers.mjs heldCustomer', 'dispatch-customers.mjs heldLocation', 'dispatch-jobs.mjs heldJob']);
    for (const c of CREATES) {
        const fn = fnNode(c.src, c.ast, c.held);
        const asked = [];
        const run = (rows) => new Function('db', 'and', 'eq', c.table, 'headers', c.normalise, `${c.src.slice(fn.start, fn.end)}\nreturn ${c.held};`)(
            { select: (...cols) => ({ from: (t) => ({ where: (w) => { asked.push([cols, t.name, w]); return rows instanceof Error ? Promise.reject(rows) : Promise.resolve(rows); } }) }) },
            (...a) => ['and', ...a], (a, b) => [a, b], { name: c.table, id: 'id', orgId: 'org_id' }, { h: 1 }, (r) => ({ ...r, normalised: true }));
        const answer = await run([{ id: 'x1', name: 'Stored' }])('org_a', 'x1');
        assert.deepEqual(asked, [[[], c.table, ['and', ['id', 'x1'], ['org_id', 'org_a']]]], `${c.held}: REGRESSION — read by its id AND its org, whole, once`);
        assert.deepEqual({ ...answer, body: JSON.parse(answer.body) }, { statusCode: 409, headers: { h: 1 },
            body: { error: c.words, code: 'idInUse', [c.key]: { id: 'x1', name: 'Stored', normalised: true } } });
        assert.equal(await run([])('org_a', 'x1'), null, `${c.held}: another org's id, or none — no row, no code`);
        await assert.rejects(run(new Error('read failed'))('org_a', 'x1'), /read failed/, `${c.held}: a failed read is the handler's 500`);
    }
});

test('G2 — THE GUARD: the held id is asked before any link, the insert names its id alone, and a create that wrote nothing is asked again; no upsert of the three left', () => {
    for (const c of CREATES) {
        const { node, trail, block } = postOf(c);
        const code = block.body.map((n) => codeOf(c.src, n));
        const only = (text) => { const hits = code.filter((s) => s === text); assert.equal(hits.length, 1, `${c.what}: one \`${text}\``); return code.indexOf(text); };
        const look = only(`const landed = await ${c.held}(orgId, data.id);`);
        assert.equal(code[look + 1], 'if (landed) return landed;', `${c.what}: REGRESSION — the held row answered at once`);
        const links = only(c.links);
        assert.ok(links > look + 1, `${c.what}: REGRESSION — a link asked before the held id (one deleted since refused a create that landed)`);
        const insertAt = block.body.findIndex((n) => n.start <= node.start && n.end >= node.end);
        assert.ok(insertAt > links, `${c.what}: the links asked before the write`);
        // Nothing written or told before the insert, and the body's own checks before the look.
        for (const s of code.slice(0, insertAt)) assert.ok(!/db\.(insert|update|delete|batch|execute)\(|auditAs\(|notifyCustomer\(|recordStatusChange\(/.test(s), `${c.what}: written before its create: ${s.slice(0, 80)}`);
        assert.equal(code[0], "const data = JSON.parse(event.body || '{}');");
        assert.ok(look >= 2 && code[1].startsWith('if (!data.id ||'), `${c.what}: an id is asked for first`);
        // The insert: on its id alone — a taken number is the retry's, never a create that wrote nothing.
        const chain = chainOf(trail, node);
        assert.deepEqual(chain.map(([n]) => n), ['values', 'onConflictDoNothing', 'returning'], `${c.what}: REGRESSION — the create is an insert, never an upsert`);
        assert.equal(codeOf(c.src, chain[1][1][0]), `{ target: ${c.table}.id }`);
        assert.equal(chain[1][1].length, 1);
        const insertCode = code[insertAt];
        if (c.number) {
            assert.equal(insertCode.split(c.number).length - 1, 1, `${c.what}: its number`);
            assert.ok(insertCode.includes('= await withNumberRetry(async () => {') && trail.some((t) => t.type === 'ArrowFunctionExpression' && codeOf(c.src, t).includes(c.number)),
                `${c.what}: REGRESSION — the number is read inside the retry, fresh at each try`);
        }
        // Nothing written: asked again, then the words alone; only a create that wrote goes on.
        assert.equal(code[insertAt + 1], `if (!${c.made}) { const beside = await ${c.held}(orgId, data.id); if (beside) return beside; }`, `${c.what}: REGRESSION — two pressed at once: the second answered with the row`);
        assert.equal(code[insertAt + 2], `if (!${c.made}) return { statusCode: 409, headers, body: JSON.stringify({ error: '${c.words}' }) };`, `${c.what}: another org's id: the words alone, no code`);
        assert.ok(code[insertAt + 3].startsWith(c.first), `${c.what}: the create told after its refusals`);
        // Two looks and no more, each awaited; no row read before it as the one it replaces.
        const calls = [];
        walk(c.ast.program, (n, t) => { if (isCall(n) && n.callee.name === c.held) calls.push([t[0].type, codeOf(c.src, n), n.start]); });
        assert.deepEqual(calls.map(([p, s]) => [p, s]), Array(2).fill(['AwaitExpression', `${c.held}(orgId, data.id)`]));
        for (const [, , at] of calls) assert.ok(at > block.start && at < block.end, `${c.what}: in its own POST`);
        const all = codeOf(c.src, block);
        assert.ok(!/\bprior[A-Z]\w*/.test(all) && !all.includes(".updated'"), `${c.what}: REGRESSION — the create decided on a row it replaced`);
    }
    // Every write of a new row of the three, over every function: none an upsert (quote-to-job's are its own new ids).
    const inserts = [];
    for (const f of readdirSync(new URL('netlify/functions/', ROOT)).filter((n) => n.endsWith('.mjs')).sort()) {
        const src = read(`netlify/functions/${f}`);
        if (!/\b(dispatchJobs|dispatchCustomers|dispatchServiceLocations)\b/.test(src)) continue;
        walk(parseOf(src).program, (n, trail) => {
            for (const { table } of CREATES) if (isInsertOf(n, table)) inserts.push(`${f} ${table} ${chainOf(trail, n).map(([name]) => name).join('.')}`);
            if (isCall(n) && n.callee.property?.name === 'onConflictDoUpdate') {
                assert.ok(!/\b(dispatchJobs|dispatchCustomers|dispatchServiceLocations)\b/.test(codeOf(src, n.arguments[0])), `${f}: REGRESSION — an upsert of a Dispatch create`);
            }
        });
    }
    assert.deepEqual(inserts.sort(), ['dispatch-customers.mjs dispatchCustomers values.onConflictDoNothing.returning', 'dispatch-customers.mjs dispatchServiceLocations values.onConflictDoNothing.returning',
        'dispatch-jobs.mjs dispatchJobs values.onConflictDoNothing.returning', 'quote-to-job.mjs dispatchCustomers values', 'quote-to-job.mjs dispatchJobs values.returning']);
});

// A create's block, RUN: the held reads its own, the database a script of answers.
const runPost = async (c, { body, heldReads = [], madeRows, linksAnswer = { set: {} }, numberTaken = 0, owner = [{ id: 'cust_1' }] }) => {
    const log = [];
    let held = 0, tries = 0;
    const tables = Object.fromEntries(['dispatchJobs', 'dispatchCustomers', 'dispatchServiceLocations'].map((t) => [t, { name: t, id: `${t}.id`, orgId: `${t}.org_id` }]));
    const db = {
        select: (cols) => ({ from: (t) => ({ where: async (w) => {
            if (!cols && t.name === c.table) { log.push(['held', w]); const r = heldReads[held++]; if (r instanceof Error) throw r; return r ? [r] : []; }
            log.push(['read', t.name, w]);
            return owner;
        } }) }),
        insert: (t) => ({ values: (v) => ({ onConflictDoNothing: (o) => ({ returning: async () => {
            log.push(['insert', t.name, o.target, v]);
            if (tries++ < numberTaken) throw Object.assign(new Error('taken'), { code: '23505' });
            return madeRows === undefined ? [v] : madeRows;
        } }) }) }),
    };
    let n = 0;
    const heldFns = CREATES.filter((x) => x.src === c.src).map((x) => { const f = fnNode(x.src, x.ast, x.held); return x.src.slice(f.start, f.end); }).join('\n');
    const env = {
        event: { httpMethod: 'POST', body: JSON.stringify(body) }, orgId: 'org_a', userId: 'user_1', auth: { userId: 'user_1' }, headers: {}, db, ...tables,
        and: (...a) => ['and', ...a], eq: (a, b) => [a, b], JOB_STATUSES: ['unscheduled', 'scheduled'], JOB_LINKS: 'JOB_LINKS', CUSTOMER_LINKS: 'CUSTOMER_LINKS',
        checkLinks: async (l, d, stored, org) => { log.push(['links', l, stored, org]); return linksAnswer; },
        accountTaken: async (org, acc) => { log.push(['account', acc]); return null; }, takenReply: () => ({ statusCode: 409, taken: true }),
        withNumberRetry: async (attempt) => { for (;;) try { return await attempt(); } catch (e) { if (e.code !== '23505') throw e; } },
        nextJobNumber: async () => `JOB-${++n}`, nextCustomerNumber: async () => `CUST-${++n}`,
        normaliseJob: (r) => ({ ...r, normalised: true }), normaliseCust: (r) => ({ ...r, normalised: true }), normaliseLoc: (r) => ({ ...r, normalised: true }),
        recordStatusChange: async (...a) => { log.push(['history', ...a]); }, notifyCustomer: async (a) => { log.push(['notice', a.before, a.after.id]); },
        getCallerName: async () => 'Jeff', jobAfterNotice: async (org, id, w) => w, auditAs: async (org, by, a) => { log.push(['audit', org, a.action]); },
    };
    const { block } = postOf(c);
    const run = new Function(...Object.keys(env), `${heldFns}\nreturn (async () => ${c.src.slice(block.start, block.end)})();`);
    const answer = await run(...Object.values(env));
    return { log, kinds: log.map(([k]) => k), answer, said: JSON.parse(answer.body || 'null') };
};
const BODIES = {
    job: { id: 'x1', customerId: 'cust_1', title: 'Boiler', status: 'scheduled', accountId: 'acc_1' },
    customer: { id: 'x1', name: 'Acme', accountId: 'acc_1' },
    location: { id: 'x1', customerId: 'cust_1', name: 'Site', address: '1 Main', city: 'Reno' },
};
const FRESH = {
    job: ['held', 'links', 'insert', 'history', 'notice', 'audit'],
    customer: ['held', 'links', 'account', 'insert', 'audit'],
    location: ['held', 'read', 'insert', 'audit'],
};

test('G3 — THE GUARD: the three creates — a fresh id made once; a held one answered with its row, no link asked, nothing written; two at once; another org\'s id the words alone — RUN', async () => {
    for (const c of CREATES) {
        const body = BODIES[c.what];
        const byIdAndOrg = ['held', ['and', [`${c.table}.id`, 'x1'], [`${c.table}.org_id`, 'org_a']]];
        // Fresh.
        const made = await runPost(c, { body });
        assert.deepEqual([made.answer.statusCode, made.kinds], [201, FRESH[c.what]], `${c.what}: fresh`);
        assert.deepEqual(made.log[0], byIdAndOrg);
        assert.deepEqual([made.said[c.key].id, made.said[c.key].orgId, made.said[c.key].normalised], ['x1', 'org_a', true]);
        const insert = made.log.find(([k]) => k === 'insert');
        assert.deepEqual([insert[1], insert[2], insert[3].id, insert[3].orgId], [c.table, `${c.table}.id`, 'x1', 'org_a']);
        assert.deepEqual(made.log.find(([k]) => k === 'audit'), ['audit', 'org_a', `dispatch_${c.what}.created`]);
        if (c.what !== 'location') assert.deepEqual(made.log.find(([k]) => k === 'links'), ['links', c.what === 'job' ? 'JOB_LINKS' : 'CUSTOMER_LINKS', null, 'org_a'], 'every link asked as new');
        if (c.what === 'job') {
            assert.deepEqual(made.log.find(([k]) => k === 'history'), ['history', 'org_a', 'x1', null, 'scheduled', 'user_1', 'Job created']);
            assert.deepEqual(made.log.find(([k]) => k === 'notice'), ['notice', null, 'x1']);
            assert.deepEqual([insert[3].createdBy, insert[3].dispatchedBy], ['user_1', null]);
        }
        // Held: an earlier press landed. Its links are not asked — one deleted since is no refusal of it.
        const stored = { id: 'x1', orgId: 'org_a', name: 'As stored' };
        const again = await runPost(c, { body, heldReads: [stored], linksAnswer: { error: 'No such account.', status: 404, field: 'accountId' }, owner: [] });
        assert.deepEqual([again.answer.statusCode, again.kinds], [409, ['held']], `${c.what}: REGRESSION — written over, or a link asked`);
        assert.deepEqual(again.said, { error: c.words, code: 'idInUse', [c.key]: { ...stored, normalised: true } });
        // Two at once: the insert wrote nothing, the row beside it is the answer.
        const beside = await runPost(c, { body, heldReads: [null, stored], madeRows: [] });
        assert.deepEqual([beside.answer.statusCode, beside.kinds], [409, [...FRESH[c.what].slice(0, FRESH[c.what].indexOf('insert') + 1), 'held']], `${c.what}: no history, notice or audit of a create that wrote nothing`);
        assert.deepEqual(beside.log.at(-1), byIdAndOrg);
        assert.deepEqual([beside.said.code, beside.said[c.key].id], ['idInUse', 'x1']);
        // Another org's id: the words alone.
        const other = await runPost(c, { body, madeRows: [] });
        assert.deepEqual([other.answer.statusCode, other.said, other.kinds.at(-1)], [409, { error: c.words }, 'held']);
        // A failed read is the handler's 500, never an answer with no row.
        await assert.rejects(runPost(c, { body, heldReads: [new Error('read failed')] }), /read failed/);
        await assert.rejects(runPost(c, { body, heldReads: [null, new Error('read failed')], madeRows: [] }), /read failed/);
        // A link refused on a fresh create: nothing written.
        const refused = await runPost(c, { body, linksAnswer: { error: 'No such record.', status: 404, field: 'accountId' }, owner: [] });
        assert.deepEqual([refused.answer.statusCode, refused.kinds.includes('insert'), refused.kinds.includes('audit')], [404, false, false]);
        // A number taken meanwhile: the next one, the create made.
        if (c.number) {
            const taken = await runPost(c, { body, numberTaken: 1 });
            const numbers = taken.log.filter(([k]) => k === 'insert').map((l) => l[3].jobNumber || l[3].customerNumber);
            assert.deepEqual([taken.answer.statusCode, numbers], [201, c.what === 'job' ? ['JOB-1', 'JOB-2'] : ['CUST-1', 'CUST-2']]);
        }
        // No id: refused before anything is read.
        assert.deepEqual([(await runPost(c, { body: { ...body, id: '' } })).kinds], [[]]);
    }
});
