// tests/deal-fields.test.mjs
//
// A deal is read by the names a deal has (state §0.187; Jeff: "finish it and include the
// open pipeline fix").
//
// Before: the contact rail's Open Pipeline and Open Opportunities and the account rail's
// Open Opportunities showed each deal's amount from o.value. A deal has no value — its
// amount is arr — so no amount ever showed. The same class, found by the scan below: the
// account rail's rows read the close date from o.closeDate (a deal's is
// forecastedCloseDate), and the Pipeline list's next-step hint read opp.nextStep (a deal's
// is nextSteps). Neither ever showed.
//
// THE GUARD: a parse of src/ and netlify/functions/ finds every field read off a deal — off
// an element of a list named for deals (opps, openOpps, opportunities, stuckDeals …) in the
// callback that walks it, or off a variable named for one (opp, deal, matchedOpp …) — and
// checks it against the opportunities table's columns (db/schema.ts). A name not there is
// a read that finds nothing, unless it is a fallback: another operand of the same ||/??
// reads a column of the same deal (o.arr || o.revenue). A list built by a map returning
// { ...o, flags } carries flags as well; one built from anything else is not deals. The
// reads left are recorded (KNOWN), each with its reason.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';
import { parseLocalDate } from '../src/utils/dateLocal.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');

