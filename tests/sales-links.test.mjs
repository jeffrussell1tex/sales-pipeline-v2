// tests/sales-links.test.mjs
//
// A sales record's links name live rows or entries of this org (state §0.204 — batch 4b-2b of OPEN_ITEMS §1 item 1,
// "the records"). Jeff, 15-16 Oct: "Any of this org's, refuse" — any record or entry of THIS org counts, an inactive,
// deactivated or invited one too; anything else is refused, naming the field; a link a row holds is never asked
// again. "(1) and (2) now": a claim save that clears its SPIFF or rep is a 400, and a claim id this org does not hold
// is a 404 on every save. "Fix these 3": a claim, quote or export-run id another org holds is a 409, and an export run
// stores no schedule. "Yes, send only the change" (a claim's Approve / Reject), "Guard it now" (a claim with no amount
// reads a dash), "Refuse with a 400" (a quote line that is no line, or lines that are no list), "Fix Reject's colour";
// and Jeff's two additions: a Delete on each claim, a clear Active / Inactive control on each SPIFF.
//
// Before: a SPIFF claim stored any deal and SPIFF id it was sent — another org's, or one naming nothing; a quote line
// any product; a rule's create-task any assignee. A manager's save of an unknown claim id created a claim. A claim,
// quote or export-run id another org holds crashed the create (a 500 that said the id was taken elsewhere), and an
// export run stored the schedule its body named.
//
// Run here, on made-up data: the views (listEntryIds, productIdsOf, assigneesOf); each endpoint's own spec, read from
// its file and run through linkIds.js's decisions; _links.mjs's own reader of the kinds read apart (a member, a SPIFF),
// run against a made-up database of two orgs; quotes.mjs's D5 predicate, spiff-claims.mjs's cleared-400 line and the
// claims list's amount, each run as written. Pinned, line for line: every line the mutation harness breaks — it runs
// the unit suites only (scripts/mutate-import.mjs), so a rule only the integration suite proves against the database
// is pinned here as well.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
    NOUNS, MERGES, notInOrg, NOT_AN_ID, liveIds, linksAsked, linksDecided, listEntryIds, productIdsOf, assigneesOf,
} from '../src/utils/linkIds.js';
import { LOGIN_NOT_IN_ORG } from '../src/utils/techLogin.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
// The code a pin reads: whole-line comments dropped, so a comment quoting a line never stands in for it.
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const fn = (name) => code(read(`netlify/functions/${name}.mjs`));
const count = (s, sub) => s.split(sub).length - 1;
// From `from` to the first `to` after it, both included — each there.
const between = (s, from, to) => {
    const a = s.indexOf(from);
    assert.ok(a >= 0, `missing: ${from}`);
    const b = s.indexOf(to, a + from.length);
    assert.ok(b > a, `missing after it: ${to}`);
    return s.slice(a, b + to.length);
};
// Each a WHOLE line of s, each after the one before it: a line changed, gone or moved fails it.
const order = (s, ...lines) => {
    const t = `\n${s}\n`;
    let at = 0;
    for (const line of lines) {
        const i = t.indexOf(`\n${line}\n`, at);
        assert.ok(i >= 0, `missing, changed or out of order: ${line.trim()}`);
        at = i + 1 + line.length;   // the newline that ends it begins the next
    }
};
// A whole line of s, exactly once.
const once = (s, line, why) => assert.equal(s.split('\n').filter((l) => l === line).length, 1, why || `once, as a whole line: ${line.trim()}`);
// a, then b — each there.
const before = (s, a, b, why) => {
    assert.ok(s.indexOf(a) >= 0, `missing: ${a}`);
    assert.ok(s.indexOf(b) >= 0, `missing: ${b}`);
    assert.ok(s.indexOf(a) < s.indexOf(b), why);
};
const ind = (n, line) => ' '.repeat(n) + line;
// A check's refusal, answered whole: its status, its words and its field reach the screen.
const ONE = (v) => `if (${v}.error) return { statusCode: ${v}.status, headers, body: JSON.stringify({ error: ${v}.error, field: ${v}.field }) };`;

// The three specs, as each endpoint writes them (design §3.3).
const CLAIM_SPEC = "const CLAIM_LINKS = [{ key: 'opportunityId', kind: 'deal' }, { key: 'spiffId', kind: 'spiff' }];";
const QUOTE_SPEC = "const QUOTE_LINES = [{ key: 'lineItems', kind: 'product', shape: 'many' }];";
const RULE_SPEC = "const RULE_LINKS = [{ key: 'actions', kind: 'member', shape: 'many' }];";
// An endpoint's own spec: pinned as its whole line, then run as written.
const specOf = (file, line) => {
    once(fn(file), line, `${file}: its links, as one line`);
    const name = line.match(/^const (\w+) = /)[1];
    return new Function(`${line}\nreturn ${name};`)();
};

// Org A's live rows and entries, by kind: d1 a deal; sp_on and sp_off (inactive) its SPIFFs; p1 and p_off (inactive)
// its products; u_admin, u_deact (deactivated) and u_inv (invited) its members. Org B's (dB, sp_b, pB, u_b) and
// anything deleted or removed (…_gone) are none of them.
const LIVE = { deal: ['d1'], spiff: ['sp_on', 'sp_off'], product: ['p1', 'p_off'], member: ['u_admin', 'u_deact', 'u_inv'] };
const liveOf = (ask) => new Map((LIVE[ask.kind] || []).map((id) => [id, id]));
const one = (spec, data, stored) => {
    const asked = linksAsked(spec, data, stored);
    return asked.error ? asked : linksDecided(asked.asks, data, liveOf);
};

// ── the views — run ─────────────────────────────────────────────────────────

test("listEntryIds: the ids of a list's entries that are records — an object whose id is text, not empty; a plain-text entry, one with no id, a number, an id twice (once), and anything but a list name none", () => {
    assert.deepEqual(listEntryIds([{ id: 'sp_on', active: true }, { id: 'sp_off', active: false }]), ['sp_on', 'sp_off'], 'an inactive entry is an entry of the list');
    assert.deepEqual(listEntryIds(['Team East', { id: 'tm1', name: 'West' }]), ['tm1'], 'a plain-text entry (an old team, teamMembership.js) names nothing');
    assert.deepEqual(listEntryIds([{ name: 'no id' }, { id: '' }, { id: null }, { id: 7 }, 7, null, undefined, [{ id: 'nested' }]]), [],
        'no id, an empty id, an id that is not text, a number, nothing, a list');
    assert.deepEqual(listEntryIds([{ id: 'sp1' }, { id: 'sp2' }, { id: 'sp1', name: 'again' }]), ['sp1', 'sp2'], 'an id twice is one');
    for (const notList of [null, undefined, '', 'sp1', { id: 'sp1' }, { spiffs: [{ id: 'sp1' }] }, 7, true]) {
        assert.deepEqual(listEntryIds(notList), [], `not a list: none — ${JSON.stringify(notList)}`);
    }
});

test("productIdsOf: a quote's lines as the products they name — a custom line names none, a line that is no object names none; anything but a list is handed back as given, for the check to refuse; the lines themselves are never changed", () => {
    assert.deepEqual(productIdsOf([{ productId: 'p1', qty: 2 }, { productId: 'p_off' }, { description: 'Custom', unitPrice: 10 }]), ['p1', 'p_off', undefined]);
    assert.deepEqual(productIdsOf([null, 'p1', 7, undefined, [{ productId: 'p1' }]]), [undefined, undefined, undefined, undefined, undefined], 'a line that is no object (a list is no line either) names none');
    assert.deepEqual(productIdsOf([{ productId: 7 }]), [7], 'kept, to be refused as no id');
    assert.deepEqual(productIdsOf([]), []);
    assert.equal(productIdsOf('x'), 'x', 'lines that are no list, as given — refused as no list, never read as no lines');
    assert.equal(productIdsOf(null), null);
    assert.equal(productIdsOf(undefined), undefined);
    const line = { productId: 'p1' };
    assert.equal(productIdsOf(line), line, 'an object is no list either');
    const lines = [{ productId: 'p1', qty: 1 }];
    productIdsOf(lines);
    assert.deepEqual(lines, [{ productId: 'p1', qty: 1 }], 'a view: never written back');
});

test("assigneesOf: a rule's actions as the members they assign — only a create-task names one, by params.assignedToId; a name-only pick, an action that is no object, params that are none or no object name none; actions that are no list name none", () => {
    const actions = [
        { type: 'create_task', params: { title: 'Call', assignedToId: 'u_deact' } },
        { type: 'create_task', params: { title: 'By name', assignedToId: '', assignedTo: 'Karen' } },
        { type: 'create_task', params: { title: 'The default' } },
        { type: 'send_email', params: { to: 'x@y.z', assignedToId: 'u_b' } },
        { type: 'update_field', params: { field: 'probability', value: 50 } },
    ];
    assert.deepEqual(assigneesOf(actions), ['u_deact', '', undefined], "a create-task's assignee, or none; another action's params are never read");
    assert.deepEqual(assigneesOf([null, 'create_task', 7, ['create_task'], { type: 'create_task' }, { type: 'create_task', params: null },
        { type: 'create_task', params: 'u_admin' }, { type: 'create_task', params: 7 }]), [], 'an action that is no object, or whose params are none or no object');
    assert.deepEqual(assigneesOf([{ type: 'create_task', params: { assignedToId: 7 } }]), [7], 'kept, to be refused as no id');
    for (const notList of [null, undefined, '', 'create_task', { type: 'create_task', params: { assignedToId: 'u_b' } }, 7]) {
        assert.deepEqual(assigneesOf(notList), [], `not a list: none — the engine runs only a list: ${JSON.stringify(notList)}`);
    }
    const copy = JSON.parse(JSON.stringify(actions));
    assigneesOf(actions);
    assert.deepEqual(actions, copy, 'a view: never written back');
});

