// tests/dispatch-panels.test.mjs — §0.291 (OPEN_ITEMS §4.8, §0.290's found): Settings → Dispatch → Vehicles & equipment,
// the whole panel RUN. Its creates kept their id after an answer that proved nothing and were upserts: pressed again, a
// vehicle's technician or plate, a unit's check-out set by another member in between was written over. The two POSTs are
// creates now — an id this org holds is answered 409 'idInUse' with the record as stored — and the panel takes it.
//   A1-A9  saveVehicle / saveEquipment: the seeded form, the refusals, the unproven answers, the held create;
//   B1-B3  what a press holds: its own card's buttons and rows, never the other card's;
//   C1-C2  deleteVehicle / deleteEquipment: their guards and their answers;
//   D1-D3  load: two reads out at once, the last asked is the one shown;
//   E1-E7  runImport: landed, already in, one id twice, refused, unknown, its words, the org switch.
// The panel as it stands in the source, its JSX made plain calls (compile, below) and drawn over a few lines of hooks,
// with the real helpers; a button is pressed as a browser presses it — never while disabled. A record "as stored" is built
// by the server's own row builder and answer (netlify/functions/dispatch-vehicles.mjs, dispatch-equipment.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
import { heldCreate, overStored, keptSaid } from '../src/utils/createResend.js';
import { readRefusal, failureWords, maybeSaid, writeRefusalOf, refusalError, thrownSaid, unknownOf, alreadySaid } from '../src/utils/refusalWords.js';
import { planImport, importCardShows, IMPORT_UNREAD } from '../src/utils/legacyDispatchImport.js';

const ROOT = new URL('../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8').replace(/\r\n/g, '\n');
const parseOf = (src) => parse(src, { sourceType: 'module', plugins: ['jsx'], errorRecovery: false });
const SKIP = new Set(['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments']);
const kidsOf = (n) => Object.keys(n).filter((k) => !SKIP.has(k)).flatMap((k) => (Array.isArray(n[k]) ? n[k] : [n[k]])).filter((v) => v && typeof v === 'object' && typeof v.type === 'string');
const walk = (n, fn) => { fn(n); for (const k of kidsOf(n)) walk(k, fn); };
const turns = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
const clone = (v) => JSON.parse(JSON.stringify(v));

// ── The source, its JSX as plain calls ────────────────────────────────────────────────────────────────────────────
const isJsx = (n) => n.type === 'JSXElement' || n.type === 'JSXFragment';
const compile = (src, root) => {
    // A node's own text, each outermost JSX node in it made a call.
    const textOf = (node) => {
        const found = [];
        const look = (n) => { if (isJsx(n)) found.push(n); else for (const k of kidsOf(n)) look(k); };
        look(node);
        found.sort((a, b) => a.start - b.start);
        let out = '', at = node.start;
        for (const f of found) { out += src.slice(at, f.start) + callOf(f); at = f.end; }
        return out + src.slice(at, node.end);
    };
    // A text child as JSX reads it: lines trimmed where they break, the blank ones gone, the rest one space apart.
    const wordsOf = (raw) => {
        const lines = raw.split('\n');
        return lines.map((l, i) => l.replace(i > 0 ? /^[ \t]+/ : /^$/, '').replace(i < lines.length - 1 ? /[ \t]+$/ : /^$/, '')).filter(Boolean).join(' ');
    };
    const propOf = (a) => {
        if (a.type === 'JSXSpreadAttribute') return `...(${textOf(a.argument)})`;
        const v = a.value === null ? 'true' : a.value.type === 'StringLiteral' ? JSON.stringify(a.value.value) : `(${textOf(a.value.expression)})`;
        return `${JSON.stringify(a.name.name)}: ${v}`;
    };
    function callOf(el) {
        const name = el.type === 'JSXFragment' ? null : el.openingElement.name.name;
        const type = name === null ? '"#"' : /^[a-z]/.test(name) ? JSON.stringify(name) : name;
        const props = name === null ? [] : el.openingElement.attributes.map(propOf);
        const kids = el.children.map((c) => {
            if (c.type === 'JSXText') { const w = wordsOf(c.value); return w ? JSON.stringify(w) : null; }
            if (c.type === 'JSXExpressionContainer') return c.expression.type === 'JSXEmptyExpression' ? null : `(${textOf(c.expression)})`;
            assert.ok(isJsx(c), `a child the compile reads: ${c.type}`);
            return callOf(c);
        }).filter((c) => c !== null);
        return `h(${[type, `{${props.join(', ')}}`, ...kids].join(', ')})`;
    }
    return textOf(root);
};
const PANEL = read('src/Tabs/settings/dispatch/DispatchVehiclesDetail.jsx');
const PANEL_AST = parseOf(PANEL);
const IMPORTED = PANEL_AST.program.body.filter((n) => n.type === 'ImportDeclaration').flatMap((n) => n.specifiers.map((s) => s.local.name));
const PANEL_CODE = PANEL_AST.program.body.filter((n) => n.type !== 'ImportDeclaration' && n.type !== 'ExportDefaultDeclaration')
    .map((n) => compile(PANEL, n.type === 'ExportNamedDeclaration' ? n.declaration : n)).join('\n');

// ── The server's own rows ─────────────────────────────────────────────────────────────────────────────────────────
const serverOf = (file) => {
    const src = read(file), ast = parseOf(src), rows = [];
    walk(ast.program, (n) => { if (n.type === 'VariableDeclarator' && n.id.name === 'row' && n.init?.type === 'ObjectExpression') rows.push(n.init); });
    assert.equal(rows.length, 1, `${file}: one row built by the create`);
    const norm = ast.program.body.filter((n) => n.type === 'FunctionDeclaration' && n.id.name === 'normalise');
    assert.equal(norm.length, 1, file);
    const build = new Function('data', 'orgId', `${src.slice(norm[0].start, norm[0].end)}\nreturn normalise(${src.slice(rows[0].start, rows[0].end)});`);
    return { stored: (body) => clone(build(clone(body), 'org_a')), columns: rows[0].properties.map((p) => p.key.name) };
};
const V = {
    kind: 'vehicle', card: 'Vehicles', form: 'VehicleForm', list: 'vehicles', key: 'vehicle', url: '/.netlify/functions/dispatch-vehicles', subject: 'The vehicle',
    add: '+ Add vehicle', create: 'Create vehicle', save: 'Save vehicle', title: 'New vehicle', cannot: 'Your role cannot change vehicles.', cannotDelete: 'Your role cannot delete vehicles.',
    server: serverOf('netlify/functions/dispatch-vehicles.mjs'), fill: { Name: 'Van 3' }, changed: ['Licence plate', 'licensePlate'], theirs: { status: 'maintenance', assignedTechId: 'tech_9' },
    held: [[{ assignedTechId: 'tech_1' }, 'Unassign the technician before deleting this vehicle.']],
};
const E = {
    kind: 'equipment', card: 'Equipment', form: 'EquipmentForm', list: 'equipment', key: 'item', url: '/.netlify/functions/dispatch-equipment', subject: 'The equipment',
    add: '+ Add item', create: 'Create item', save: 'Save item', title: 'New equipment item', cannot: 'Your role cannot change equipment.', cannotDelete: 'Your role cannot delete equipment.',
    server: serverOf('netlify/functions/dispatch-equipment.mjs'), fill: { Name: 'Tester #1', Category: 'Tester' }, changed: ['Serial number', 'serialNumber'],
    theirs: { status: 'checked_out', checkedOutToId: 'tech_9', checkedOutJobId: 'job_4' },
    held: [[{ checkedOutToId: 'tech_1' }, 'Check this item in before deleting it.'], [{ checkedOutJobId: 'job_1' }, 'Check this item in before deleting it.'],
        [{ checkedOutToId: 'tech_1', checkedOutJobId: 'job_1' }, 'Check this item in before deleting it.']],
};
const KINDS = [V, E];
const READS = ['/.netlify/functions/dispatch-vehicles', '/.netlify/functions/dispatch-equipment', '/.netlify/functions/dispatch-technicians'];