// The names a deal has: the opportunities table's columns.
const COLUMNS = (() => {
    const s = read('db/schema.ts');
    const a = s.indexOf("export const opportunities = pgTable('opportunities', {");
    assert.ok(a >= 0, 'the opportunities table');
    const b = s.indexOf('\n}, (t) =>', a);
    assert.ok(b > a, 'its end');
    return new Set([...s.slice(a, b).matchAll(/^ {4}(\w+): +\w+\(/gm)].map((m) => m[1]));
})();

// A list of deals, by its name: opps, opportunities, deals, or a name ending in one —
// openOpps, visibleOpportunities, stuckDeals — with a short tail: accOppsAll, wonOppsD.
// Not oppActivities, oppTasks, oppContacts: a deal's activities, tasks and contacts.
const DEAL_LIST = /^(?:opps|opportunities|deals|[a-z]\w*(?:Opps|Opportunities|Deals)(?:All|[A-Z])?)$/;
// One deal, by its name: opp, opportunity, deal, or a name ending in one — matchedOpp.
const ONE_DEAL = /^(?:opp|opportunity|deal|[a-z]\w*(?:Opp|Opportunity|Deal))$/;
const WALKS = new Set(['map', 'flatMap', 'filter', 'reduce', 'forEach', 'find', 'findIndex', 'findLast', 'some', 'every', 'sort']);

const walk = (node, visit, anc = []) => {
    if (!node || typeof node.type !== 'string') return;
    visit(node, anc);
    const here = [...anc, node];
    for (const k of Object.keys(node)) {
        if (k === 'loc' || k === 'start' || k === 'end' || k === 'extra') continue;
        const v = node[k];
        if (Array.isArray(v)) v.forEach((c) => walk(c, visit, here));
        else if (v && typeof v.type === 'string') walk(v, visit, here);
    }
};
const isField = (n) => (n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression') && !n.computed && n.property.type === 'Identifier';
const isCall = (n) => !!n && (n.type === 'CallExpression' || n.type === 'OptionalCallExpression');
const isFn = (n) => !!n && (n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression');

// The name a walked list goes by: openOpps in openOpps.filter(…).map(…), opportunities in
// (opportunities || []).filter(…), opps in this.opps.
const listName = (n) => (n.type === 'Identifier' ? n.name
    : isField(n) ? n.property.name
    : isCall(n) && isField(n.callee) ? listName(n.callee.object)
    : n.type === 'LogicalExpression' ? listName(n.left) : null);

// What a map's callback returns, when it returns an object it builds: { spread, keys } —
// spread when the object carries the element (...o), keys the names it sets.
const shapeOf = (fn) => {
    if (!isFn(fn) || !fn.params[0] || fn.params[0].type !== 'Identifier') return null;
    let obj = fn.body.type === 'ObjectExpression' ? fn.body : null;
    if (fn.body.type === 'BlockStatement') {
        const ret = [...fn.body.body].reverse().find((s) => s.type === 'ReturnStatement');
        if (ret && ret.argument && ret.argument.type === 'ObjectExpression') obj = ret.argument;
    }
    if (!obj) return null;
    const p = fn.params[0].name;
    return {
        spread: obj.properties.some((q) => q.type === 'SpreadElement' && q.argument.type === 'Identifier' && q.argument.name === p),
        keys: new Set(obj.properties.filter((q) => q.type === 'ObjectProperty' && !q.computed)
            .map((q) => (q.key.type === 'Identifier' ? q.key.name : q.key.value))),
    };
};

// A list a map built: the nearest map in its chain, or in the declaration of the name it
// goes by. null: the elements are the deals as loaded.
const builtBy = (list, decls) => {
    for (let n = list; n; ) {
        if (isCall(n) && isField(n.callee)) {
            const m = n.callee.property.name;
            if (m === 'map' || m === 'flatMap') return shapeOf(n.arguments[0]) || { notDeals: true };
            n = n.callee.object;
        } else if (n.type === 'LogicalExpression') n = n.left;
        else if (n.type === 'Identifier') {
            for (const init of decls.get(n.name) || []) { const s = builtBy(init, new Map()); if (s) return s; }
            return null;
        } else return null;
    }
    return null;
};

// The fields read off one deal — by the name it goes by, inside `scope` — that a deal does
// not have, less the names `extra` adds, the fallbacks, and the reads `skip` leaves to
// another pass.
const misses = (scope, name, extra, out, skip = () => false) => walk(scope, (m, anc) => {
    if (!isField(m) || m.object.type !== 'Identifier' || m.object.name !== name) return;
    const prop = m.property.name;
    if (COLUMNS.has(prop) || extra.has(prop) || skip(anc)) return;
    const parent = anc[anc.length - 1];
    if (isCall(parent) && parent.callee === m) return;                                 // a call: a Map's get, not a field
    if (parent && parent.type === 'AssignmentExpression' && parent.left === m) return;  // a write
    // the outermost ||/?? the read sits in: a fallback when it reads a column too
    let chain = null;
    for (let i = anc.length - 1; i >= 0; i--) {
        const q = anc[i];
        if (q.type === 'LogicalExpression' && (q.operator === '||' || q.operator === '??')) chain = q;
        else if (chain && q.type !== 'LogicalExpression') break;
    }
    let fallback = false;
    if (chain) walk(chain, (r) => { if (isField(r) && r.object.type === 'Identifier' && r.object.name === name && COLUMNS.has(r.property.name)) fallback = true; });
    if (!fallback) out.push({ line: m.loc.start.line, text: `${name}.${prop}` });
});

function dealReads(src) {
    const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
    const decls = new Map();
    walk(ast.program, (n) => {
        if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) {
            if (!decls.has(n.id.name)) decls.set(n.id.name, []);
            decls.get(n.id.name).push(n.init);
        }
    });
    const out = [];
    const walked = new Map();   // each callback over a list, and the names its elements go by there
    walk(ast.program, (n) => {
        if (!isCall(n) || !isField(n.callee) || !WALKS.has(n.callee.property.name)) return;
        const fn = n.arguments[0];
        if (!isFn(fn)) return;
        const name = listName(n.callee.object);
        if (!name || !DEAL_LIST.test(name)) return;
        const method = n.callee.property.name;
        const params = (method === 'reduce' ? [fn.params[1]] : method === 'sort' ? [fn.params[0], fn.params[1]] : [fn.params[0]])
            .filter((p) => p && p.type === 'Identifier').map((p) => p.name);
        walked.set(fn, new Set(params));
        const built = builtBy(n.callee.object, decls);
        if (built && (built.notDeals || !built.spread)) return;   // not deals
        for (const p of params) misses(fn.body, p, built ? built.keys : new Set(), out);
    });
    // one deal, by its name — less the reads inside a callback that walks a list under it
    const singles = new Set();
    walk(ast.program, (n) => { if (isField(n) && n.object.type === 'Identifier' && ONE_DEAL.test(n.object.name)) singles.add(n.object.name); });
    for (const name of singles) misses(ast.program, name, new Set(), out, (anc) => anc.some((a) => walked.get(a)?.has(name)));
    return out.sort((a, b) => a.line - b.line || a.text.localeCompare(b.text));
}

// The reads left, each recorded with its reason. A key is the file and the read.
// The deal window's AI read and AI Score tab read opportunity.cachedScore and
// .scoreHistory — §0.187's found (b) — until §0.188 read the deal's aiScore.
const KNOWN = new Map([
    ['src/Tabs/ReportsTab.jsx o.competitor', "a deal has no competitor: the competitor table counts no win (§0.187's found (c))"],
    ['netlify/functions/send-slack.mjs d.name', "the Slack digest's top deals — its payload's shape, which no caller sends (§0.187's found (d))"],
]);

const files = (() => {
    const out = [];
    const dir = (d) => {
        for (const e of readdirSync(new URL(d, ROOT), { withFileTypes: true })) {
            if (e.isDirectory()) { if (e.name !== 'node_modules') dir(`${d}${e.name}/`); }
            else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(`${d}${e.name}`);
        }
    };
    dir('src/'); dir('netlify/functions/');
    return out;
})();

test('the names a deal has: the opportunities table, read from the schema', () => {
    for (const c of ['id', 'opportunityName', 'account', 'stage', 'arr', 'forecastedCloseDate', 'nextSteps', 'aiScore', 'ownerId'])
        assert.ok(COLUMNS.has(c), c);
    for (const c of ['value', 'closeDate', 'nextStep', 'cachedScore']) assert.ok(!COLUMNS.has(c), `a deal has no ${c}`);
});

test('the open deals on a contact and an account show each deal\'s amount and close date — the names a deal has', () => {
    const contact = read('src/components/rails/ContactRail.jsx');
    const account = read('src/components/rails/AccountRail.jsx');
    assert.equal(contact.split("{o.stage} {o.arr ? `· $${Number(o.arr).toLocaleString()}` : ''}").length - 1, 1, 'Open Pipeline');
    assert.equal(contact.split("{o.stage}{o.arr ? ` · $${Number(o.arr).toLocaleString()}` : ''}").length - 1, 1, 'Open Opportunities');
    assert.equal(account.split("{o.stage}{o.arr ? ` · $${Number(o.arr).toLocaleString()}` : ''}").length - 1, 1, 'Open Opportunities');
    assert.ok(account.includes("{o.forecastedCloseDate ? ` · Close ${closeLabel(o.forecastedCloseDate)}` : ''}"), 'the close date');
    assert.ok(read('src/components/ListView.jsx').includes('{opp.nextSteps && ('), 'the Pipeline list\'s next-step hint');
});

test('the account rail\'s close date reads as a date — "Nov 30, 2026" — and a value that is not one as written', () => {
    const src = read('src/components/rails/AccountRail.jsx');
    const a = src.indexOf('const closeLabel = (v) => {');
    assert.ok(a >= 0, 'closeLabel');
    const fn = src.slice(a, src.indexOf('\n};', a) + 3);
    const closeLabel = new Function('parseLocalDate', `${fn}\nreturn closeLabel;`)(parseLocalDate);
    assert.equal(closeLabel('2026-11-30'), 'Nov 30, 2026', 'the local day — not the day before, as UTC midnight reads west of Greenwich');
    assert.equal(closeLabel('Q4 maybe'), 'Q4 maybe');
});

test('THE GUARD: every field read off a deal is a field a deal has — or a fallback, or recorded', () => {
    assert.ok(files.length > 250, `the tree was read (${files.length} files)`);
    const found = [];
    for (const f of files) for (const m of dealReads(read(f))) found.push({ ...m, file: f });
    const unknown = found.filter((m) => !KNOWN.has(`${m.file} ${m.text}`)).map((m) => `${m.file}:${m.line} ${m.text}`);
    assert.deepEqual(unknown, [], 'a read that finds nothing: read the name a deal has (db/schema.ts, opportunities)');
    for (const k of KNOWN.keys()) assert.ok(found.some((m) => `${m.file} ${m.text}` === k), `${k}: no longer read — take it off KNOWN`);
});

test('the guard finds the shape as it was, and leaves a fallback, a built list and a call alone', () => {
    const hits = (src) => dealReads(src).map((m) => m.text);
    assert.deepEqual(hits('openOpps.map(o => <div>{o.stage}{o.value ? ` · $${Number(o.value).toLocaleString()}` : ""}</div>)'), ['o.value', 'o.value']);
    assert.deepEqual(hits('openOpps.map(o => <div>{o.closeDate ? ` · Close ${o.closeDate}` : ""}</div>)'), ['o.closeDate', 'o.closeDate']);
    assert.deepEqual(hits('const t = opp.nextStep ? opp.nextStep.slice(0, 40) : "";'), ['opp.nextStep', 'opp.nextStep']);
    assert.deepEqual(hits('const a = matchedOpp.amount;'), ['matchedOpp.amount']);
    assert.deepEqual(hits('myOpps.filter(o => (o.forecastedCloseDate || o.closeDate) >= q)'), [], 'a fallback to a column');
    assert.deepEqual(hits('accOppsAll.forEach(o => { sum += parseFloat(o.arr || o.revenue || 0); })'), []);
    assert.deepEqual(hits('wonOpps.reduce((s, o) => s + o.value, 0)'), ['o.value'], 'reduce: the element is the second');
    assert.deepEqual(hits('opps.sort((a, b) => b.value - a.value)'), ['a.value', 'b.value']);
    assert.deepEqual(hits('const stuckDeals = (opps || []).map(o => { const d = 3; return { ...o, daysSince: d }; }); stuckDeals.map(o => o.daysSince + o.stage)'), [], 'a list built with daysSince carries it');
    assert.deepEqual(hits('const stuckDeals = opps.map(o => ({ ...o, daysSince: 3 })); stuckDeals.map(o => o.value)'), ['o.value'], '…and nothing else');
    assert.deepEqual(hits('openOpps.map(o => { const flags = []; return { ...o, flags }; }).filter(o => o.flags.length)'), []);
    assert.deepEqual(hits('const riskDeals = opps.map(o => ({ label: o.opportunityName })); riskDeals.map(d => d.label)'), [], 'not deals');
    assert.deepEqual(hits('const riskOpps = opps.map(opp => ({ ...opp, flags: [] })); riskOpps.filter(opp => opp.flags.length)'), [], 'a deal named opp in a built list: judged by the list');
    assert.deepEqual(hits('lastActivityByOpp.get(id); opp.save = 1;'), [], 'a call, a write');
    assert.deepEqual(hits('oppActivities.map(a => a.type); oppTasks.filter(t => t.completed)'), [], "a deal's activities and tasks are not deals");
});