test("the words name each new kind — a product, a member (the technician login's own words), a SPIFF — and none of the three is ever merged away", () => {
    assert.equal(notInOrg('product'), 'That product is not in your organization — pick one from the list.');
    assert.equal(notInOrg('member'), 'That member is not in your organization — pick one from the list.');
    assert.equal(notInOrg('member'), LOGIN_NOT_IN_ORG, "word for word the technician login's (techLogin.js)");
    assert.equal(notInOrg('spiff'), 'That SPIFF is not in your organization — pick one from the list.');
    assert.deepEqual(Object.keys(NOUNS).slice(-5, -2), ['product', 'member', 'spiff'], "after Dispatch's; a member's two after them (§0.205)");
    for (const kind of ['product', 'member', 'spiff']) assert.ok(!MERGES.includes(kind), `${kind}: never merged away — stored as sent`);
    assert.deepEqual([...MERGES], ['account', 'contact']);
});

// ── each endpoint's spec, run through the decisions ─────────────────────────

test("a claim's deal and SPIFF (spiff-claims.mjs's CLAIM_LINKS, run): any of this org's, an inactive SPIFF too; another org's, or one naming nothing, refused 404 naming the field; what the claim holds is never asked again — and an Approve names no link", () => {
    const CLAIM = specOf('spiff-claims', CLAIM_SPEC);
    assert.deepEqual(one(CLAIM, { id: 'cl1', opportunityId: 'd1', spiffId: 'sp_off', repName: 'Karen' }, null), { set: {} }, "an inactive SPIFF of the org's");
    assert.deepEqual(one(CLAIM, { opportunityId: null, spiffId: 'sp_on' }, null), { set: {} }, 'no deal asks nothing');
    assert.deepEqual(one(CLAIM, { opportunityId: 'dB', spiffId: 'sp_on' }, null), { status: 404, error: notInOrg('deal'), field: 'opportunityId' }, "org B's deal");
    assert.deepEqual(one(CLAIM, { opportunityId: 'd1', spiffId: 'sp_b' }, null), { status: 404, error: notInOrg('spiff'), field: 'spiffId' }, "org B's SPIFF");
    assert.deepEqual(one(CLAIM, { opportunityId: 'd1', spiffId: 'sp_gone' }, null), { status: 404, error: notInOrg('spiff'), field: 'spiffId' }, 'a SPIFF removed from the list');
    assert.deepEqual(one(CLAIM, { opportunityId: 'd1', spiffId: 7 }, null), { status: 400, error: NOT_AN_ID, field: 'spiffId' }, 'not an id');
    const stored = { id: 'cl1', opportunityId: 'd_gone', spiffId: 'sp_gone', repName: 'Karen', status: 'pending' };
    assert.deepEqual(linksAsked(CLAIM, { ...stored, status: 'approved' }, stored), { asks: [] },
        'a whole-body save re-sending what the claim holds — a SPIFF removed since, a deal deleted since — asks nothing');
    assert.deepEqual(linksAsked(CLAIM, { id: 'cl1', status: 'approved', approvedAt: '2026-10-16T12:00:00.000Z', approvedBy: 'Jeff' }, stored), { asks: [] },
        'D2: an Approve sends only the change and names no link');
    assert.deepEqual(one(CLAIM, { spiffId: 'sp_b' }, stored), { status: 404, error: notInOrg('spiff'), field: 'spiffId' }, "re-pointed to another org's SPIFF");
    assert.deepEqual(linksAsked(CLAIM, { spiffId: '' }, stored), { asks: [] }, 'a cleared SPIFF asks nothing — the endpoint refuses it, the cleared 400');
});

test("a quote line's product (quotes.mjs's QUOTE_LINES, through productIdsOf, run): any of this org's, an inactive one too; another org's, or one naming nothing, refused naming lineItems; the stored lines' products held as a set, not by position; a save naming no lines asks nothing", () => {
    const QUOTE = specOf('quotes', QUOTE_SPEC);
    const view = (lineItems) => ({ lineItems: productIdsOf(lineItems) });
    assert.deepEqual(one(QUOTE, view([{ productId: 'p1' }, { productId: 'p_off' }, { description: 'Custom' }]), null), { set: {} }, 'an inactive product, and a custom line naming none');
    assert.deepEqual(one(QUOTE, view([{ productId: 'p1' }, { productId: 'pB' }]), null), { status: 404, error: notInOrg('product'), field: 'lineItems' }, "org B's product");
    assert.deepEqual(one(QUOTE, view([{ productId: 'p_gone' }]), null), { status: 404, error: notInOrg('product'), field: 'lineItems' },
        'a new version copying a line whose product names nothing here: refused, the version not made');
    assert.deepEqual(one(QUOTE, view('x'), null), { status: 400, error: NOT_AN_ID, field: 'lineItems' }, 'lines that are no list: refused, never read as none');
    assert.deepEqual(one(QUOTE, view([{ productId: 7 }]), null), { status: 400, error: NOT_AN_ID, field: 'lineItems' }, 'a product id that is not text');
    assert.deepEqual(one(QUOTE, view(null), null), { set: {} }, 'cleared lines name nothing');
    const held = view([{ productId: 'p_gone', qty: 1 }, { productId: 'p1' }]);
    assert.deepEqual(linksAsked(QUOTE, view([{ productId: 'p1' }, { productId: 'p_gone', qty: 3 }, { productId: 'p_gone' }]), held), { asks: [] },
        'a Draft re-sent with what it holds — moved, repeated: nothing asked');
    assert.deepEqual(linksAsked(QUOTE, view([{ productId: 'p_gone' }, { productId: 'pB' }]), held).asks.map((a) => a.fresh), [['pB']], 'only the product it adds is asked');
    assert.deepEqual(linksAsked(QUOTE, {}, held), { asks: [] }, 'a status move ({ id, status }) names no lines: quotes.mjs hands the check {}');
});

test("a rule's create-task assignee (automations.mjs's RULE_LINKS, through assigneesOf, run): any member of this org, a deactivated or invited one too; another org's refused naming actions; the stored rule's assignee never asked again; actions that are no list ask nothing", () => {
    const RULE = specOf('automations', RULE_SPEC);
    const view = (actions) => ({ actions: assigneesOf(actions) });
    const task = (assignedToId) => ({ type: 'create_task', params: { title: 'Follow up', assignedToId } });
    assert.deepEqual(one(RULE, view([task('u_deact'), task('u_inv'), task(''), { type: 'send_email', params: { to: 'x@y.z' } }]), null), { set: {} },
        'a deactivated and an invited member; a name-only pick names none');
    assert.deepEqual(one(RULE, view([task('u_admin'), task('u_b')]), null), { status: 404, error: notInOrg('member'), field: 'actions' }, "org B's member");
    assert.deepEqual(one(RULE, view([task(7)]), null), { status: 400, error: NOT_AN_ID, field: 'actions' }, 'an assignee id that is not text');
    assert.deepEqual(one(RULE, view('create_task'), null), { set: {} }, 'actions that are no list name none (the engine runs only a list)');
    const held = view([task('u_gone')]);
    assert.deepEqual(linksAsked(RULE, view([task('u_gone'), { type: 'webhook', params: {} }]), held), { asks: [] }, 'an edit re-sending the assignee deleted since: held');
    assert.deepEqual(one(RULE, view([task('u_gone'), task('u_b')]), held), { status: 404, error: notInOrg('member'), field: 'actions' }, "an edit naming another org's member");
});

// ── _links.mjs: the kinds read apart, run against two orgs ──────────────────