const answerOf = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => (body === undefined ? JSON.parse('<html>') : clone(body)) });
const inUse = (k, row) => answerOf(409, { error: `That ${k.kind} id is already in use.`, code: 'idInUse', [k.key]: row });
const made = (k, row) => answerOf(201, { [k.key]: row });
const FAILED = () => answerOf(500, { error: 'Internal server error', requestId: 'r1' });
const FAILED_WORDS = 'Internal server error (ref r1)';
const UNSENT = () => new TypeError('Failed to fetch');
// The answers that prove nothing, with their words.
const UNPROVEN = [[FAILED, FAILED_WORDS], [() => answerOf(502, undefined), 'The server returned 502.'], [() => answerOf(409, undefined), 'The server returned 409.'],
    [() => answerOf(403, {}), 'The server returned 403.'], [UNSENT, 'The server could not be reached.']];

// ── The panel mounted ─────────────────────────────────────────────────────────────────────────────────────────────
const h = (type, props, ...kids) => ({ type, props, kids });
const text = (n) => (n === null || typeof n !== 'object' ? String(n ?? '') : Array.isArray(n) ? n.map(text).join('') : text(n.kids));
const all = (n, is, out = []) => { if (Array.isArray(n)) n.forEach((k) => all(k, is, out)); else if (n && typeof n === 'object') { if (is(n)) out.push(n); all(n.kids, is, out); } return out; };
// The tree as drawn: each component called with its props, its own element kept around what it drew.
const expand = (n) => {
    if (Array.isArray(n)) return n.flatMap((k) => expand(k) ?? []);
    if (n === null || n === undefined || typeof n === 'boolean') return null;
    if (typeof n !== 'object') return [n];
    if (typeof n.type === 'function') return [{ type: n.type.name, props: n.props, kids: expand([n.type({ ...n.props, children: n.kids })]) }];
    const kids = n.type === 'SPTable' ? n.props.rows.map((r) => ({ type: 'row', props: {}, kids: n.props.columns.map((c) => ({ type: 'cell', props: { col: c.key }, kids: expand([r[c.key]]) })) }))
        : expand(n.type === 'CategoryDetailChrome' ? [n.props.rightActions, ...n.kids] : n.kids);
    return [{ type: n.type, props: n.props, kids }];
};

const mount = async ({ vehicles = [], equipment = [], technicians = [], settings, reads } = {}) => {
    const tables = { vehicles: clone(vehicles), equipment: clone(equipment), technicians: clone(technicians) };
    const did = { sent: [], reads: 0, dirty: [] };
    const org = { now: 'org_a' };
    const slots = [], refs = [], out = [], heldReads = [];
    let at = 0, dirty = false, drawn = null, effects = [], holding = false;
    // What a read is answered: the tables as they stand, or `reads(url)`'s own answer.
    const readAnswer = (url) => { const a = m.reads?.(url); if (a) return a; const list = url.split('dispatch-')[1]; return answerOf(200, { [list]: tables[list] }); };
    const changed = (a, b) => !a || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
    const useState = (init) => {
        const i = at++;
        if (!slots[i]) slots[i] = { v: init, set: (v) => { const next = typeof v === 'function' ? v(slots[i].v) : v; if (Object.is(next, slots[i].v)) return; slots[i].v = next; if (!dirty) { dirty = true; queueMicrotask(draw); } } };
        return [slots[i].v, slots[i].set];
    };
    const useRef = (init) => { const i = at++; if (!slots[i]) { slots[i] = { current: init }; refs.push(slots[i]); } return slots[i]; };
    const useCallback = (fn, deps) => { const i = at++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; };
    const useEffect = (run, deps) => { const i = at++; if (!slots[i] || changed(slots[i].deps, deps)) { slots[i] = { deps }; effects.push(run); } };
    const env = {
        React: null, useState, useEffect, useCallback, useRef,
        dbFetch: (url, init) => {
            const method = init?.method || 'GET';
            if (method === 'GET') { did.reads++; if (!holding) { const a = readAnswer(url); return a instanceof Error ? Promise.reject(a) : Promise.resolve(a); } return new Promise((res, rej) => heldReads.push({ url, res, rej })); }
            did.sent.push([method, url, init.body === undefined ? undefined : JSON.parse(init.body)]);
            return new Promise((res, rej) => out.push({ url, res, rej }));
        },
        requestOrg: () => org.now, stillOrg: (asked) => asked === org.now,
        readRefusal, failureWords, maybeSaid, writeRefusalOf, refusalError, thrownSaid, unknownOf, alreadySaid, heldCreate, overStored, keptSaid,
        planImport, importCardShows, IMPORT_UNREAD, T: new Proxy({}, { get: (_, k) => String(k) }),
        CSectionCard: 'CSectionCard', SPTable: 'SPTable', CategoryDetailChrome: 'CategoryDetailChrome',
    };
    assert.deepEqual([...IMPORTED].sort(), Object.keys(env).sort(), 'every name the panel imports is handed to it — the real helper');
    const panel = new Function('h', ...Object.keys(env), `${PANEL_CODE}\nreturn DispatchVehiclesDetail;`)(h, ...Object.values(env));
    const props = { settings, onBack: () => {}, setSettingsDirty: (v) => did.dirty.push(v) };
    function draw() {
        dirty = false; at = 0; effects = [];
        drawn = panel(props);
        for (const run of effects) run();
    }
    const tree = () => expand([drawn]);
    const card = (title) => { const c = all(tree(), (n) => n.type === 'CSectionCard' && n.props.title === title); assert.ok(c.length <= 1, title); return c[0] || null; };
    const buttons = (root) => all(root, (n) => n.type === 'button');
    const button = (root, words) => { const b = buttons(root).filter((n) => text(n) === words); assert.ok(b.length <= 1, words); return b[0] || null; };
    const click = async (b) => { assert.ok(b, 'a button to press'); if (!b.props.disabled) b.props.onClick({}); await turns(4); };
    const m = {
        did, org, tables, refs, reads, tree, card, button, click, settle: () => turns(4),
        hold: (on) => { holding = on; }, heldReads,
        chrome: () => all(tree(), (n) => n.type === 'CategoryDetailChrome')[0],
        press: (title, words) => click(button(card(title), words)),
        // A field by its label: its input, select or textarea.
        field: (k, label) => { const f = all(card(k.card), (n) => n.type === 'FieldRow' && n.props.label.replace(/ \*$/, '') === label); assert.equal(f.length, 1, label); return all(f, (n) => ['input', 'select', 'textarea'].includes(n.type))[0]; },
        type: async (k, label, value) => { m.field(k, label).props.onChange({ target: { value } }); await turns(2); },
        // What the form holds, and what it says.
        form: (k) => { const f = all(card(k.card), (n) => n.type === k.form); assert.ok(f.length <= 1); return f[0] || null; },
        draft: (k) => (m.form(k) ? m.form(k).props.draft : null),
        error: (k) => m.form(k)?.props.error,
        errorDrawn: (k) => text(all(m.form(k), (n) => n.type === 'span')),
        said: (k) => { const s = all(card(k.card), (n) => n.props.role === 'status'); assert.ok(s.length <= 1); return s.length ? text(all(s[0], (n) => n.type === 'span')) : ''; },
        listed: (k) => all(card(k.card), (n) => n.type === 'row').map((r) => text(all(r, (n) => n.type === 'cell' && n.props.col === 'name'))),
        openers: (k, name) => { const r = all(card(k.card), (n) => n.type === 'row').filter((n) => text(all(n, (c) => c.type === 'cell' && c.props.col === 'name')) === name); assert.equal(r.length, 1, name); return all(r, (n) => typeof n.props.onClick === 'function'); },
        open: async (k, name, how = 0) => { m.openers(k, name)[how].props.onClick({}); await turns(2); },
        // The oldest write out, answered.
        answer: async (a) => { const w = out.shift(); assert.ok(w, 'a write is out'); if (a instanceof Error) w.rej(a); else w.res(a); await turns(); },
        writesOut: () => out.length,
        fill: async (k, over = {}) => { for (const [label, v] of Object.entries({ ...k.fill, ...over })) await m.type(k, label, v); },
        startNew: async (k, over) => { await m.press(k.card, k.add); await m.fill(k, over); },
        // What the import card says.
        importSays: () => { const c = card('Import from the old settings list'); return c ? all(c, (n) => n.type === 'span').map(text).filter(Boolean) : null; },
    };
    draw();
    await m.settle();
    return m;
};
// A new record's form, sent once with an answer that proved nothing.
const pressedOnce = async (k, opts, over) => {
    const m = await mount(opts);
    await m.startNew(k, over);
    await m.press(k.card, k.create);
    await m.answer(FAILED());
    return m;
};
const unproven = (m) => m.refs[0].current;

