// tests/document-link-names.test.mjs
//
// A document's link names its record as the record is named (state §0.181; §0.180's
// found (a); Jeff: "Let's fix those two").
//
// Before: the link picker read a task's name from `name` — a task's name is its `title`;
// the tasks table has no name column — so every task was offered as "Task", none could be
// found by its name, and a link made from it was stored as "Task". An activity's name was
// read the same way (it is its `subject`), and the activity rail named its attachments by
// it; a deal's amount from `value` (it is `arr`), so no deal showed one; and the picker's
// days — a task's due date, an activity's date — were read as UTC midnight, a day early
// west of Greenwich.
//
// THE GUARD: every field the picker reads from a record, and every field a record's screen
// names its documents' links by, is a column of that record's table (a parse of
// db/schema.ts). Run here: the picker's own builder and the documents' date format, from
// their source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';
import { parseLocalDate } from '../src/utils/dateLocal.js';

process.env.TZ = 'America/Chicago';   // west of Greenwich, where UTC midnight is the evening before

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const jsx = (src) => parse(src, { sourceType: 'module', plugins: ['jsx'] });
const walk = (node, visit) => {
    if (!node || typeof node.type !== 'string') return;
    visit(node);
    for (const k of Object.keys(node)) {
        if (k === 'loc' || k === 'start' || k === 'end' || k === 'extra') continue;
        const v = node[k];
        if (Array.isArray(v)) v.forEach((c) => walk(c, visit));
        else if (v && typeof v.type === 'string') walk(v, visit);
    }
};
const srcFiles = () => {
    const out = [];
    const dir = (d) => {
        for (const e of readdirSync(new URL(d, ROOT), { withFileTypes: true })) {
            if (e.isDirectory()) dir(d + e.name + '/');
            else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(d + e.name);
        }
    };
    dir('src/');
    return out;
};

// Each table's columns, from db/schema.ts — the fields a row the app loads has (the
// loads send the rows as Drizzle reads them).
const COLUMNS = (() => {
    const ast = parse(read('db/schema.ts'), { sourceType: 'module', plugins: ['typescript'] });
    const out = {};
    for (const st of ast.program.body) {
        const decl = st.type === 'ExportNamedDeclaration' ? st.declaration : null;
        if (!decl || decl.type !== 'VariableDeclaration') continue;
        for (const d of decl.declarations) {
            const call = d.init;
            if (call && call.type === 'CallExpression' && call.callee.name === 'pgTable' && call.arguments[1] && call.arguments[1].type === 'ObjectExpression') {
                out[d.id.name] = new Set(call.arguments[1].properties.map((p) => p.key.name));
            }
        }
    }
    return out;
})();
// A link's record type, and its table — the picker's lists carry the tables' names.
const TABLE = { account: 'accounts', opportunity: 'opportunities', contact: 'contacts', task: 'tasks', activity: 'activities' };
const LISTS = Object.values(TABLE);
const member = (m) => /^(Optional)?MemberExpression$/.test(m.type) && !m.computed && m.object.type === 'Identifier';

// The fields the picker reads from each record: `<list>.forEach((row) => out.push({…}))`.
const pickerReads = (src) => {
    const out = [];
    walk(jsx(src), (n) => {
        if (n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression' || n.callee.property.name !== 'forEach') return;
        const list = n.callee.object.type === 'Identifier' ? n.callee.object.name : null;
        if (!LISTS.includes(list)) return;
        const fn = n.arguments[0];
        const row = fn.params[0].name;
        walk(fn.body, (m) => { if (member(m) && m.object.name === row) out.push({ table: list, field: m.property.name, line: m.loc.start.line }); });
    });
    return out;
};

// The fields a record's screen names its documents' links by: recordName and recordSub on
// <AttachmentsStrip> and <RecordDocuments>, against the table its recordType names.
const hostReads = (file, src) => {
    const out = [];
    walk(jsx(src), (n) => {
        if (n.type !== 'JSXOpeningElement' || !/^(AttachmentsStrip|RecordDocuments)$/.test(n.name.name)) return;
        const attr = (k) => n.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === k);
        const table = TABLE[attr('recordType').value.value];
        for (const k of ['recordName', 'recordSub']) {
            const v = attr(k);
            if (!v || !v.value || v.value.type !== 'JSXExpressionContainer') continue;
            walk(v.value.expression, (m) => { if (member(m)) out.push({ file, table, field: m.property.name, line: m.loc.start.line }); });
        }
    });
    return out;
};
const misses = (reads) => [...new Set(reads.filter((r) => !COLUMNS[r.table].has(r.field)).map((r) => `${r.table}.${r.field}`))].sort();

// A function or a const from a module's own source, run with the names it reads.
const fromSource = (src, name, scope = {}) => {
    let code = null;
    walk(jsx(src), (n) => {
        if (n.type === 'FunctionDeclaration' && n.id && n.id.name === name) code = src.slice(n.start, n.end);
        if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === name) code = src.slice(n.init.start, n.init.end);
    });
    assert.ok(code, `${name} not found`);
    return new Function(...Object.keys(scope), `return (${code});`)(...Object.values(scope));
};

// ── THE GUARD ───────────────────────────────────────────────────────────────