// _links.mjs's own LISTS and idsReadApart, taken from the file and run against a made-up database of two orgs (and a
// third whose settings row holds no list): drizzle's eq / and / inArray as row tests; a select answers the rows its
// where keeps — or every org's rows, should a read lose its where.
const TABLE = Symbol('table');
const users = { [TABLE]: 'users', id: { key: 'id' }, orgId: { key: 'orgId' } };
const settings = { [TABLE]: 'settings', orgId: { key: 'orgId' }, extra: { key: 'extra' } };
const eq = (c, v) => (r) => r[c.key] === v;
const and = (...tests) => (r) => tests.every((t) => t(r));
const inArray = (c, vs) => (r) => vs.includes(r[c.key]);
const ROWS = {
    users: [
        { id: 'u_admin', orgId: 'org_A' }, { id: 'u_deact', orgId: 'org_A', active: false }, { id: 'u_inv', orgId: 'org_A', status: 'Invited' },
        { id: 'u_b', orgId: 'org_B' },
    ],
    settings: [
        // Each org's teams list too (§0.205): org A's tm_east, an old plain-text team, one with no id, one with an empty id.
        { orgId: 'org_A', extra: { spiffs: [{ id: 'sp_on', active: true }, { id: 'sp_off', active: false }, 'sp_text', { name: 'no id' }],
            teams: [{ id: 'tm_east', name: 'East' }, 'Legacy', { name: 'no id' }, { id: '' }] } },
        { orgId: 'org_B', extra: { spiffs: [{ id: 'sp_b', active: true }], teams: [{ id: 'tm_b', name: 'B Team' }] } },
        { orgId: 'org_C', extra: null },
    ],
};
const fakeDb = (reads) => ({
    select: (cols) => ({
        from: (table) => {
            const pick = (rows) => rows.map((r) => Object.fromEntries(Object.entries(cols).map(([k, c]) => [k, r[c.key]])));
            const all = ROWS[table[TABLE]];
            return {
                where: (keep) => { reads.push({ table: table[TABLE], scoped: true }); return Promise.resolve(pick(all.filter(keep))); },
                then: (ok, no) => { reads.push({ table: table[TABLE], scoped: false }); return Promise.resolve(pick(all)).then(ok, no); },
            };
        },
    }),
});
const readApart = () => {
    const l = fn('_links');
    const from = l.indexOf('const LISTS = Object.freeze(');
    const fnAt = l.indexOf('async function idsReadApart(kind, list, orgId) {');
    assert.ok(from >= 0 && fnAt > from, 'LISTS, then idsReadApart');
    const src = l.slice(from, l.indexOf('\n}\n', fnAt) + 3);
    const reads = [];
    const made = new Function('db', 'users', 'settings', 'and', 'eq', 'inArray', 'listEntryIds', `${src}\nreturn { LISTS, idsReadApart };`)(
        fakeDb(reads), users, settings, and, eq, inArray, listEntryIds);
    return { ...made, reads };
};

test("a member and a SPIFF are read apart, in this org (_links.mjs's own reader, run): any member of it, deactivated or invited; any entry of its SPIFF list, an inactive one — another org's never, one naming nothing never; every read scoped to the org", async () => {
    const { LISTS, idsReadApart, reads } = readApart();
    assert.deepEqual({ ...LISTS }, { spiff: 'spiffs', team: 'teams' }, "a SPIFF is an entry of the settings list `spiffs`, a team of `teams` (§0.205)");
    assert.ok(Object.isFrozen(LISTS));
    const ids = async (kind, list, org) => (await idsReadApart(kind, list, org)).map((r) => r.id).sort();
    assert.deepEqual(await ids('spiff', ['sp_on', 'sp_off', 'sp_b', 'sp_text', 'nope'], 'org_A'), ['sp_off', 'sp_on'],
        "an inactive SPIFF counts; org B's, a plain-text entry and one naming nothing do not");
    assert.deepEqual(await ids('spiff', ['sp_on', 'sp_b'], 'org_B'), ['sp_b'], 'and org B reads only its own');
    assert.deepEqual(await ids('spiff', ['sp_on'], 'org_C'), [], 'a settings row with no list');
    assert.deepEqual(await ids('spiff', ['sp_on'], 'org_none'), [], 'no settings row');
    assert.deepEqual(await ids('member', ['u_admin', 'u_deact', 'u_inv', 'u_b', 'nope'], 'org_A'), ['u_admin', 'u_deact', 'u_inv'],
        "a deactivated and an invited member count; org B's does not");
    assert.deepEqual(await ids('member', ['u_admin', 'u_b'], 'org_B'), ['u_b']);
    assert.equal(reads.length, 6, 'one read each');
    assert.ok(reads.every((r) => r.scoped), 'every read has its where — none reads every org');
    // As liveIdsInOrg's first line hands it to liveIds: each id once, text only, in one read.
    const live = await liveIds(['sp_off', 'sp_b', 'sp_off', '', 7], (list) => idsReadApart('spiff', list, 'org_A'));
    assert.deepEqual([...live], [['sp_off', 'sp_off']]);
    assert.equal(reads.length, 7, 'one read for the ids asked');
});

test("a team is an entry of this org's teams list (_links.mjs's own reader, run — state §0.205): an object team of the org's list; another org's, an old plain-text team, one with no id or an empty id, a SPIFF's id and one naming nothing are none; the lists are kept apart; every read scoped", async () => {
    const { idsReadApart, reads } = readApart();
    const ids = async (kind, list, org) => (await idsReadApart(kind, list, org)).map((r) => r.id).sort();
    assert.deepEqual(await ids('team', ['tm_east', 'tm_b', 'Legacy', '', 'sp_on', 'nope'], 'org_A'), ['tm_east'],
        "org B's team, a plain-text team (an old one: no id), a SPIFF's id and one naming nothing are no team of A's");
    assert.deepEqual(await ids('team', ['tm_east', 'tm_b'], 'org_B'), ['tm_b'], 'org B reads only its own');
    assert.deepEqual(await ids('team', ['tm_east'], 'org_C'), [], 'a settings row with no list');
    assert.deepEqual(await ids('team', ['tm_east'], 'org_none'), [], 'no settings row');
    assert.deepEqual(await ids('spiff', ['tm_east'], 'org_A'), [], "a team's id asked as a SPIFF: the lists are kept apart");
    assert.equal(reads.length, 5, 'one read each');
    assert.ok(reads.every((r) => r.table === 'settings' && r.scoped), "each read is the org's settings, with its where");
    const live = await liveIds(['tm_east', 'tm_b', 'tm_east', '', 7], (list) => idsReadApart('team', list, 'org_A'));
    assert.deepEqual([...live], [['tm_east', 'tm_east']], 'as liveIdsInOrg hands it: each id once, text only');
});

test("_links.mjs: a product is a TABLES kind, read in the org as every row is; a member, a SPIFF and a team are read apart — the branch is liveIdsInOrg's first line; a member's pinned report is a TABLES kind (§0.205); the member read and the settings read each carry the org clause, the settings read no limit (the lines the harness breaks)", () => {
    const l = fn('_links');
    once(l, "import { listEntryIds } from '../../src/utils/linkIds.js';", 'listEntryIds on an import line of its own (the decisions line stays as pinned)');
    const tables = between(l, 'const TABLES = Object.freeze({', '\n});');
    assert.ok(tables.split('\n').includes('    product: products,'), "a quote line's product, read from the products table");
    assert.ok(tables.split('\n').includes('    report: savedReports,'), "a member's pinned report, read from the saved reports (§0.205)");
    assert.ok(!/\busers\b/.test(tables) && !tables.includes('spiff') && !tables.includes('member') && !tables.includes('team'),
        'a member, a SPIFF and a team are no TABLES kind (the member-names guard; the restore reads TABLES kinds as columns)');
    once(l, '    product: products,');
    once(l, '    report: savedReports,');
    once(l, "const LISTS = Object.freeze({ spiff: 'spiffs', team: 'teams' });");
    const reader = between(l, 'async function idsReadApart(kind, list, orgId) {', '\n}\n');
    order(reader,
        "    if (kind === 'member') return db.select({ id: users.id }).from(users).where(and(eq(users.orgId, orgId), inArray(users.id, list)));",
        '    const rows = await db.select({ extra: settings.extra }).from(settings).where(eq(settings.orgId, orgId));',
        '    const held = new Set(rows.flatMap((r) => listEntryIds(r.extra?.[LISTS[kind]])));',
        '    return list.filter((id) => held.has(id)).map((id) => ({ id }));');
    assert.ok(!reader.includes('.limit('), "every settings row of the org, no limit — a read that lost its clause takes every org's list each time, never one row at random");
    assert.ok(l.includes('export async function liveIdsInOrg(kind, ids, orgId, { follow = true } = {}) {\n'
        + "    if (kind === 'member' || LISTS[kind]) return liveIds(ids, (list) => idsReadApart(kind, list, orgId));\n"
        + '    const table = TABLES[kind];\n'), "the branch is liveIdsInOrg's first line: a member or a SPIFF never reaches TABLES");
    assert.ok(l.includes('const SWEPT = Object.freeze({ ...TABLES, quote: quotes });') && !l.includes('...LISTS'), 'a list kind is never swept as a column');
});

// ── spiff-claims.mjs ────────────────────────────────────────────────────────

const NOT_HELD = "if (!existing) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Claim not found in your organization' }) };";
const BLANK_TEXT = "const blankText = (v) => (typeof v === 'string' ? !v.trim() : !v);";
const BLANK = "            const blank = ['spiffId', 'repName'].find((k) => k in changes && !blankText(existing[k]) && blankText(changes[k]));";
const BLANK_REFUSAL = "            if (blank) return { statusCode: 400, headers, body: JSON.stringify({ error: blank === 'spiffId' ? 'A claim names its SPIFF — it cannot be cleared.' : 'A claim names its rep — it cannot be cleared.', field: blank }) };";