// ── A: a save ─────────────────────────────────────────────────────────────────────────────────────────────────────

test('A1 — a new form is seeded with every field it shows, so a create sent again is compared field by field; landed: closed, the fleet read again — RUN', async () => {
    for (const k of KINDS) {
        // Every key the form sets, from its own source.
        const form = PANEL_AST.program.body.find((n) => n.type === 'VariableDeclaration' && n.declarations[0].id.name === k.form);
        const keys = new Set();
        walk(form, (n) => { if (n.type === 'CallExpression' && n.callee.name === 'set') { assert.equal(n.arguments[0].type, 'StringLiteral'); keys.add(n.arguments[0].value); } });
        assert.ok(keys.size >= 7, `${k.form}: its fields read`);
        const m = await mount();
        assert.equal(m.form(k), null, 'no form until asked');
        await m.press(k.card, k.add);
        assert.deepEqual([...keys].filter((key) => !(key in m.draft(k))), [], `REGRESSION (${k.kind}) — a field the new form does not hold: a value another member gave it since would be taken in silence`);
        assert.equal(m.draft(k)._isNew, true);
        const { id } = m.draft(k);
        assert.match(id, k === V ? /^veh_[0-9a-f-]{36}$/ : /^eq_[0-9a-f-]{36}$/);
        await m.fill(k, { Name: `  ${k.fill.Name} ` });
        const before = m.did.reads;
        await m.press(k.card, k.create);
        const [method, url, body] = m.did.sent[0];
        assert.deepEqual([method, url, body.id, body.name, '_isNew' in body], ['POST', k.url, id, k.fill.Name, false]);
        assert.deepEqual(Object.keys(body).filter((key) => !k.server.columns.includes(key)), [], 'nothing sent the create does not store');
        if (k === E) assert.equal(body.category, 'Tester');
        m.tables[k.list].push(k.server.stored(body));
        await m.answer(made(k, k.server.stored(body)));
        assert.deepEqual([m.form(k), m.said(k), m.listed(k), m.did.reads - before, unproven(m), m.did.sent.length], [null, '', [k.fill.Name], 3, {}, 1]);
        assert.ok(m.button(m.card(k.card), k.add), 'the form is offered again');
    }
});

test('A2 — a name (and a unit\'s category) is required: said, nothing sent — RUN', async () => {
    for (const k of KINDS) for (const [over, words] of [[{ Name: '' }, 'Name is required.'], [{ Name: '   ' }, 'Name is required.'],
        ...(k === E ? [[{ Category: '' }, 'Category is required — job requirements point at it.'], [{ Category: '  ' }, 'Category is required — job requirements point at it.']] : [])]) {
        const m = await mount();
        await m.startNew(k, over);
        await m.press(k.card, k.create);
        assert.deepEqual([m.error(k), m.did.sent, m.form(k).props.busy], [words, [], false], JSON.stringify(over));
        assert.equal(m.errorDrawn(k), words, 'drawn beside the buttons');
    }
    // A unit's category is sent trimmed, as its name is: no near-duplicate pool by a space.
    const m = await mount();
    await m.startNew(E, { Category: '  Tester ' });
    await m.press(E.card, E.create);
    assert.deepEqual([m.did.sent[0][2].category, m.did.sent[0][2].name], ['Tester', 'Tester #1']);
});

test('A3 — an answer that proves nothing: said as maybe, the form kept with its id, its body held; the next press is the same create, and landing clears what was held — RUN', async () => {
    for (const k of KINDS) for (const [answer, words] of UNPROVEN) {
        const m = await mount();
        await m.startNew(k);
        const { id } = m.draft(k);
        const before = m.did.reads;
        await m.press(k.card, k.create);
        await m.answer(answer());
        assert.deepEqual([m.error(k), m.draft(k).id, m.draft(k)._isNew, m.form(k).props.busy, m.said(k)], [maybeSaid(k.subject, 'saved', words), id, true, false, ''], words);
        assert.equal(m.errorDrawn(k), maybeSaid(k.subject, 'saved', words));
        assert.equal(m.did.reads, before, 'nothing read again');
        assert.deepEqual(unproven(m), { [id]: [m.did.sent[0][2]] }, 'the body as sent is held');
        await m.press(k.card, k.create);
        assert.equal(m.error(k), '', 'the words of the press before are gone while this one is out');
        assert.deepEqual(m.did.sent[1], m.did.sent[0], 'the same create again');
        await m.answer(made(k, k.server.stored(m.did.sent[1][2])));
        assert.deepEqual([m.form(k), unproven(m)], [null, {}]);
    }
});