test('THE GUARD: every field the link picker reads from a record is a column of its table', () => {
    const reads = pickerReads(read('src/components/documents/DocumentLinkPicker.jsx'));
    assert.deepEqual([...new Set(reads.map((r) => r.table))].sort(), [...LISTS].sort(), 'the scan sees all five lists');
    for (const t of LISTS) assert.ok(COLUMNS[t] && COLUMNS[t].has('id'), `db/schema.ts: ${t}`);
    assert.deepEqual(misses(reads), [], 'a field the record does not have reads as undefined: the picker shows the fallback');
});

test('THE GUARD: every record screen names its documents\' links by its columns', () => {
    const reads = srcFiles().flatMap((f) => hostReads(f, read(f)));
    assert.deepEqual([...new Set(reads.map((r) => r.table))].sort(), [...LISTS].sort(), 'the scan sees a host for each record');
    assert.deepEqual(misses(reads), [], 'a link stored with a name the record does not have');
});

test('the guard finds the shape as it was', () => {
    const was = [
        "opportunities.forEach((o) => out.push({ type: 'opportunity', recordId: o.id, name: o.opportunityName || o.account || 'Opportunity', sub: join([o.stage, money(o.value)]) }));",
        "tasks.forEach((t) => out.push({ type: 'task', recordId: t.id, name: t.name || 'Task', sub: (t.dueDate || t.due) ? `Due ${fmtDate(t.dueDate || t.due)}` : '' }));",
        "activities.forEach((a) => out.push({ type: 'activity', recordId: a.id, name: a.name || a.type || 'Activity', sub: join([a.type, a.date ? fmtDate(a.date) : null]) }));",
    ].join('\n');
    assert.deepEqual(misses(pickerReads(was)), ['activities.name', 'opportunities.value', 'tasks.due', 'tasks.name']);
    const rail = '<AttachmentsStrip recordType="activity" recordId={editingActivity.id} recordName={editingActivity.name || editingActivity.type || \'Activity\'} recordSub={editingActivity.date || \'\'} />';
    assert.deepEqual(misses(hostReads('rail.jsx', rail)), ['activities.name']);
});

// ── run ─────────────────────────────────────────────────────────────────────

test('the picker offers each record by its own name, with its amount and its day', () => {
    const picker = read('src/components/documents/DocumentLinkPicker.jsx');
    const atoms = read('src/components/documents/atoms.jsx');
    const fmtDate = fromSource(atoms, 'fmtDate', { parseLocalDate });
    const money = fromSource(picker, 'money');
    const join = fromSource(picker, 'join');
    // The builder is the first argument of `const candidates = useMemo(…)`.
    let code = null;
    walk(jsx(picker), (n) => {
        if (n.type === 'VariableDeclarator' && n.id.name === 'candidates') code = picker.slice(n.init.arguments[0].start, n.init.arguments[0].end);
    });
    assert.ok(code, 'const candidates = useMemo(…)');
    const build = new Function('accounts', 'opportunities', 'contacts', 'tasks', 'activities', 'money', 'join', 'fmtDate', `return (${code})();`);
    const got = build(
        [{ id: 'acc_1', name: 'Harbor Point Logistics', industry: 'Logistics', city: 'Tulsa', state: 'OK' }],
        [{ id: 'opp_1', opportunityName: 'Harbor Point warehouse', stage: 'Proposal', arr: '125000.00' },
         { id: 'opp_2', account: 'Elm Co', stage: 'Lead', arr: '0.00' }],
        [{ id: 'ctc_1', firstName: 'Victor', lastName: 'Alvarez', title: 'COO', company: 'Harbor Point' }],
        [{ id: 'tsk_1', title: 'Send the warehouse schedule', dueDate: '2026-10-09' }],
        [{ id: 'act_1', type: 'Email', subject: 'Re: pricing', date: '2026-10-06' },
         { id: 'act_2', type: 'Call', subject: null, date: '2026-10-05' }],
        money, join, fmtDate,
    );
    assert.deepEqual(Object.fromEntries(got.map((c) => [c.recordId, `${c.name} | ${c.sub}`])), {
        acc_1: 'Harbor Point Logistics | Logistics · Tulsa · OK',
        opp_1: 'Harbor Point warehouse | Proposal · $125,000',
        opp_2: 'Elm Co | Lead',                                   // no amount: not "$0"
        ctc_1: 'Victor Alvarez | COO · Harbor Point',
        tsk_1: 'Send the warehouse schedule | Due Oct 9',         // its title, and its own day
        act_1: 'Re: pricing | Email · Oct 6',                     // its subject
        act_2: 'Call | Call · Oct 5',                             // no subject: its type, as before
    });
});

test('the documents\' dates read a day as the local day, and a timestamp as an instant', () => {
    const atoms = read('src/components/documents/atoms.jsx');
    const fmtDate = fromSource(atoms, 'fmtDate', { parseLocalDate });
    const fmtDateLong = fromSource(atoms, 'fmtDateLong', { parseLocalDate });
    const short = { month: 'short', day: 'numeric' };
    assert.equal(new Date('2026-10-09').toLocaleDateString('en-US', short), 'Oct 8', 'the shape it was: UTC midnight, the evening before here');
    assert.equal(fmtDate('2026-10-09'), 'Oct 9');
    assert.equal(fmtDateLong('2026-10-09'), 'Oct 9, 2026');
    assert.equal(fmtDate('2026-10-07T03:27:34.000Z'), 'Oct 6', 'an instant: 10:27 pm on the 6th here');
    for (const none of [null, undefined, '', 'not a date']) {
        assert.equal(fmtDate(none), '');
        assert.equal(fmtDateLong(none), '');
    }
});