test("spiff-claims POST: an id and a SPIFF are required — a SPIFF of spaces is none; a rep's own name stamped, then the rep tested on the claim as written — spaces name none, and a rep's own claim is her roster name, whatever the body sent; then an id that is no text refused, then the claim's deal and SPIFF asked of the claim as written — before the insert, which writes nothing for a taken id and answers 409 before the audit", () => {
    const s = fn('spiff-claims');
    once(s, "import { checkLinks } from './_links.mjs';");
    const post = between(s, "if (event.httpMethod === 'POST') {", "if (event.httpMethod === 'PUT') {");
    order(post,
        ind(12, "if (!data.id || blankText(data.spiffId)) {"),
        ind(16, "return { statusCode: 400, headers, body: JSON.stringify({ error: 'id, repName, spiffId required' }) };"),
        ind(12, 'let claim = sanitize(data);'),
        ind(12, 'if (!isAdmin && !isManager) {'),
        ind(16, "claim = { ...claim, repName: me, status: 'pending', approvedAt: null, approvedBy: null, paidAt: null };"),
        ind(12, "if (blankText(claim.repName)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id, repName, spiffId required' }) };"),
        ind(12, "if (typeof data.id !== 'string') return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };"),
        ind(12, 'const linked = await checkLinks(CLAIM_LINKS, claim, null, orgId);'),
        ind(12, ONE('linked')),
        ind(12, 'const [inserted] = await db.insert(spiffClaims)'),
        ind(16, '.values({ ...claim, orgId })'),
        ind(16, '.onConflictDoNothing({ target: spiffClaims.id }).returning();'),
        ind(12, "if (!inserted) return { statusCode: 409, headers, body: JSON.stringify({ error: 'That claim id is already in use.' }) };"));
    before(post, "if (!inserted) return { statusCode: 409,", "action: 'spiff_claim.submitted'", 'answered before the audit, which reads the row');
    assert.ok(!post.includes('data.repName'), "REGRESSION: the rep tested on the body — a rep's claim refused for a name the server replaces with hers (review F1)");
    assert.ok(!post.includes('!data.spiffId'), 'REGRESSION: a SPIFF of spaces taken as one, then asked as an id — a 404, not the 400 (review F2)');
});

test("a claim's SPIFF or rep is blank as its write would store it (blankText, run): text empty or spaces, or what sanitize's `|| null` stores as none — 0 and false too (they read as set through String() and met the NOT NULL, a 500); an object or a number is not blank — the link check refuses it — and never throws (String() threw on an object with no usable toString; re-check R1)", () => {
    const s = fn('spiff-claims');
    once(s, BLANK_TEXT);
    assert.ok(s.indexOf('\n' + BLANK_TEXT) >= 0 && s.indexOf(BLANK_TEXT) < s.indexOf('export const handler'), 'module scope, before the handler');
    assert.equal(count(s, 'blankText('), 4, "the POST's SPIFF and rep, and the PUT's two sides — each blank test the claim's");
    assert.ok(!s.includes("String(data.spiffId ?? '')") && !s.includes("String(claim.repName ?? '')") && !s.includes("String(changes[k] ?? '')"), 'REGRESSION: a blank test reads the raw value through String()');
    const blankText = new Function(`${BLANK_TEXT}\nreturn blankText;`)();
    const sanitize = new Function(`${between(s, 'const sanitize = (d) => ({', '\n});')}\nreturn sanitize;`)();
    for (const v of ['', '   ', null, undefined, 0, false]) assert.equal(blankText(v), true, `${JSON.stringify(v)} is blank`);
    for (const v of ['sp_1', ' sp_1 ', 5, true, { toString: 1 }, ['sp_1']]) {
        assert.doesNotThrow(() => blankText(v), `${JSON.stringify(v)}: no throw`);
        assert.equal(blankText(v), false, `${JSON.stringify(v)} is not blank`);
    }
    for (const v of ['', '   ', null, 0, false, 'sp_1', 5, { toString: 1 }]) {
        const stored = sanitize({ id: 'c1', spiffId: v, repName: v }).spiffId;
        if (stored == null) assert.equal(blankText(v), true, `${JSON.stringify(v)}: sanitize stores none, so it is refused — never the NOT NULL's 500`);
    }
});

test("spiff-claims PUT: an id that is no text is 400; a claim this org does not hold is 404 for every role, before the rep's block; a save that turns the SPIFF or the rep from set to blank — spaces too — is 400 before any link is asked; the links it names anew are asked after that, over the stored claim, before the merge; the write updates only, org first, and a claim deleted meanwhile is 404", () => {
    const s = fn('spiff-claims');
    const put = between(s, "if (event.httpMethod === 'PUT') {", "if (event.httpMethod === 'DELETE') {");
    order(put,
        ind(12, "if (!data.id || typeof data.id !== 'string') return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };"),
        ind(12, 'const [existing] = await db.select().from(spiffClaims)'),
        ind(16, '.where(and(eq(spiffClaims.id, data.id), eq(spiffClaims.orgId, orgId)));'),
        ind(12, NOT_HELD),
        ind(12, 'let changes = data;'),
        ind(12, 'if (!isAdmin && !isManager) {'),
        ind(16, 'changes = ownFields;'),
        BLANK,
        BLANK_REFUSAL,
        ind(12, 'const linked = await checkLinks(CLAIM_LINKS, changes, existing, orgId);'),
        ind(12, ONE('linked')),
        ind(12, 'const clean = sanitize({ ...(existing || {}), ...changes });'),
        ind(12, 'const { id, ...updateData } = clean;'),
        ind(12, 'const [updated] = await db.update(spiffClaims).set({ ...updateData, updatedAt: new Date() })'),
        ind(16, '.where(and(eq(spiffClaims.orgId, orgId), eq(spiffClaims.id, id)))'),
        ind(16, '.returning();'),
        ind(12, "if (!updated) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Claim not found in your organization' }) };"));
    assert.equal(count(put, NOT_HELD), 1, "one 404 for a claim this org does not hold — every role's");
    assert.ok(!between(put, ind(12, 'if (!isAdmin && !isManager) {'), 'changes = ownFields;').includes('if (!existing)'), "not the rep's alone: a manager's save of an unknown id created a claim");
    assert.ok(!between(put, NOT_HELD, BLANK.trim()).includes('checkLinks('), "(1) first: nothing is asked before a SPIFF or rep turned blank is refused — a SPIFF of spaces was asked as an id, a 404 'not in your organization' (review F2)");
    assert.ok(!put.includes('db.insert(') && !put.includes('onConflictDoUpdate'), 'REGRESSION: a save creates a claim — an unknown id, or one deleted while the save was out (the upsert put it back)');
    assert.equal(count(s, ONE('linked')), 2, "each check's refusal answered — the create's and the save's");
    assert.equal(count(s, 'checkLinks(CLAIM_LINKS,'), 2);
});

test("(1): a claim save that turns its SPIFF or its rep from set to blank — '', null or spaces — is refused, naming the field, on what the save sends (spiff-claims.mjs's own line, run; each refusal one its own sanitize would have stored blank); a field the save does not name, or one stored blank before, is not this save's to refuse", () => {
    const s = fn('spiff-claims');
    const sanitize = new Function(`${between(s, 'const sanitize = (d) => ({', '\n});')}\nreturn sanitize;`)();
    const blankOf = new Function('changes', 'existing', `${BLANK_TEXT}\n${BLANK.trim()}\nreturn blank;`);
    const stored = { id: 'cl1', spiffId: 'sp_gone', spiffName: 'Q4 push', repName: 'Karen', status: 'pending', claimedAt: '2026-10-01T00:00:00.000Z' };
    const run = (changes, existing = stored) => {
        const k = blankOf(changes, existing);
        if (k) assert.equal(String(sanitize({ ...existing, ...changes })[k] ?? '').trim(), '', `${k}: the write would have stored it blank`);
        return k;
    };
    assert.equal(run({ spiffId: '' }), 'spiffId', 'a cleared SPIFF (it was the write\'s NOT NULL, a 500)');
    assert.equal(run({ spiffId: null }), 'spiffId');
    assert.equal(run({ spiffId: '   ' }), 'spiffId', "a SPIFF of spaces (it was asked as an id — a 404, 'not in your organization')");
    assert.equal(run({ repName: '' }), 'repName', 'a cleared rep');
    assert.equal(run({ repName: '  ' }), 'repName', "a Manager's rep of spaces (it was stored)");
    // The converse (re-check R1): every value the write would store blank over a set one is refused — 0 and false
    // passed a String() test and met the NOT NULL (a 500).
    for (const k of ['spiffId', 'repName']) {
        for (const v of ['', null, '   ', 0, false]) {
            if (!String(sanitize({ ...stored, [k]: v })[k] ?? '').trim()) assert.equal(run({ [k]: v }), k, `${k} ${JSON.stringify(v)}: stored blank, so refused`);
        }
    }
    assert.equal(run({ spiffId: { toString: 1 } }), undefined, 'an object is no blank — the link check refuses it as no id (String() threw on it, a 500)');
    assert.equal(run({ status: 'approved', approvedBy: 'Jeff' }), undefined, 'D2: an Approve names neither');
    assert.equal(run({ spiffId: 'sp_on', note: 'n' }), undefined, 'a SPIFF changed, not cleared');
    assert.equal(run({ repName: '  ' }, { ...stored, repName: '  ' }), undefined, "a rep stored blank before is not this save's (census C1)");
    const words = between(s, BLANK.trim(), "field: blank }) };");
    assert.ok(words.includes("'A claim names its SPIFF — it cannot be cleared.'") && words.includes("'A claim names its rep — it cannot be cleared.'"), 'the words, naming the field');
});

// ── export-runs.mjs ─────────────────────────────────────────────────────────