test('A4 — the server\'s own refusal wrote nothing: its words (a 403 the role\'s sentence), the form kept, no body held; only this very id\'s row on an \'idInUse\' is the create that landed — RUN', async () => {
    for (const k of KINDS) {
        const taken = `That ${k.kind} id is already in use.`;
        for (const [answer, words] of [
            [answerOf(403, { error: 'Forbidden' }), k.cannot],
            [answerOf(400, { error: 'name required' }), 'name required'],
            [answerOf(409, { error: taken }), taken],                                                              // another org's id
            [answerOf(409, { error: taken, code: 'idInUse' }), taken],                                             // no row
            [inUse(k, { id: 'other', name: 'Theirs' }), taken],                                                    // a row of another id
            [answerOf(409, { error: taken, code: 'idInUse', [k === V ? 'item' : 'vehicle']: { id: 'x' } }), taken], // another kind's
        ]) {
            const m = await mount();
            await m.startNew(k);
            await m.press(k.card, k.create);
            await m.answer(answer);
            assert.deepEqual([m.error(k), m.draft(k)._isNew, m.form(k).props.busy, m.listed(k), m.said(k), unproven(m)], [words, true, false, [], '', {}], `REGRESSION (${k.kind}) — ${words}`);
        }
        // What an earlier press held stays through a refusal: that press may have landed.
        const m = await pressedOnce(k);
        const { id } = m.draft(k);
        await m.press(k.card, k.create);
        await m.answer(answerOf(403, { error: 'Forbidden' }));
        assert.deepEqual([m.error(k), unproven(m)[id]], [k.cannot, [m.did.sent[0][2]]]);
    }
});

test('A5 — held, untouched since and standing as sent: this press\'s record — listed as stored once, the form closed, nothing said — RUN', async () => {
    for (const k of KINDS) {
        const m = await pressedOnce(k, {}, { Name: ` ${k.fill.Name}  ` });   // sent trimmed: a space is no change
        if (k === V) await m.type(k, 'Odometer (miles)', '120');             // the number column, as typed
        if (k === V) { m.field(k, 'Odometer (miles)').props.onBlur({ target: { value: '120' } }); await m.settle(); }
        await m.press(k.card, k.create);
        await m.answer(FAILED());
        const row = k.server.stored(m.did.sent[1][2]);
        m.tables[k.list].push(row);
        const before = m.did.reads;
        if (k === V) await m.type(k, 'Odometer (miles)', '120');             // typed again, not left yet: the same number
        await m.press(k.card, k.create);
        await m.answer(inUse(k, row));
        assert.deepEqual([m.form(k), m.said(k), m.listed(k), m.did.reads - before, unproven(m)], [null, '', [k.fill.Name], 3, {}], `REGRESSION (${k.kind}) — its own create read as someone's change`);
        if (k === V) assert.deepEqual(m.did.sent.map((s) => s[2].odometer), [null, 120, '120']);
        // The next form is its own: a fresh id, and nothing held against it.
        await m.startNew(k);
        assert.notEqual(m.draft(k).id, row.id);
        assert.equal(m.error(k), '');
    }
});

test('A6 — held, standing otherwise: taken as stored, the form closed, said until its Close or the next save — RUN', async () => {
    for (const k of KINDS) {
        const m = await pressedOnce(k);
        const row = { ...k.server.stored(m.did.sent[0][2]), ...k.theirs };   // another member's since
        m.tables[k.list].push(row);
        await m.press(k.card, k.create);
        await m.answer(inUse(k, row));
        assert.deepEqual([m.form(k), m.said(k), m.listed(k), unproven(m), m.did.sent.length], [null, alreadySaid(k.subject, 'created'), [k.fill.Name], {}, 2], `REGRESSION (${k.kind}) — another member's change taken in silence, or written over`);
        assert.equal(m.said(k === V ? E : V), '', 'the other card says nothing');
        // Any one field the form seeds, changed by another member, is said — one it does not show too (a unit's holder).
        for (const key of k === V ? ['assignedTechId', 'licensePlate', 'notes'] : ['checkedOutToId', 'serialNumber', 'notes']) {
            const one = await pressedOnce(k);
            await one.press(k.card, k.create);
            await one.answer(inUse(k, { ...k.server.stored(one.did.sent[0][2]), [key]: 'THEIRS' }));
            assert.deepEqual([one.form(k), one.said(k)], [null, alreadySaid(k.subject, 'created')], `REGRESSION (${k.kind}) — ${key} set by another member taken in silence`);
        }
        // Opened, it is the record as stored.
        await m.open(k, k.fill.Name);
        assert.deepEqual(m.draft(k), row);
        assert.equal(m.said(k), alreadySaid(k.subject, 'created'), 'still said: never on a timer, never by opening a form');
        await m.press(k.card, 'Close');
        assert.equal(m.said(k), '');
        // …and a save of the same card takes it away.
        const n = await pressedOnce(k);
        const other = { ...k.server.stored(n.did.sent[0][2]), ...k.theirs };
        await n.press(k.card, k.create);
        await n.answer(inUse(k, other));
        assert.equal(n.said(k), alreadySaid(k.subject, 'created'));
        await n.startNew(k, { Name: 'Another' });
        await n.press(k.card, k.create);
        assert.equal(n.said(k), '');
    }
});

test('A7 — held, with what was typed since: the record as stored under what is the member\'s, an edit now, said; its Save a PUT of that id — RUN', async () => {
    for (const k of KINDS) {
        const [label, column] = k.changed;
        const m = await pressedOnce(k);
        const { id } = m.draft(k);
        const row = { ...k.server.stored(m.did.sent[0][2]), ...k.theirs };
        m.tables[k.list].push(row);
        await m.type(k, label, 'MINE-1');
        await m.press(k.card, k.create);
        await m.type(k, 'Notes', 'while out');   // typed while the answer is out: kept too
        await m.answer(inUse(k, row));
        assert.deepEqual(m.draft(k), { ...row, [column]: 'MINE-1', notes: 'while out' }, `REGRESSION (${k.kind}) — another member's change under the form, or the typed one lost`);
        assert.deepEqual([m.error(k), m.form(k).props.busy, m.said(k), m.listed(k), unproven(m)], [keptSaid(k.subject), false, '', [k.fill.Name], {}]);
        assert.equal(m.errorDrawn(k), keptSaid(k.subject));
        assert.equal('_isNew' in m.draft(k), false);
        assert.equal(m.did.sent.length, 2, 'nothing written by itself');
        await m.press(k.card, k.save);
        assert.deepEqual(m.did.sent[2].slice(0, 2), ['PUT', `${k.url}?id=${encodeURIComponent(id)}`], 'an edit of the record it made');
        assert.deepEqual([m.did.sent[2][2][column], m.did.sent[2][2].notes, m.did.sent[2][2].status], ['MINE-1', 'while out', k.theirs.status]);
        await m.answer(answerOf(200, { [k.key]: row }));
        assert.deepEqual([m.form(k), m.said(k)], [null, '']);
    }
});