test("export-runs POST: a run names no schedule, whatever the body says; an id another org holds writes nothing and answers 409 (its headers are HEADERS) — before the audit, and with no file", () => {
    const s = fn('export-runs');
    assert.ok(!s.includes('data.scheduleId'), "REGRESSION: a run stores the schedule its body names — another org's included");
    once(s, ind(20, 'scheduleId:  null,'));
    assert.ok(!s.includes('exportSchedules'), 'no schedule is read or written here');
    const post = between(s, "if (event.httpMethod === 'POST') {", 'download: {');
    order(post,
        ind(16, '.insert(exportRuns)'),
        ind(16, '.onConflictDoNothing({ target: exportRuns.id })'),
        ind(16, '.returning();'),
        ind(12, "if (!run) return { statusCode: 409, headers: HEADERS, body: JSON.stringify({ error: 'That export run id is already in use.' }) };"));
    assert.ok(post.includes(ind(16, '.onConflictDoNothing({ target: exportRuns.id })\n') + ind(16, '.returning();\n')
        + ind(12, "if (!run) return { statusCode: 409, headers: HEADERS, body: JSON.stringify({ error: 'That export run id is already in use.' }) };\n")), 'the 409 straight after the insert');
    before(post, "if (!run) return { statusCode: 409,", "action: 'export.run'", 'answered before the audit and the file');
});

// ── quotes.mjs ──────────────────────────────────────────────────────────────

const D5 = "if (linesMalformed(data)) return { statusCode: 400, headers, body: JSON.stringify({ error: NOT_LINES, field: 'lineItems' }) };";

test("quotes.mjs: its lines are a list of product lines (D5: 400, naming lineItems) and each product one of this org's — asked after the deal's access checks and before the lines are taken, on a create; over the stored lines, before the merge and the deal's sync, on a save; the create writes nothing for a taken id and answers 409", () => {
    const s = fn('quotes');
    once(s, "import { checkLinks } from './_links.mjs';");
    once(s, "import { productIdsOf } from '../../src/utils/linkIds.js';");
    once(s, QUOTE_SPEC);
    once(s, "const NOT_LINES = 'Each quote line must be a product line, in a list.';");
    order(s,
        "const linesMalformed = (data) => 'lineItems' in data && data.lineItems != null && data.lineItems !== ''",
        "    && (!Array.isArray(data.lineItems) || data.lineItems.some((l) => !l || typeof l !== 'object' || Array.isArray(l)));");
    assert.equal(count(s, D5), 2, "D5's refusal on a create and a save, naming its field");
    assert.equal(count(s, ONE('lined')), 2, "each check's refusal answered");
    assert.equal(count(s, 'checkLinks(QUOTE_LINES,'), 2);
    const post = between(s, "if (event.httpMethod === 'POST') {", "if (event.httpMethod === 'PUT') {");
    order(post,
        ind(12, "if (!access.canRead) return refuse(404, 'Deal not found');"),
        ind(12, "if (!access.canWrite) return refuse(403, 'Forbidden: you can only quote your own or unassigned deals');"),
        ind(12, D5),
        ind(12, "const lined = await checkLinks(QUOTE_LINES, 'lineItems' in data ? { lineItems: productIdsOf(data.lineItems) } : {}, null, orgId);"),
        ind(12, ONE('lined')),
        ind(12, 'const lineItems = Array.isArray(data.lineItems) ? data.lineItems : [];'),
        ind(16, 'return db.insert(quotes).values({ ...basePayload, quoteNumber }).onConflictDoNothing({ target: quotes.id }).returning();'),
        ind(12, "if (!inserted) return { statusCode: 409, headers, body: JSON.stringify({ error: 'That quote id is already in use.' }) };"),
        ind(12, 'await auditAs(orgId, auth.userId, {'));
    const put = between(s, "if (event.httpMethod === 'PUT') {", "if (event.httpMethod === 'DELETE') {");
    order(put,
        ind(12, 'if (!existing) return refuse(404, NOT_FOUND);'),
        ind(12, "if (!access.canWrite) return refuse(403, 'Forbidden: you can only change quotes on your own or unassigned deals');"),
        ind(12, D5),
        ind(12, "const lined = await checkLinks(QUOTE_LINES, 'lineItems' in data ? { lineItems: productIdsOf(data.lineItems) } : {}, { lineItems: productIdsOf(existing.lineItems) }, orgId);"),
        ind(12, ONE('lined')),
        ind(12, 'const merged = {'),
        ind(16, 'await syncToOpportunity(orgId, existing.opportunityId, totals.totalValue);'));
    assert.ok(!put.includes('db.insert('), 'a save never creates a quote');
});

test("D5 (quotes.mjs's own predicate, run): a line that is no object, or lines that are no list, are refused — a null line was a 500, a non-list wiped the lines; an empty value still clears; product lines and custom lines pass", () => {
    const s = fn('quotes');
    const { NOT_LINES, linesMalformed } = new Function(`${between(s, 'const NOT_LINES = ', 'Array.isArray(l)));')}\nreturn { NOT_LINES, linesMalformed };`)();
    assert.equal(NOT_LINES, 'Each quote line must be a product line, in a list.');
    for (const fine of [{}, { lineItems: null }, { lineItems: undefined }, { lineItems: '' }, { lineItems: [] },
        { lineItems: [{ productId: 'p1', qty: 2 }, { description: 'Custom', unitPrice: 5 }] }, { status: 'Sent' }]) {
        assert.equal(linesMalformed(fine), false, JSON.stringify(fine));
    }
    for (const bad of [{ lineItems: [null] }, { lineItems: [{ productId: 'p1' }, null] }, { lineItems: ['p1'] }, { lineItems: [7] }, { lineItems: [undefined] },
        { lineItems: [[{ productId: 'p1' }]] }, { lineItems: 'x' }, { lineItems: { productId: 'p1' } }, { lineItems: 0 }, { lineItems: true }]) {
        assert.equal(linesMalformed(bad), true, JSON.stringify(bad));
    }
});

// ── automations.mjs ─────────────────────────────────────────────────────────

test("automations.mjs: a rule's create-task assignee is a member of this org — asked after the actions' 400 and before the insert, on a create; on an edit only when it names actions: the rule read in this org (org first), one it does not hold 404, then asked over the assignees it holds — before the update; a toggle reads nothing", () => {
    const s = fn('automations');
    once(s, "import { checkLinks } from './_links.mjs';");
    once(s, "import { assigneesOf } from '../../src/utils/linkIds.js';");
    once(s, RULE_SPEC);
    assert.equal(count(s, ONE('assigned')), 2, "each check's refusal answered");
    assert.equal(count(s, 'checkLinks(RULE_LINKS,'), 2);
    const post = between(s, "if (event.httpMethod === 'POST') {", "if (event.httpMethod === 'PUT') {");
    order(post,
        ind(12, 'if (!Array.isArray(data.actions) || data.actions.length === 0) {'),
        ind(12, 'const assigned = await checkLinks(RULE_LINKS, { actions: assigneesOf(data.actions) }, null, orgId);'),
        ind(12, ONE('assigned')),
        ind(12, 'const [inserted] = await db.insert(automations).values({'));
    const put = between(s, "if (event.httpMethod === 'PUT') {", "if (event.httpMethod === 'DELETE') {");
    order(put,
        ind(12, "if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };"),
        ind(12, "if ('actions' in data) {"),
        ind(16, 'const [held] = await db.select({ actions: automations.actions }).from(automations)'),
        ind(20, '.where(and(eq(automations.orgId, orgId), eq(automations.id, data.id))).limit(1);'),
        ind(16, "if (!held) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };"),
        ind(16, 'const assigned = await checkLinks(RULE_LINKS, { actions: assigneesOf(data.actions) }, { actions: assigneesOf(held.actions) }, orgId);'),
        ind(16, ONE('assigned')),
        ind(12, '}'),
        ind(12, 'const updates = { updatedAt: new Date() };'),
        ind(12, 'const [updated] = await db'));
    assert.ok(put.includes(ind(12, "if ('actions' in data) {\n") + ind(16, 'const [held] = await db.select({ actions: automations.actions }).from(automations)\n')),
        'the read is behind the guard: a toggle ({ id, active }) names no actions and reads nothing');
});

// ── THE GUARD: what saveDroppingRefused never leaves off (design §3.3) ──────

// A call's arguments, split at its top level — read through strings, templates (and what they hold), comments and
// nested brackets. Throws on what it cannot read: the scan then fails rather than passes.
function argsAt(src, open) {
    const args = [];
    const stack = [];
    let cur = '';
    for (let i = open + 1; i < src.length; i++) {
        const c = src[i];
        if (stack[stack.length - 1] === '`') {
            if (c === '\\') { cur += c + src[++i]; continue; }
            if (c === '`') stack.pop();
            else if (c === '$' && src[i + 1] === '{') { stack.push('}'); cur += c + src[++i]; continue; }
            cur += c;
            continue;
        }
        if (c === "'" || c === '"') {
            let j = i + 1;
            while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
            cur += src.slice(i, j + 1);
            i = j;
            continue;
        }
        if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) break; cur += '\n'; continue; }
        if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 1; if (i <= 0) break; continue; }
        if (c === '`') stack.push('`');
        else if (c === '(' || c === '[' || c === '{') stack.push({ '(': ')', '[': ']', '{': '}' }[c]);
        else if (c === ')' || c === ']' || c === '}') {
            if (!stack.length) {
                if (c !== ')') throw new Error(`unbalanced ${c} at ${i}`);
                args.push(cur);
                return args.map((a) => a.trim());
            }
            if (stack.pop() !== c) throw new Error(`unbalanced ${c} at ${i}`);
        } else if (c === ',' && !stack.length) { args.push(cur); cur = ''; continue; }
        cur += c;
    }
    throw new Error('a call with no end');
}
// Each call of `name` in src (its declaration is none).
const callsOf = (src, name) => {
    const calls = [];
    for (let i = src.indexOf(`${name}(`); i >= 0; i = src.indexOf(`${name}(`, i + 1)) {
        if (/[\w$]/.test(src[i - 1] || '') || /\bfunction\s*$/.test(src.slice(Math.max(0, i - 30), i))) continue;
        calls.push({ at: i, args: argsAt(src, i + name.length) });
    }
    return calls;
};
// A list of fields to leave off that the scan can read where it is called: an array, or a choice between two.
const READABLE = /^(?:[\w$.]+\s*\?\s*)?\[[^[\]]*\](?:\s*:\s*\[[^[\]]*\])?$/;
const keysOf = (droppable) => [...droppable.matchAll(/'([^']*)'|"([^"]*)"/g)].map((m) => m[1] ?? m[2]);
// It sends a field it leaves off as null: a quote's lines (a new version stored with none), a rule's actions (its NOT
// NULL), a member's pins (every pin gone).
const NEVER_DROPPED = ['lineItems', 'actions', 'pinnedReports'];
const srcFiles = (dir) => readdirSync(new URL(dir, ROOT), { withFileTypes: true }).flatMap((e) =>
    (e.isDirectory() ? srcFiles(`${dir}${e.name}/`) : /\.(jsx?|mjs)$/.test(e.name) ? [`${dir}${e.name}`] : []));

test('the scan reads a call as written — its arguments split at the top level, through strings, templates, comments and nested calls — finds a field it must never leave off, and refuses a list it cannot read', () => {
    const [a] = callsOf("x = await saveDroppingRefused(async (b) => { const t = `a, ${f(b, ')')}`; // a, b)\n return g(b, 'x, y'); }, body, copied ? ['accountId', 'opportunityId'] : ['accountId']);", 'saveDroppingRefused');
    assert.equal(a.args.length, 3);
    assert.deepEqual(a.args.slice(1), ['body', "copied ? ['accountId', 'opportunityId'] : ['accountId']"]);
    assert.ok(READABLE.test(a.args[2]));
    assert.deepEqual(keysOf(a.args[2]), ['accountId', 'opportunityId', 'accountId']);
    const [q] = callsOf("saveDroppingRefused(send, quote, ['lineItems'])", 'saveDroppingRefused');
    assert.ok(READABLE.test(q.args[2]) && keysOf(q.args[2]).includes('lineItems'), 'a quote line list it leaves off is found');
    const [v] = callsOf('saveDroppingRefused(send, body, DROPPABLE)', 'saveDroppingRefused');
    assert.ok(!READABLE.test(v.args[2]), 'a list kept in a name is not read here — refused');
    assert.deepEqual(callsOf('export async function saveDroppingRefused(send, body, droppable) {', 'saveDroppingRefused'), [], 'its declaration is no call');
});

test("THE GUARD (design §3.3): no screen hands saveDroppingRefused a quote's lines, a rule's actions or a member's pins to leave off — each caller's list is written where it calls, and names none of them", () => {
    const found = [];
    for (const file of srcFiles('src/')) for (const call of callsOf(code(read(file)), 'saveDroppingRefused')) found.push({ file, ...call });
    for (const known of ['src/components/rails/TaskRail.jsx', 'src/Tabs/DispatchTab.jsx']) {
        assert.ok(found.some((c) => c.file === known), `the scan reads ${known}'s call (a scan that reads none proves nothing)`);
    }
    for (const c of found) {
        assert.equal(c.args.length, 3, `${c.file}: send, the body, the fields it may leave off`);
        assert.ok(READABLE.test(c.args[2]), `${c.file}: its list is written where it calls — ${c.args[2]}`);
        const keys = keysOf(c.args[2]);
        assert.ok(keys.length > 0, `${c.file}: names the fields`);
        for (const k of NEVER_DROPPED) assert.ok(!keys.includes(k), `${c.file}: never leaves off ${k} — it would be sent as null`);
    }
});

// ── the screens ─────────────────────────────────────────────────────────────

const smt = () => code(read('src/Tabs/SalesManagerTab.jsx'));

test("a claim's Delete: every claim, every status, for whoever the tab shows (an Admin or a Manager) — no role gate on the screen; confirmed as a delete; the id encoded; each Delete holds its own row (a Set) while it is out, released in a finally — a refused one too; an answer after an org switch changes nothing; a refusal says the server's words, a lost answer to reload and see; the row leaves only once the server deleted it", () => {
    const m = smt();
    const admin = between(m, 'function AdminTab({', '\n}\n');
    const HOLD = '    const [deletingIds, setDeletingIds] = useState(() => new Set());';
    const DELETE = "    const deleteClaim = (claim) => showConfirm(`Delete ${claim.repName || 'this rep'}'s ${claim.spiffName || 'SPIFF'} claim (${claim.status || 'pending'})? This cannot be undone.`, async () => {";
    order(admin, HOLD, DELETE);
    const head = admin.slice(0, admin.indexOf(HOLD));
    assert.ok(!head.split('\n').some((l) => /^ {4}(if|return)\b/.test(l)), "a hook at AdminTab's top level — nothing returns before it");
    const del = between(m, '    const deleteClaim = (claim) => showConfirm(', '\n    }, true);');
    order(del,
        DELETE,
        ind(8, 'const askedOrg = requestOrg();'),
        ind(8, 'setDeletingIds(s => new Set(s).add(claim.id));'),
        ind(12, "const res = await dbFetch(`/.netlify/functions/spiff-claims?id=${encodeURIComponent(claim.id)}`, { method: 'DELETE' });"),
        ind(12, 'const d = await res.json().catch(() => ({}));'),
        ind(12, 'if (!stillOrg(askedOrg)) return;'),
        ind(12, "if (!res.ok) { setSaveState({ status: 'error', msg: claimRefused('deleted', d, res.status) }); return; }"),
        ind(12, 'setSpiffClaims(prev => prev.filter(c => c.id !== claim.id));'),
        ind(12, "setSaveState({ status: 'saved', msg: '' });"),
        ind(8, '} catch (err) {'),
        ind(12, "if (stillOrg(askedOrg)) setSaveState({ status: 'error', msg: claimUnanswered('deleted') });"),
        ind(8, '} finally {'),
        ind(12, 'setDeletingIds(s => { const n = new Set(s); n.delete(claim.id); return n; });'),
        ind(8, '}'),
        '    }, true);');
    assert.ok(!/isAdmin|isManager|userRole|canEditIncentives/.test(del), 'the handler asks no role: the server decides (a rep is 403)');
    assert.equal(count(del, 'setSpiffClaims('), 1, 'the row leaves once, after the server deleted it — a refused Delete keeps it');
    assert.ok(!/\b(?:set)?[dD]eletingId\b/.test(m), "REGRESSION: one hold for every Delete — a second Delete's answer freed the first's row (review F3)");
    const list = between(m, ind(20, 'return filtered.map((claim,ci) => ('), ind(16, '})()}'));
    order(list,
        ind(28, "{claim.status==='pending' && ("),
        ind(28, ')}'),
        ind(28, '<button onClick={()=>deleteClaim(claim)} disabled={deletingIds.has(claim.id)} title="Delete this claim"'),
        ind(32, "style={{ padding:'1px 7px', background:'transparent', color:T.danger, border:`1px solid ${T.danger}`, borderRadius:T.r, fontSize:10, fontWeight:600, cursor:deletingIds.has(claim.id)?'default':'pointer', opacity:deletingIds.has(claim.id)?0.6:1, fontFamily:T.sans }}>{deletingIds.has(claim.id) ? 'Deleting…' : 'Delete'}</button>"));
    assert.ok(!/isAdmin|isManager|canEditIncentives|userRole/.test(list), 'no role gate around the button — after the pending block, so every status');
    assert.equal(count(m, 'onClick={()=>deleteClaim(claim)}'), 1);
    assert.equal(count(m, 'setSpiffClaims(prev => prev.filter(c => c.id !== claim.id));'), 2, "a row leaves in two places: the Delete's, once deleted, and Approve's 404 — a claim deleted since");
});