test('A8 — held after two bodies: any may be the one stored, read field by field; a name retyped with spaces is no change — RUN', async () => {
    for (const k of KINDS) {
        const [label, column] = k.changed;
        const m = await pressedOnce(k, {}, { Notes: 'A' });
        await m.type(k, 'Notes', 'B');
        await m.press(k.card, k.create);
        await m.answer(UNSENT());
        assert.equal(unproven(m)[m.draft(k).id].length, 2);
        await m.type(k, 'Name', `${k.fill.Name}  `);
        if (k === E) await m.type(k, 'Category', ' Tester ');
        await m.press(k.card, k.create);
        const row = k.server.stored(m.did.sent[0][2]);   // the first press is the one stored
        await m.answer(inUse(k, row));
        assert.deepEqual([m.draft(k), m.error(k)], [{ ...row, notes: 'B' }, keptSaid(k.subject)], 'B is the member\'s; nothing else is');
        // The second the one stored: nothing to keep.
        const n = await pressedOnce(k, {}, { Notes: 'A' });
        await n.type(k, 'Notes', 'B');
        await n.press(k.card, k.create);
        await n.answer(FAILED());
        await n.press(k.card, k.create);
        await n.answer(inUse(k, k.server.stored(n.did.sent[1][2])));
        assert.deepEqual([n.form(k), n.said(k)], [null, '']);
        // With no body held — the presses before refused, or none — what stands otherwise is never read as this member's to write.
        const o = await mount();
        await o.startNew(k);
        await o.press(k.card, k.create);
        await o.answer(inUse(k, { ...k.server.stored(o.did.sent[0][2]), [column]: 'THEIRS' }));
        assert.deepEqual([o.form(k), o.said(k)], [null, alreadySaid(k.subject, 'created')], label);
    }
});