test("the SPIFF board's Active / Inactive control: a component at module scope (one made inside the tab remounts every render), two segments writing a boolean into the board's draft, saved by Save SPIFFs; named for its SPIFF, so a screen reader tells each apart; an inactive SPIFF dimmed, with its caption; disabled for a Manager, and looking it", () => {
    const m = smt();
    const DECL = '\nfunction SpiffStatus({ name, active, disabled, onChange }) {\n';
    const at = m.indexOf(DECL);
    assert.ok(at > 0, 'declared at the top level, column 0');
    const words = m.indexOf('\nconst claimRefused = (done, d, status) => (');
    assert.ok(words > 0 && words < at && m.slice(0, words).trimEnd().endsWith('\n}'), 'after the module-level function before it has closed, and the claim words');
    assert.deepEqual(m.slice(words + 1, at).split('\n').filter((l) => /^\S/.test(l)).map((l) => l.slice(0, l.indexOf(' = ('))),
        ['const claimRefused', 'const claimUnanswered'], 'nothing else at column 0 between them — each a module-scope declaration');
    assert.ok(at < m.indexOf('\nfunction AdminTab({'), 'above AdminTab, outside it');
    assert.ok(!between(m, 'function AdminTab({', '\n}\n').includes('function SpiffStatus'), 'never declared inside the tab');
    const comp = between(m, DECL, '\n}\n');
    order(comp,
        ind(8, '<button type="button" disabled={disabled} aria-pressed={active === value}'),
        ind(12, 'onClick={() => { if (!disabled && active !== value) onChange(value); }}'),
        ind(8, "<div role=\"group\" aria-label={`${name || 'SPIFF'} status`} style={{ display:'inline-flex', border:`1px solid ${T.border}`, borderRadius:999, overflow:'hidden', background:T.surface, opacity: disabled ? 0.55 : 1 }}>"),
        ind(12, "{opt(true, 'Active')}{opt(false, 'Inactive')}"));
    assert.ok(!/useState|dbFetch|editSpiffs/.test(comp), 'it holds no state and saves nothing: the board does');
    order(m,
        ind(36, '<SpiffStatus name={spiff.name} active={!!spiff.active} disabled={!canEditIncentives}'),
        ind(40, 'onChange={v => editSpiffs(spiffList.map((s,i)=>i===si?{...s,active:v}:s))}/>'),
        ind(32, '{!spiff.active && ('),
        ind(36, '<div style={{ marginTop:6, fontSize:10, color:T.inkMuted, fontFamily:T.sans }}>Inactive — not offered to reps. Claims already filed can still be approved.</div>'));
    assert.equal(count(m, 'opacity:spiff.active?1:0.62'), 2, 'the row and its description dimmed — the caption is not');
    assert.ok(!m.includes('checked={!!spiff.active}'), 'the checkbox it replaces is gone');
    assert.ok(!m.includes('aria-label="SPIFF status"'), "REGRESSION: every SPIFF's control named alike (review F8)");
});

test("a claim's Approve and Reject send only the change (D2) and say the server's words (claimRefused) — a claim deleted since the list loaded is the server's 404, and its row goes; a lost answer says to reload and see, and only in the org it was asked in; while the claim's Delete is out they are held, and look it; Reject is not red — red is only for delete", () => {
    const m = smt();
    const upd = between(m, '    const updateClaimStatus = async (claim, status) => {', '\n    };');
    order(upd,
        ind(8, 'const approvedAt = new Date().toISOString(), approvedBy = currentUser;'),
        ind(16, "method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: claim.id, status, approvedAt, approvedBy }),"),
        ind(12, 'const d = await res.json().catch(() => ({}));'),
        ind(12, 'if (!stillOrg(askedOrg)) return;'),
        ind(12, 'if (!res.ok) {'),
        ind(16, 'if (res.status === 404) setSpiffClaims(prev => prev.filter(c => c.id !== claim.id));'),
        ind(16, "setSaveState({ status: 'error', msg: claimRefused('saved', d, res.status) });"),
        ind(16, 'return;'),
        ind(12, '}'),
        ind(12, 'setSpiffClaims(prev => prev.map(c => c.id === claim.id ? u : c));'),
        ind(12, "setSaveState({ status: 'saved', msg: '' });"),
        ind(8, '} catch (err) {'),
        ind(12, "if (stillOrg(askedOrg)) setSaveState({ status: 'error', msg: claimUnanswered('saved') });"));
    assert.ok(upd.includes('const u = { ...claim, status, approvedAt, approvedBy };'), "the list's own copy takes the same change");
    assert.ok(!upd.includes('JSON.stringify(u)'), 'REGRESSION: the whole claim sent — a stale copy put back');
    assert.ok(!m.includes('only Admins can approve'), 'the server says who may');
    order(m,
        ind(36, "<button onClick={()=>updateClaimStatus(claim,'approved')} disabled={deletingIds.has(claim.id)}"),
        ind(40, "style={{ padding:'2px 8px', background:T.ok, color:'#fff', border:'none', borderRadius:T.r, fontSize:10, fontWeight:700, cursor:deletingIds.has(claim.id)?'default':'pointer', opacity:deletingIds.has(claim.id)?0.6:1, fontFamily:T.sans }}>✓ Approve</button>"),
        ind(36, "<button onClick={()=>updateClaimStatus(claim,'rejected')} disabled={deletingIds.has(claim.id)}"),
        ind(40, "style={{ padding:'1px 7px', background:'transparent', color:T.ink, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:10, fontWeight:700, cursor:deletingIds.has(claim.id)?'default':'pointer', opacity:deletingIds.has(claim.id)?0.6:1, fontFamily:T.sans }}>✕ Reject</button>"));
    assert.equal(count(m, "cursor:deletingIds.has(claim.id)?'default':'pointer', opacity:deletingIds.has(claim.id)?0.6:1,"), 3, 'Approve, Reject and Delete each look held while the Delete is out (review F4)');
    const reject = m.split('\n').filter((l) => l.includes('✕ Reject'));
    assert.equal(reject.length, 1);
    assert.ok(!reject[0].includes('T.danger'), 'REGRESSION: Reject filled red');
});

// The claim actions' words, as SalesManagerTab.jsx writes them — module scope, beside SpiffStatus (state §0.204).
const CLAIM_REFUSED = [
    "const claimRefused = (done, d, status) => (status < 500",
    "    ? `Not ${done} \\u2014 ${d?.error || `the server returned ${status}`}${d?.requestId ? ` (ref ${d.requestId})` : ''}`",
    "    : `The server returned ${status}${d?.error ? ` \\u2014 ${d.error}${d.requestId ? ` (ref ${d.requestId})` : ''}` : ''}. Reload the page to see whether the claim was ${done}.`);",
];
const CLAIM_UNANSWERED = "const claimUnanswered = (done) => `No answer from the server \\u2014 reload the page to see whether the claim was ${done}.`;";

test("the claim actions' words, run as written: a refusal says 'Not saved' / 'Not deleted' and the server's words, with its log ref when it sent one; a server error (5xx), or an answer with no words, says the status and to reload and see — the write may have landed; a lost answer says to reload and see, never 'unchanged'; at module scope, and Approve, Reject and Delete each say them (review F2, F6)", () => {
    const m = smt();
    order(m, ...CLAIM_REFUSED, CLAIM_UNANSWERED);
    for (const line of [...CLAIM_REFUSED, CLAIM_UNANSWERED]) once(m, line);
    const at = m.indexOf(`\n${CLAIM_REFUSED[0]}\n`);
    assert.ok(at > 0 && at < m.indexOf('\nfunction AdminTab({'), 'column 0, above AdminTab');
    assert.ok(!between(m, 'function AdminTab({', '\n}\n').includes('const claimRefused'), 'never declared inside the tab');
    const { claimRefused, claimUnanswered } = new Function(`${[...CLAIM_REFUSED, CLAIM_UNANSWERED].join('\n')}\nreturn { claimRefused, claimUnanswered };`)();
    assert.equal(claimRefused('saved', { error: 'Only managers and admins can approve or reject claims' }, 403), 'Not saved — Only managers and admins can approve or reject claims');
    assert.equal(claimRefused('saved', { error: 'Claim not found in your organization' }, 404), 'Not saved — Claim not found in your organization', 'a claim deleted since the list loaded');
    assert.equal(claimRefused('deleted', { error: 'id required', requestId: 'req_4' }, 400), 'Not deleted — id required (ref req_4)');
    assert.equal(claimRefused('saved', { error: 'Internal server error', requestId: 'req_5' }, 500),
        'The server returned 500 — Internal server error (ref req_5). Reload the page to see whether the claim was saved.',
        "a 500 is not 'not saved' — the write may have landed; its ref finds the function's log line");
    assert.equal(claimRefused('saved', { error: 'Internal server error' }, 500), 'The server returned 500 — Internal server error. Reload the page to see whether the claim was saved.');
    assert.equal(claimRefused('deleted', {}, 502), 'The server returned 502. Reload the page to see whether the claim was deleted.', 'a gateway error with no words');
    assert.equal(claimRefused('saved', {}, 403), 'Not saved — the server returned 403', 'a refusal with no words of its own writes nothing: not done, never "reload and see"');
    assert.equal(claimUnanswered('deleted'), 'No answer from the server — reload the page to see whether the claim was deleted.', 'a lost answer: the delete may have landed');
    assert.ok(!m.includes('The claim is unchanged'), "REGRESSION: a lost answer read 'unchanged' — the write may have landed (review F2)");
    assert.equal(count(m, 'claimRefused('), 2, 'Approve / Reject and Delete');
    assert.equal(count(m, 'claimUnanswered('), 2, 'Approve / Reject and Delete');
});