test('A9 — the record an earlier press made is listed though the read after it fails; an edit answered \'idInUse\' is a refusal, never a create that landed — RUN', async () => {
    for (const k of KINDS) {
        const m = await pressedOnce(k, { [k.list]: [{ id: 'old', name: 'Old one' }] });
        const row = k.server.stored(m.did.sent[0][2]);
        m.reads = () => answerOf(500, { error: 'Database error' });
        await m.press(k.card, k.create);
        await m.answer(inUse(k, row));
        assert.deepEqual([m.listed(k), m.form(k)], [['Old one', k.fill.Name], null], `REGRESSION (${k.kind}) — the record it made is not shown`);
        assert.match(m.chrome().props.error, /The vehicles couldn't be read \(Database error\)\./);
        // Listed already by a read since (the press landed, its answer lost), and the read after it fails: listed once.
        const t = await pressedOnce(k);
        const there = k.server.stored(t.did.sent[0][2]);
        t.tables[k.list].push(there);
        await t.click(t.button(t.tree(), 'Refresh'));
        assert.deepEqual(t.listed(k), [k.fill.Name]);
        t.reads = () => answerOf(500, { error: 'Database error' });
        await t.press(k.card, k.create);
        await t.answer(inUse(k, there));
        assert.deepEqual(t.listed(k), [k.fill.Name], `REGRESSION (${k.kind}) — listed twice`);
        // A second record made so, the reads still failing: beside the first.
        await m.startNew(k);
        const id = m.draft(k).id;
        await m.press(k.card, k.create);
        await m.answer(FAILED());
        await m.press(k.card, k.create);
        await m.answer(inUse(k, { ...row, id, name: 'Second' }));
        assert.deepEqual(m.listed(k), ['Old one', k.fill.Name, 'Second']);

        const n = await mount({ [k.list]: [{ ...row, id: 'a b' }] });
        await n.open(k, k.fill.Name);
        assert.ok(n.button(n.card(k.card), k.save));
        await n.type(k, 'Notes', 'edited');
        await n.press(k.card, k.save);
        assert.deepEqual([n.did.sent[0][0], n.did.sent[0][1], n.did.sent[0][2].notes], ['PUT', `${k.url}?id=a%20b`, 'edited']);
        await n.answer(inUse(k, { ...row, id: 'a b' }));
        assert.ok(n.form(k), 'REGRESSION — an edit refused, its form closed');
        assert.deepEqual([n.error(k), n.draft(k).notes, n.said(k), unproven(n)], [`That ${k.kind} id is already in use.`, 'edited', '', {}]);
        // An edit whose answer proves nothing is no create's body.
        await n.press(k.card, k.save);
        await n.answer(FAILED());
        assert.deepEqual([n.error(k), unproven(n)], [maybeSaid(k.subject, 'saved', FAILED_WORDS), {}]);
        // The form edits a copy: the list's row is as it was.
        await n.press(k.card, 'Cancel');
        assert.equal(n.form(k), null);
        await n.open(k, k.fill.Name, 1);
        assert.deepEqual([n.draft(k).notes, n.error(k)], [null, ''], 'the list\'s own row, the last words gone');
    }
});

// ── B: what a press holds ─────────────────────────────────────────────────────────────────────────────────────────

test('B1 — while a press is out: its Save, Cancel and Delete disabled and dead, its rows never swap the form — RUN', async () => {
    for (const k of KINDS) for (const how of ['save', 'delete']) {
        const m = await mount({ [k.list]: [{ ...k.server.stored({ id: 'r1', name: 'One', category: 'C' }) }, { ...k.server.stored({ id: 'r2', name: 'Two', category: 'C' }) }] });
        await m.open(k, 'One');
        await m.press(k.card, how === 'save' ? k.save : 'Delete');
        assert.equal(m.did.sent.length, 1);
        const form = m.form(k);
        assert.deepEqual(all(form, (n) => n.type === 'button').map((b) => [text(b), b.props.disabled]), [['Saving…', true], ['Cancel', true], ['Delete', true]], `REGRESSION (${k.kind}, ${how}) — a button live while its press is out`);
        // Their handlers are dead too: a press that slipped past the draw closes and sends nothing.
        form.props.onCancel();
        form.props.onDelete();   // never awaited: one that sent would wait for its answer
        for (const o of m.openers(k, 'Two')) o.props.onClick({});
        await m.settle();
        assert.equal(m.openers(k, 'Two').length, 2, 'the name and the menu');
        assert.deepEqual([m.draft(k)?.id, m.did.sent.length], ['r1', 1], `REGRESSION (${k.kind}, ${how}) — the form under the press was closed, swapped or pressed again`);
        // Answered: all three live, and the rows open.
        await m.answer(FAILED());
        assert.deepEqual(all(m.form(k), (n) => n.type === 'button').map((b) => [text(b), b.props.disabled]), [[k.save, false], ['Cancel', false], ['Delete', false]]);
        await m.open(k, 'Two', 1);
        assert.deepEqual([m.draft(k).id, m.error(k)], ['r2', '']);
        await m.open(k, 'One', 0);
        assert.equal(m.draft(k).id, 'r1');
        await m.press(k.card, 'Cancel');
        assert.equal(m.form(k), null);
    }
});

test('B2 — each card its own press: one\'s out never holds the other\'s form, and its answer never frees it — RUN', async () => {
    for (const [k, other] of [[V, E], [E, V]]) {
        const m = await mount();
        await m.startNew(k);
        await m.startNew(other);
        await m.press(k.card, k.create);
        assert.deepEqual([m.form(k).props.busy, m.form(other).props.busy], [true, false], `REGRESSION — the ${k.kind}'s press holds the other card`);
        await m.press(other.card, other.create);
        assert.deepEqual(m.did.sent.map((s) => s[1]), [k.url, other.url], 'both out');
        await m.answer(answerOf(400, { error: 'name required' }));   // the first card's
        assert.deepEqual([m.form(k).props.busy, m.form(other).props.busy, m.error(k), m.error(other)], [false, true, 'name required', ''], 'REGRESSION — one card\'s answer freed the other\'s press');
        m.form(other).props.onCancel();
        await m.settle();
        assert.ok(m.form(other), 'still held by its own');
        // A Cancel of the first is free while the other's press is out.
        await m.press(k.card, 'Cancel');
        assert.equal(m.form(k), null);
        await m.answer(made(other, other.server.stored(m.did.sent[1][2])));
        assert.equal(m.form(other), null);
    }
});

test('B3 — the buttons are live when each press ends, whichever way it ends — RUN', async () => {
    for (const k of KINDS) {
        const busyAfter = async (m) => { if (!m.form(k)) await m.press(k.card, k.add); return m.form(k).props.busy; };
        for (const end of ['landed', 'held', 'held and kept', 'refused', 'unsent']) {
            const m = await pressedOnce(k);
            if (end === 'held and kept') await m.type(k, 'Notes', 'since');
            await m.press(k.card, k.create);
            assert.equal(m.form(k).props.busy, true);
            const row = k.server.stored(m.did.sent[0][2]);
            await m.answer(end === 'landed' ? made(k, row) : end.startsWith('held') ? inUse(k, row) : end === 'refused' ? answerOf(400, { error: 'no' }) : UNSENT());
            assert.equal(await busyAfter(m), false, `${k.kind}: ${end}`);
        }
    }
});

// ── C: a Delete ───────────────────────────────────────────────────────────────────────────────────────────────────

test('C1 — a Delete\'s guards: a vehicle with a technician, a unit checked out to one or to a job — said, nothing sent; a new form has no Delete and its handler sends nothing — RUN', async () => {
    for (const k of KINDS) {
        for (const [held, words] of k.held) {
            const m = await mount({ [k.list]: [{ ...k.server.stored({ id: 'r1', name: 'One', category: 'C' }), ...held }] });
            await m.open(k, 'One');
            await m.press(k.card, 'Delete');
            assert.deepEqual([m.error(k), m.did.sent, m.form(k).props.busy], [words, [], false], JSON.stringify(held));
        }
        const m = await mount();
        await m.startNew(k);
        assert.equal(m.button(m.card(k.card), 'Delete'), null);
        m.form(k).props.onDelete();
        await m.settle();
        assert.deepEqual([m.did.sent, m.error(k), m.form(k).props.busy], [[], '', false]);
    }
});

test('C2 — a Delete\'s answers: landed closes the form and reads again; a refusal its words (a 403 the role\'s), an answer that proves nothing as maybe, the form kept — RUN', async () => {
    for (const k of KINDS) {
        for (const [answer, words] of [
            [answerOf(403, { error: 'Forbidden' }), k.cannotDelete], [answerOf(409, { error: 'Still on a job' }), 'Still on a job'],
            ...UNPROVEN.map(([a, w]) => [a(), maybeSaid(k.subject, 'deleted', w)]),
        ]) {
            const m = await mount({ [k.list]: [k.server.stored({ id: 'a b', name: 'One', category: 'C' })] });
            await m.open(k, 'One');
            const before = m.did.reads;
            await m.press(k.card, 'Delete');
            assert.deepEqual(m.did.sent, [['DELETE', `${k.url}?id=a%20b`, undefined]]);
            await m.answer(answer);
            assert.deepEqual([m.error(k), m.draft(k).id, m.form(k).props.busy, m.did.reads, m.listed(k), unproven(m)], [words, 'a b', false, before, ['One'], {}], words);
        }
        const m = await mount({ [k.list]: [k.server.stored({ id: 'r1', name: 'One', category: 'C' })] });
        await m.open(k, 'One');
        const before = m.did.reads;
        await m.press(k.card, 'Delete');
        m.tables[k.list] = [];
        await m.answer(answerOf(200, { ok: true }));
        assert.deepEqual([m.form(k), m.listed(k), m.did.reads - before], [null, [], 3]);
    }
});

// ── D: the loads ──────────────────────────────────────────────────────────────────────────────────────────────────

// Both cards' saves land with the reads held: two loads out. `first` is the vehicle's, `second` the equipment's.
const twoLoads = async () => {
    const m = await mount({ vehicles: [{ id: 'v0', name: 'Van 0' }], equipment: [{ id: 'e0', name: 'Unit 0', category: 'C' }], technicians: [] });
    await m.startNew(V);
    await m.startNew(E);
    await m.press(V.card, V.create);
    await m.press(E.card, E.create);
    m.hold(true);
    await m.answer(made(V, V.server.stored(m.did.sent[0][2])));
    await m.answer(made(E, E.server.stored(m.did.sent[1][2])));
    assert.deepEqual(m.heldReads.map((r) => r.url), [...READS, ...READS]);
    const [first, second] = [m.heldReads.slice(0, 3), m.heldReads.slice(3)];
    return { m, first, second };
};
const list = (which) => [answerOf(200, { vehicles: [{ id: `v_${which}`, name: `Van ${which}` }] }), answerOf(200, { equipment: [{ id: `e_${which}`, name: `Unit ${which}`, category: 'C' }] }), answerOf(200, { technicians: [{ id: 't', firstName: which }] })];
const give = async (reads, answers) => { reads.forEach((r, i) => (answers[i] instanceof Error ? r.rej(answers[i]) : r.res(answers[i]))); await turns(); };
const shown = (m) => [m.listed(V), m.listed(E), m.chrome().props.error, text(m.chrome()).includes('Loading…')];
const NEW = [['Van new'], ['Unit new'], '', false];

test('D1 — two reads out at once, the last asked answering first: what it read stays, whatever the older one answers after — RUN', async () => {
    for (const [why, late] of [['its lists', list('old')], ['a refusal', [answerOf(500, { error: 'Database error' }), answerOf(200, { equipment: [] }), answerOf(500, { error: 'x' })]],
        ['unsent', [UNSENT(), UNSENT(), UNSENT()]]]) {
        const { m, first, second } = await twoLoads();
        assert.equal(shown(m)[3], true, 'a read is out');
        await give(second, list('new'));
        assert.deepEqual(shown(m), NEW, `${why}: shown as the last asked answered, the older still out`);
        await give(first, late);
        assert.deepEqual(shown(m), NEW, `REGRESSION — the older read's ${why} over the newer one's`);
        assert.deepEqual([m.form(V), m.form(E)], [null, null], 'both forms closed');
    }
});

test('D2 — the older answering first: not shown, its failure not said, the newer still loading; then the newer — RUN', async () => {
    for (const [why, early] of [['its lists', list('old')], ['a refusal', [answerOf(403, { error: 'Off.' }), answerOf(403, { error: 'Off.' }), answerOf(200, { technicians: [] })]], ['unsent', [UNSENT(), UNSENT(), UNSENT()]]]) {
        const { m, first, second } = await twoLoads();
        await give(first, early);
        assert.deepEqual(shown(m), [['Van 0'], ['Unit 0'], '', true], `REGRESSION — ${why} of a read asked before the last one shown`);
        await give(second, list('new'));
        assert.deepEqual(shown(m), NEW);
    }
    // The last asked failing is said, and the import's plan is not known by it.
    const { m, first, second } = await twoLoads();
    await give(first, list('old'));
    await give(second, [answerOf(500, { error: 'Database error' }), answerOf(200, { equipment: [] }), answerOf(200, { technicians: [] })]);
    assert.deepEqual(shown(m), [['Van 0'], ['Unit 0'], "The vehicles couldn't be read (Database error).", false]);
});

test('D3 — a read answered but its body still coming when the newer one is asked and lands: the older body is not shown — RUN', async () => {
    const { m, first, second } = await twoLoads();
    // Drop the second asked so far: answer the two in step, the newer held, to leave the older past its first check.
    let bodies = [];
    const slow = (body) => ({ ok: true, status: 200, json: () => new Promise((res, rej) => bodies.push(() => (body instanceof Error ? rej(body) : res(body)))) });
    await give(first, list('old'));
    await give(second, [slow({ vehicles: [{ id: 'v_slow', name: 'Van slow' }] }), slow({ equipment: [] }), answerOf(200, { technicians: [] })]);
    assert.equal(bodies.length, 2, 'past its answers, its bodies out');
    // The next save lands meanwhile: a newer read asked, and answered.
    m.hold(false);
    m.tables.vehicles = [{ id: 'v_new', name: 'Van new' }]; m.tables.equipment = [{ id: 'e_new', name: 'Unit new', category: 'C' }];
    // The equipment form is still open (its own read is the slow one); the vehicle card is free.
    await m.startNew(V);
    await m.press(V.card, V.create);
    await m.answer(made(V, V.server.stored(m.did.sent[2][2])));
    assert.deepEqual(shown(m), NEW);
    bodies.forEach((b) => b());
    await turns();
    assert.deepEqual(shown(m), NEW, 'REGRESSION — the older read\'s body over the newer one\'s');
    // …and one whose body cannot be read: its failure is not said either.
    const t = await twoLoads();
    bodies = [];
    await give(t.first, list('old'));
    await give(t.second, [slow(new SyntaxError('Unexpected token')), slow({ equipment: [] }), answerOf(200, { technicians: [] })]);
    t.m.hold(false);
    t.m.tables.vehicles = [{ id: 'v_new', name: 'Van new' }]; t.m.tables.equipment = [{ id: 'e_new', name: 'Unit new', category: 'C' }];
    await t.m.startNew(V);
    await t.m.press(V.card, V.create);
    await t.m.answer(made(V, V.server.stored(t.m.did.sent[2][2])));
    bodies.forEach((b) => b());
    await turns();
    assert.deepEqual(shown(t.m), NEW);
});

// ── E: the import ─────────────────────────────────────────────────────────────────────────────────────────────────

const OLD = { dispatchVehicles: [{ id: 'v1', name: 'Van 1' }, { id: 'v2', name: 'Van 2' }], dispatchEquipment: [{ id: 'e1', name: 'Tester', qty: '2' }] };
const CARD = 'Import from the old settings list';
const vehicleIn = (id) => inUse(V, { id, name: 'As stored' });
const itemIn = (id) => inUse(E, { id, name: 'As stored', category: 'C' });
// The import pressed, each row answered in turn (a function of the row sent, or an answer).
const imported = async (settings, answers, opts = {}) => {
    const m = await mount({ settings, ...opts });
    const before = m.did.reads;
    await m.press(CARD, 'Import now');
    for (const a of answers) await m.answer(a);
    assert.equal(m.writesOut(), 0, 'every row sent was answered');
    m.readsDone = m.did.reads - before;
    return m;
};
const sentIds = (m) => m.did.sent.map((s) => s[2].id);
const refused = (words = 'name required') => answerOf(400, { error: words });

test('E1 — all landed: every row sent in turn, once, and counted; the tables read before and after — RUN', async () => {
    const m = await imported(OLD, [answerOf(201, {}), answerOf(201, {}), answerOf(201, {}), answerOf(201, undefined)]);
    assert.deepEqual(m.did.sent.map((s) => s.slice(0, 2)), [['POST', V.url], ['POST', V.url], ['POST', E.url], ['POST', E.url]]);
    assert.deepEqual(sentIds(m), ['imp_v1', 'imp_v2', 'imp_e1_u1', 'imp_e1_u2']);
    assert.equal(m.readsDone, 5, 'the two tables for the plan, the three reads after');
    assert.deepEqual(m.importSays(), ['Imported 4 records.']);
    const one = await imported({ dispatchVehicles: [{ id: 'v1', name: 'Van 1' }] }, [answerOf(201, {})]);
    assert.deepEqual(one.importSays(), ['Imported 1 record.']);
});

test('E2 — a row made meanwhile is already in the tables: counted as that, never "not imported", never landed — RUN', async () => {
    const m = await imported(OLD, [vehicleIn('imp_v1'), answerOf(201, {}), itemIn('imp_e1_u1'), itemIn('imp_e1_u2')]);
    assert.deepEqual(m.importSays(), ['Imported 1 record. 3 already in the tables.'], 'REGRESSION — a row left as it is said as a failure, or as imported');
    const all4 = await imported(OLD, [vehicleIn('imp_v1'), vehicleIn('imp_v2'), itemIn('imp_e1_u1'), itemIn('imp_e1_u2')]);
    assert.deepEqual(all4.importSays(), ['Imported 0 records. 4 already in the tables.']);
    // Beside a refusal.
    const some = await imported(OLD, [vehicleIn('imp_v1'), refused(), answerOf(201, {}), answerOf(201, {})]);
    assert.deepEqual(some.importSays(), ['Imported 2 of 4. 1 already in the tables. 1 not imported — Van 2: name required.']);
});

test('E3 — only this very id\'s row of its own kind is "already in": another org\'s id, no row, another id\'s row, another kind\'s are refusals — RUN', async () => {
    const taken = 'That id is already in use.';
    for (const a of [answerOf(409, { error: taken }), answerOf(409, { error: taken, code: 'idInUse' }), answerOf(409, { error: taken, code: 'idInUse', vehicle: { id: 'imp_other' } }),
        answerOf(409, { error: taken, code: 'idInUse', item: { id: 'imp_v1' } }), answerOf(409, { error: taken, code: 'stale', vehicle: { id: 'imp_v1' } })]) {
        const m = await imported({ dispatchVehicles: [{ id: 'v1', name: 'Van 1' }] }, [a]);
        assert.deepEqual(m.importSays(), ['Imported 0 of 1. 1 not imported — Van 1: That id is already in use.']);
    }
    const unit = await imported({ dispatchEquipment: [{ id: 'e1', name: 'Tester' }] }, [answerOf(409, { error: taken, code: 'idInUse', vehicle: { id: 'imp_e1_u1' } })]);
    assert.deepEqual(unit.importSays(), ['Imported 0 of 1. 1 not imported — Tester: That id is already in use.']);
});

test('E4 — two entries of the old list with one id: the first sent, the second said and never sent; a vehicle and a unit of one id are two — RUN', async () => {
    const m = await imported({ dispatchVehicles: [{ id: 'v1', name: 'Van 1' }, { id: 'v1', name: 'Van 1 again' }], dispatchEquipment: [{ id: 'e1', name: 'Tester' }, { id: 'e1', name: 'Ladder' }] },
        [answerOf(201, {}), answerOf(201, {})]);
    assert.deepEqual(sentIds(m), ['imp_v1', 'imp_e1_u1'], 'REGRESSION — the second entry sent: answered as the first, "already in the tables"');
    assert.deepEqual(m.importSays(), ['Imported 2 of 4. 2 not imported — Van 1 again: another entry of the old list has the same id; Ladder: another entry of the old list has the same id.']);
    // The first refused: the second is still never sent under its id.
    const r = await imported({ dispatchVehicles: [{ id: 'v1', name: 'Van 1' }, { id: 'v1', name: 'Van 1 again' }] }, [UNSENT()]);
    assert.deepEqual(sentIds(r), ['imp_v1']);
    assert.match(r.importSays()[0], /^Imported 0 of 2\. 1 not imported — Van 1 again: another entry of the old list has the same id\. 1 record may have been imported/);
    const two = await imported({ dispatchVehicles: [{ id: 'e1_u1', name: 'Van' }], dispatchEquipment: [{ id: 'e1', name: 'Tester' }] }, [answerOf(201, {}), answerOf(201, {})]);
    assert.deepEqual([sentIds(two), two.importSays()], [['imp_e1_u1', 'imp_e1_u1'], ['Imported 2 records.']]);
});

test('E5 — a row the server refused is not imported; one whose answer proved nothing may have been, said apart; three named, the rest "…" — RUN', async () => {
    for (const [answer, said] of UNPROVEN) {
        const words = (answer === UNSENT ? 'the server could not be reached' : said).replace(/\.$/, '');   // a sentence follows
        const one = await imported({ dispatchVehicles: [{ id: 'v1', name: 'Van 1' }] }, [answer()]);
        assert.deepEqual(one.importSays(), [`Imported 0 of 1. ${maybeSaid('1 record', 'imported', `Van 1: ${words}`, false)}.`], `REGRESSION — "not imported" said of: ${words}`);
        const unit = await imported({ dispatchEquipment: [{ id: 'e1', name: 'Tester' }] }, [answer()]);
        assert.deepEqual(unit.importSays(), [`Imported 0 of 1. ${maybeSaid('1 record', 'imported', `Tester: ${words}`, false)}.`]);
    }
    const mixed = await imported(OLD, [refused('A 403 in words'), FAILED(), answerOf(201, {}), UNSENT()]);
    assert.deepEqual(mixed.importSays(), [`Imported 1 of 4. 1 not imported — Van 1: A 403 in words. ${maybeSaid('2 records', 'imported', `Van 2: ${FAILED_WORDS}; Tester #2: the server could not be reached`, true)}.`]);
    const four = await imported({ dispatchVehicles: ['a', 'b', 'c', 'd'].map((x) => ({ id: x, name: x })) }, [refused(), refused(), refused(), refused()]);
    assert.deepEqual(four.importSays(), ['Imported 0 of 4. 4 not imported — a: name required; b: name required; c: name required….']);
    // Kept until its Close; while open, the card stands.
    assert.ok(four.button(four.card(CARD), 'Close'));
    await four.press(CARD, 'Close');
    assert.deepEqual(four.importSays(), []);
});

test('E6 — nothing missing, an unread table, a read that failed as it began: said, nothing sent — RUN', async () => {
    // Another tab imported since this panel's load: nothing is sent.
    const m = await mount({ settings: OLD });
    m.tables.vehicles = [{ id: 'imp_v1', name: 'Van 1' }, { id: 'imp_v2', name: 'Van 2' }];
    m.tables.equipment = [{ id: 'imp_e1_u1', name: 'Tester #1' }, { id: 'imp_e1_u2', name: 'Tester #2' }];
    await m.press(CARD, 'Import now');
    assert.deepEqual([m.did.sent, m.importSays()], [[], ['Nothing was missing: every entry of the old list is already in the tables.']]);
    // The read as it begins fails: its words, and the button live again.
    const f = await mount({ settings: OLD });
    f.reads = (url) => (url.endsWith('dispatch-equipment') ? answerOf(502, undefined) : null);
    await f.press(CARD, 'Import now');
    assert.deepEqual([f.did.sent, f.importSays()], [[], ["The import didn't run: the equipment couldn't be read (The server returned 502). Refresh, then try again."]]);
    assert.equal(f.button(f.card(CARD), 'Import now').props.disabled, false);
    // A read with no list in it: not known.
    const n = await mount({ settings: OLD });
    n.reads = () => answerOf(200, {});
    await n.press(CARD, 'Import now');
    assert.deepEqual([n.did.sent, n.importSays()], [[], [IMPORT_UNREAD]]);
    // The panel's own load failed: what is left to import is not counted, and there is no button to press.
    const l = await mount({ settings: OLD, reads: () => answerOf(500, { error: 'Database error' }) });
    assert.equal(l.button(l.card(CARD), 'Import now'), null);
    assert.match(text(l.card(CARD)), /can't be counted/);
});

test('E7 — an org switch stops the import: no row goes under the new org\'s token, nothing said — RUN', async () => {
    const busy = (m) => !!m.button(m.card(CARD), 'Importing…');
    // Between two rows.
    const m = await mount({ settings: OLD });
    await m.press(CARD, 'Import now');
    assert.deepEqual([sentIds(m), busy(m)], [['imp_v1'], true]);
    assert.equal(m.button(m.card(CARD), 'Importing…').props.disabled, true, 'one import at a time');
    m.org.now = 'org_b';
    await m.answer(answerOf(201, {}));
    assert.deepEqual([sentIds(m), m.importSays()], [['imp_v1'], []], 'REGRESSION — a row of one org sent under another\'s token');
    // Between the vehicles and the equipment.
    const e = await mount({ settings: OLD });
    await e.press(CARD, 'Import now');
    await e.answer(answerOf(201, {}));
    e.org.now = 'org_b';
    await e.answer(vehicleIn('imp_v2'));
    assert.deepEqual([sentIds(e), e.importSays()], [['imp_v1', 'imp_v2'], []]);
    // While the tables are read.
    const r = await mount({ settings: OLD });
    r.hold(true);
    await r.press(CARD, 'Import now');
    r.org.now = 'org_b';
    await give(r.heldReads, list('b'));
    assert.deepEqual([r.did.sent, r.importSays()], [[], []]);
    // …and answered with no list, or with a refusal: the other org's, so not said.
    for (const answers of [[answerOf(200, {}), answerOf(200, {})], [answerOf(500, { error: 'Database error' }), answerOf(200, { equipment: [] })]]) {
        const s = await mount({ settings: OLD });
        s.hold(true);
        await s.press(CARD, 'Import now');
        s.org.now = 'org_b';
        await give(s.heldReads, answers);
        assert.deepEqual([s.did.sent, s.importSays()], [[], []], 'REGRESSION — one org\'s failed read said in another');
    }
    // After the last row, while the fleet is read again: nothing said of the other org's lists.
    const l = await mount({ settings: { dispatchVehicles: [{ id: 'v1', name: 'Van 1' }] } });
    await l.press(CARD, 'Import now');
    l.hold(true);
    await l.answer(answerOf(201, {}));
    l.org.now = 'org_b';
    await give(l.heldReads, list('b'));
    assert.deepEqual(l.importSays(), []);
});