test("D3: a claim with no amount reads a dash — it threw there and took the whole tab down, so no Delete could be reached; a multiplier claim with no multiplier reads a dash too, never 'null×' (the line, run as written)", () => {
    const m = smt();
    const line = ind(32, "{claim.spiffType==='multiplier'?(claim.multiplier == null ? '—' : `${claim.multiplier}×`):claim.amount == null ? '—' : `$${claim.amount.toLocaleString()}`}");
    once(m, line);
    assert.ok(!m.includes(":`$${claim.amount.toLocaleString()}`}"), 'REGRESSION: the amount read with no guard');
    assert.ok(!m.includes("?`${claim.multiplier}×`:"), 'REGRESSION: the multiplier read with no guard');
    const shown = new Function('claim', `return ${line.trim().slice(1, -1)};`);
    assert.equal(shown({ spiffType: 'flat', amount: null }), '—');
    assert.equal(shown({ spiffType: 'flat' }), '—', 'no amount at all');
    assert.equal(shown({ spiffType: 'flat', amount: '500.00' }), '$500.00', 'the decimal arrives as text and reads as before');
    assert.equal(shown({ spiffType: 'flat', amount: 1500 }), `$${(1500).toLocaleString()}`);
    assert.equal(shown({ spiffType: 'multiplier', multiplier: 2, amount: null }), '2×');
    assert.equal(shown({ spiffType: 'multiplier', multiplier: null }), '—', "no multiplier: a dash, not 'null×' (review F12)");
    assert.equal(shown({ spiffType: 'multiplier' }), '—', "nor 'undefined×'");
});

test("New version: a refusal says the server's words (the banner reads quoteModalError) — none of its own, and the last error cleared first; the copied lines are sent as they are, so a product that names nothing here refuses the version, never drops the line", () => {
    const q = code(read('src/Tabs/QuotesTab.jsx'));
    const nv = between(q, '    const handleNewVersion = async () => {', '\n    };');
    order(nv,
        ind(8, 'setSaving(true); setError(null);'),
        ind(16, 'lineItems: (source.lineItems || []).map(li => ({ ...li })),'),
        ind(12, 'const saved = await handleSaveQuote(payload, null);'),
        ind(12, 'if (!saved) return;'));
    assert.ok(!nv.includes('Could not create the new version'), "REGRESSION: a line of its own over the server's words");
    assert.ok(!nv.includes('saveDroppingRefused'), 'a copied line is never left off');
});

test('the suites: this file is graded by the harness', () => {
    // The SUITES value itself, never the whole harness: three comment lines there naming this file met the old pin with
    // the file gone from SUITES (§0.204 review P1).
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/sales-links.test.mjs'), 'SUITES runs this file');
});

// A suite's "graded by the harness" pin, class-wide (§0.204 review P1): one that looked for its path anywhere in the
// harness was met by any comment naming it — three suites' were, this file's among them. Each reads the SUITES value.
const SELF_PIN = /\.includes\(\s*' ?tests\/[\w.-]+\.test\.mjs'\s*\)/g;
const SUITES_PARSE = ".match(/^const SUITES = '([^'\\n]*)';$/m)?.[1].split(' ') ?? [];";

test("the suites: every suite's 'graded by the harness' pin reads the SUITES value, never the whole harness — a comment there naming a suite met the old pin (review P1, class-wide)", () => {
    const pins = [];
    for (const f of readdirSync(new URL('tests/', ROOT)).filter((n) => n.endsWith('.test.mjs'))) {
        const src = code(read(`tests/${f}`));
        if (!src.includes('mutate-import.mjs')) continue;
        for (const hit of src.matchAll(SELF_PIN)) {
            const from = src.lastIndexOf('\n', hit.index) + 1;
            pins.push({ f, src, line: src.slice(from, src.indexOf('\n', hit.index)).trim() });
        }
    }
    assert.ok(pins.length >= 14, `the scan finds the suites' pins — fourteen since §0.206 (a scan that finds none proves nothing): ${pins.length}`);
    for (const { f, src, line } of pins) {
        assert.equal(line, `assert.ok(suites.includes('tests/${f}'), 'SUITES runs this file');`, `${f}: its own path, looked for in the SUITES value`);
        assert.ok(src.includes(SUITES_PARSE), `${f}: suites is the SUITES line's value, split on spaces`);
    }
});

test("a Manager's claims list is their own team's reps' claims, as the quota board's reps are; an Admin's is every claim (Jeff, 16 Oct: \"Narrow to their team\" — the Delete is for good); a claim names its rep by name, compared trimmed and in any case (the rule, run as written)", () => {
    const m = smt();
    const NAMES = ind(4, "const teamRepNames = new Set(visibleReps.map(u => String(u.name ?? '').trim().toLowerCase()));");
    const IN_VIEW = ind(4, "const claimInView = (c) => isAdmin || teamRepNames.has(String(c.repName ?? '').trim().toLowerCase());");
    const LIST = ind(20, "const filtered = spiffClaims.filter(c=>claimInView(c)&&(filter==='all'||c.status===filter)).sort((a,b)=>new Date(b.claimedAt)-new Date(a.claimedAt));");
    const tab = between(m, 'function AdminTab({', '\n}\n');
    order(tab, NAMES, IN_VIEW, LIST);
    once(m, NAMES); once(m, IN_VIEW); once(m, LIST);
    assert.equal(count(m, 'spiffClaims.filter('), 1, 'the one list of claims on screen reads the claims in view');
    const inView = (isAdmin, visibleReps) => new Function('isAdmin', 'visibleReps', `${NAMES.trim()}\n${IN_VIEW.trim()}\nreturn claimInView;`)(isAdmin, visibleReps);
    const east = [{ name: 'Karen Russell' }, { name: 'Ravi Shah ' }];
    const mgr = inView(false, east);
    assert.equal(mgr({ repName: 'Karen Russell' }), true, "a Manager's own team's rep");
    assert.equal(mgr({ repName: '  karen russell ' }), true, 'trimmed and in any case, as the claims endpoint compares');
    assert.equal(mgr({ repName: 'Ravi Shah' }), true);
    assert.equal(mgr({ repName: 'Wes West' }), false, "REGRESSION: another team's claim in a Manager's list — and its Delete, for good");
    assert.equal(mgr({ repName: null }), false, 'a claim naming no rep is no team rep');
    assert.equal(inView(false, [])({ repName: 'Karen Russell' }), false, 'a Manager with no team sees no claims, as the quota board shows them no reps');
    assert.equal(inView(true, [])({ repName: 'Wes West' }), true, 'an Admin sees every claim');
});

test("a Manager's claims list is their team's because the reps the Admin tab is handed are (re-check S1 — each break below survived every suite): visibleReps, run as written on made-up members — a Manager sees their own team's Sales Reps, by team id or by the team's name where a member has no id, and none on no team; an Admin every Sales Rep; and the Admin tab is handed exactly these, with the caller's own isAdmin", () => {
    const m = smt();
    const COMMON = between(m, '    const allUsers      = (settings.users||[])', '\n    );\n');
    order(COMMON,
        ind(4, "const allUsers      = (settings.users||[]).filter(u => u.name && u.userType !== 'ReadOnly');"),
        ind(4, 'const currentUserObj = allUsers.find(u => u.name === currentUser);'),
        ind(4, "const allReps       = allUsers.filter(u => u.userType === 'User');"),
        ind(4, 'const visibleReps   = isAdmin ? allReps : allReps.filter(u =>'),
        ind(8, '(currentUserObj?.teamId && u.teamId === currentUserObj?.teamId) ||'),
        ind(8, '(currentUserObj?.team   && u.team   === currentUserObj?.team)'),
        ind(4, ');'));
    once(m, ind(4, 'const visibleReps   = isAdmin ? allReps : allReps.filter(u =>'));
    const repsFor = (settings, currentUser, isAdmin) => new Function('settings', 'currentUser', 'isAdmin', `${COMMON}\nreturn visibleReps.map(u => u.name);`)(settings, currentUser, isAdmin);
    const users = [
        { name: 'Ada Admin', userType: 'Admin' },
        { name: 'Max East', userType: 'Manager', teamId: 't_east', team: 'East' },
        { name: 'Nan Solo', userType: 'Manager' },
        { name: 'Karen Russell', userType: 'User', teamId: 't_east', team: 'East' },
        { name: 'Ravi Shah', userType: 'User', team: 'East' },
        { name: 'Wes West', userType: 'User', teamId: 't_west', team: 'West' },
        { name: 'Rita Readonly', userType: 'ReadOnly', teamId: 't_east', team: 'East' },
    ];
    assert.deepEqual(repsFor({ users }, 'Max East', false), ['Karen Russell', 'Ravi Shah'], "REGRESSION: a Manager's reps are not their own team's — West's claims in their list, each with a Delete for good");
    assert.deepEqual(repsFor({ users }, 'Nan Solo', false), [], 'a Manager on no team: no reps, so no claims');
    assert.deepEqual(repsFor({ users }, 'Ada Admin', true), ['Karen Russell', 'Ravi Shah', 'Wes West'], 'an Admin: every Sales Rep');
    const call = between(m, "{subTab === 'admin'    && <AdminTab", 'settingsLoaded={settingsLoaded}');
    order(call,
        ind(16, 'opportunities={opportunities} currentUser={currentUser} isAdmin={isAdmin}'),
        ind(16, 'visibleReps={visibleReps} fyRange={fyRange}'));
});
