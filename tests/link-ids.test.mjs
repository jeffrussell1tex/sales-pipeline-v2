// tests/link-ids.test.mjs
//
// A link names a live row of this org (state §0.199 — batch 4 of OPEN_ITEMS §1 item 1; Jeff, 13 Oct: E1
// "Listed + CRM extras", E2 "Link the survivor", E3 "Org check only", E4 "Clear stray links").
//
// Before: the writes that store a link stored whatever id they were sent — another org's, or one naming
// nothing — on a contact (its account, managers, direct reports), an activity (account, deal, lead,
// contacts), a task (account, deal, contacts), a deal (its contacts), a bulk account row (its parent), a
// dispatch customer (its account) and a dispatch job (customer, location, account, deal); and the five CRM
// creates crashed (500) on an id another org holds. Here: src/utils/linkIds.js, run on made-up rows (what a
// write asks, what it stores, and a save that leaves off a copied link the server refuses); and THE GUARD —
// every write path of every link asks it through netlify/functions/_links.mjs, after the ownership check,
// before the write; the creates answer 409; a bulk create clears a link to its own row that did not land; the
// restore clears what it restored; the screens that copy a link leave off one refused.
// tests/integration/link-ids.itest.mjs proves each against the database, org A's writes refused for org B's
// rows and org B untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    NOUNS, MERGES, MERGE_HOPS, notInOrg, NOT_AN_ID, heldIds, rewritten, liveIds, linksAsked, linksDecided, bulkLinksAsked, bulkLinksDecided,
    saveDroppingRefused,
} from '../src/utils/linkIds.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const fn = (name) => code(read(`netlify/functions/${name}.mjs`));
const count = (s, sub) => s.split(sub).length - 1;
// b after a, both there: an ordering pin of indexOf against indexOf passes when its first text is gone (-1).
const after = (s, a, z) => s.indexOf(a) >= 0 && s.indexOf(z, s.indexOf(a) + a.length) > s.indexOf(a);
// Each text there, each after the one before it — searched from where that one ended: a line that is gone fails it.
const inOrder = (s, ...texts) => { let at = 0; for (const x of texts) { const i = s.indexOf(x, at); if (i < 0) return false; at = i + x.length; } return true; };

// The org: a1 an account, a_old merged into it; c1 a contact, c_old merged into it; d1 a deal. Org B's
// rows (bA, cB, dB) and deleted ones (gone) are no live row of it.
const LIVE = new Map([['a1', 'a1'], ['a_old', 'a1'], ['c1', 'c1'], ['c2', 'c2'], ['c_old', 'c1'], ['d1', 'd1'], ['l1', 'l1']]);
const NOT_FOLLOWED = new Map([['a1', 'a1']]);   // follow: false — a_old is not live
const liveOf = (ask) => (ask.follow === false ? NOT_FOLLOWED : LIVE);
const one = (spec, data, stored) => {
    const asked = linksAsked(spec, data, stored);
    return asked.error ? asked : linksDecided(asked.asks, data, liveOf);
};
const bulk = (spec, rows, opts) => {
    const asked = bulkLinksAsked(spec, rows, opts);
    return asked.error ? asked : bulkLinksDecided(asked.asks, rows, liveOf);
};

const CONTACT = [{ key: 'accountId', kind: 'account' }, { key: 'managers', kind: 'contact', shape: 'chips' }];
const ACTIVITY = [
    { key: 'accountId', kind: 'account' }, { key: 'opportunityId', kind: 'deal' }, { key: 'leadId', kind: 'lead' },
    { key: 'contactIds', kind: 'contact', shape: 'many', heldFrom: ['contactIds', 'contactId'] },
    { key: 'contactId', kind: 'contact', heldFrom: ['contactId', 'contactIds'] },
];
const PARENT = [{ key: 'parentAccountId', kind: 'account', follow: false }];

// ── linkIds.js — run ────────────────────────────────────────────────────────

test('the words name the kind, in the deals endpoint\'s; only accounts and contacts are merged away', () => {
    assert.equal(notInOrg('account'), 'That account is not in your organization — pick one from the list.');
    assert.equal(notInOrg('contact'), 'That contact is not in your organization — pick one from the list.');
    assert.equal(notInOrg('deal'), 'That deal is not in your organization — pick one from the list.');
    assert.equal(notInOrg('lead'), 'That lead is not in your organization — pick one from the list.');
    assert.equal(notInOrg('customer'), 'That customer is not in your organization — pick one from the list.');
    assert.equal(notInOrg('location'), 'That service location is not in your organization — pick one from the list.');
    assert.equal(NOT_AN_ID, 'A link must name a record by its id.');
    assert.deepEqual(Object.keys(NOUNS), ['account', 'contact', 'deal', 'lead', 'customer', 'location', 'technician', 'vehicle', 'equipment', 'plan', 'job', 'product', 'member', 'spiff'],
        "batch 4's six, then Dispatch's five (§0.201 — tests/dispatch-links.test.mjs), then a sales record's three (§0.204 — tests/sales-links.test.mjs)");
    assert.deepEqual([...MERGES], ['account', 'contact']);
});

test('heldIds: the ids a field holds, by its shape — none for an empty value; a chip with no id holds none', () => {
    assert.deepEqual(heldIds('one', 'a1'), ['a1']);
    assert.deepEqual(heldIds('one', ''), []);
    assert.deepEqual(heldIds('one', null), []);
    assert.deepEqual(heldIds('one', 7), [7], 'kept, to be refused as not an id');
    assert.deepEqual(heldIds('many', ['c1', '', null, 'c2']), ['c1', 'c2']);
    assert.deepEqual(heldIds('many', 'c1'), [], 'not a list: none');
    assert.deepEqual(heldIds('chips', [{ id: 'c1', name: 'Lee' }, { name: 'Dana' }, 'c3', null]), ['c1', 'c3']);
});

test('rewritten: each id put through the survivor, duplicates dropped, a chip keeping its other fields', () => {
    const to = (id) => LIVE.get(id) || id;
    assert.equal(rewritten('one', 'a_old', to), 'a1');
    assert.deepEqual(rewritten('many', ['c_old', 'c1', 'c2'], to), ['c1', 'c2'], 'the merged-away one and its survivor are one contact');
    assert.deepEqual(rewritten('chips', [{ id: 'c_old', name: 'Old', primary: true }, { name: 'Dana' }], to), [{ id: 'c1', name: 'Old', primary: true }, { name: 'Dana' }]);
});

test('a single write: a link it names anew is a live row of this org — another org\'s, or a deleted one, refused 404 naming the kind and the field', () => {
    assert.deepEqual(one(CONTACT, { accountId: 'a1' }, null), { set: {} }, 'the org\'s own: stored as sent');
    assert.deepEqual(one(CONTACT, { accountId: 'bA' }, null), { status: 404, error: notInOrg('account'), field: 'accountId' }, "org B's account");
    assert.deepEqual(one(CONTACT, { accountId: 'gone' }, null), { status: 404, error: notInOrg('account'), field: 'accountId' }, 'a deleted one');
    assert.deepEqual(one(CONTACT, { managers: [{ id: 'c1' }, { id: 'cB', name: 'B' }] }, null), { status: 404, error: notInOrg('contact'), field: 'managers' });
    assert.deepEqual(one(ACTIVITY, { opportunityId: 'dB' }, null), { status: 404, error: notInOrg('deal'), field: 'opportunityId' });
    assert.deepEqual(one(ACTIVITY, { leadId: 'lB' }, null), { status: 404, error: notInOrg('lead'), field: 'leadId' });
    assert.deepEqual(one(ACTIVITY, { contactIds: ['c1', 'cB'] }, null), { status: 404, error: notInOrg('contact'), field: 'contactIds' });
    assert.deepEqual(one(CONTACT, { accountId: 7 }, null), { status: 400, error: NOT_AN_ID, field: 'accountId' }, 'not an id');
    assert.deepEqual(one(CONTACT, { managers: 'c1' }, null), { status: 400, error: NOT_AN_ID, field: 'managers' }, 'not a list');
    assert.deepEqual(one(CONTACT, { managers: { id: 'c1' } }, null), { status: 400, error: NOT_AN_ID, field: 'managers' }, 'an object is not a list');
    assert.deepEqual(one(ACTIVITY, { contactIds: [{ id: 'c1' }] }, null), { status: 400, error: NOT_AN_ID, field: 'contactIds' });
});

test('E2: a link to a row merged away is stored as the row it was merged into — a parent is the exception, refused', () => {
    assert.deepEqual(one(CONTACT, { accountId: 'a_old' }, null), { set: { accountId: 'a1' } });
    assert.deepEqual(one(ACTIVITY, { contactIds: ['c_old', 'c2'] }, null), { set: { contactIds: ['c1', 'c2'] } });
    assert.deepEqual(one(CONTACT, { managers: [{ id: 'c_old', name: 'Old' }] }, null), { set: { managers: [{ id: 'c1', name: 'Old' }] } });
    assert.deepEqual(one(PARENT, { parentAccountId: 'a_old' }, null), { status: 404, error: notInOrg('account'), field: 'parentAccountId' }, 'follow: false');
    assert.deepEqual(one(PARENT, { parentAccountId: 'a1' }, null), { set: {} });
});

test('E3: an id the row already holds is never asked again — an untouched link stands, even one deleted since; a key the body does not name is not asked; empty clears', () => {
    const stored = { accountId: 'gone', managers: [{ id: 'cB' }], contactIds: [], contactId: 'gone_c' };
    assert.deepEqual(linksAsked(CONTACT, { accountId: 'gone', phone: '555' }, stored), { asks: [] }, 'held: not asked');
    assert.deepEqual(linksAsked(CONTACT, { phone: '555' }, stored), { asks: [] }, 'not named: not asked');
    assert.deepEqual(linksAsked(CONTACT, { accountId: '' }, stored), { asks: [] }, 'cleared: nothing to ask');
    assert.deepEqual(linksAsked(CONTACT, { accountId: null }, stored), { asks: [] });
    assert.deepEqual(one(CONTACT, { managers: '' }, null), { set: {} }, "'' on a list is a cleared list, no link — not refused (the review, decisions S6)");
    assert.deepEqual(one(ACTIVITY, { contactIds: '' }, null), { set: {} });
    assert.deepEqual(linksAsked(CONTACT, { managers: [{ id: 'cB' }, { id: 'c2' }] }, stored).asks.map((a) => a.fresh), [['c2']], 'only the new chip is asked');
    assert.deepEqual(linksAsked(ACTIVITY, { contactIds: ['gone_c', 'c2'] }, stored).asks.map((a) => [a.key, a.fresh]), [['contactIds', ['c2']]],
        "an older activity's one contact, in contactId, counts as held in its list (heldFrom)");
    assert.deepEqual(linksAsked(ACTIVITY, { contactId: 'gone_c' }, { contactId: null, contactIds: ['gone_c'] }), { asks: [] }, 'and the other way');
    assert.deepEqual(one(CONTACT, { accountId: 'bA' }, { accountId: 'a1' }), { status: 404, error: notInOrg('account'), field: 'accountId' }, 'a changed one is asked');
});

test('a bulk write is refused whole, naming the ids no live row of this org has; a create\'s own rows count as live for the links of their kind only; an overwrite asks only what each row names anew', () => {
    const rows = [{ id: 'n1', accountId: 'a1' }, { id: 'n2', accountId: 'bA' }, { id: 'n3', accountId: 'gone' }];
    assert.deepEqual(bulk(CONTACT, rows), { status: 400, error: notInOrg('account'), field: 'accountId', ids: ['bA', 'gone'] });
    assert.deepEqual(bulk(CONTACT, [{ id: 'n1', accountId: 'a_old' }, { id: 'n2' }]), { rows: [{ id: 'n1', accountId: 'a1' }, { id: 'n2' }] }, 'E2, row by row');
    assert.deepEqual(bulk(PARENT, [{ id: 'p', parentAccountId: null }, { id: 'k', parentAccountId: 'p' }], { also: { kind: 'account', ids: new Set(['p', 'k']) } }).rows.length, 2, "a parent among the batch's own");
    assert.deepEqual(bulk(CONTACT, [{ id: 'm1', managers: [{ id: 'm2' }] }, { id: 'm2' }], { also: { kind: 'contact', ids: new Set(['m1', 'm2']) } }).rows.length, 2, "an org chart among the batch's own");
    assert.deepEqual(bulk(CONTACT, [{ id: 'bA', accountId: 'bA' }], { also: { kind: 'contact', ids: new Set(['bA']) } }),
        { status: 400, error: notInOrg('account'), field: 'accountId', ids: ['bA'] },
        "a contact's own id is no account: another kind's link is asked whatever the batch holds (the review, server S1)");
    assert.deepEqual(bulk(PARENT, [{ id: 'k', parentAccountId: 'a_old' }]), { status: 400, error: notInOrg('account'), field: 'parentAccountId', ids: ['a_old'] });
    const held = new Map([['x1', { id: 'x1', accountId: 'gone' }]]);
    assert.deepEqual(bulk(CONTACT, [{ id: 'x1', accountId: 'gone', notes: 'n' }], { held }), { rows: [{ id: 'x1', accountId: 'gone', notes: 'n' }] }, 'held: kept');
    assert.deepEqual(bulk(CONTACT, [{ id: 'x1', accountId: 'bA' }], { held }), { status: 400, error: notInOrg('account'), field: 'accountId', ids: ['bA'] }, 'changed: asked');
    assert.deepEqual(bulk(CONTACT, [{ id: 'x1', accountId: 5 }]), { status: 400, error: NOT_AN_ID, field: 'accountId', ids: ['x1'] });
    assert.deepEqual(bulk(CONTACT, [{ id: 'x1', managers: '' }]), { rows: [{ id: 'x1', managers: '' }] }, "'' on a list: cleared, not refused");
    assert.deepEqual(bulkLinksAsked(CONTACT, [{ id: 'x1', phone: '1' }]), { asks: [] });
});

test('saveDroppingRefused: a copied link the server refuses as naming nothing is left off, and the save sent again — only the keys named, each once; any other answer stands', async () => {
    const answers = (list) => { const sent = []; return { sent, send: async (body) => { sent.push(body); return list.shift(); } }; };
    let s = answers([{ ok: false, status: 404, field: 'accountId' }, { ok: false, status: 404, field: 'contactId' }, { ok: true }]);
    let r = await saveDroppingRefused(s.send, { notes: 'n', accountId: 'gone', contactId: 'gone_c', opportunityId: 'd1' }, ['opportunityId', 'contactId', 'accountId']);
    assert.deepEqual(r, { answer: { ok: true }, sent: { notes: 'n', accountId: null, contactId: null, opportunityId: 'd1' } });
    assert.equal(s.sent.length, 3, 'one save, then one for each link left off');
    s = answers([{ ok: false, status: 404, field: 'customerId' }]);
    r = await saveDroppingRefused(s.send, { customerId: 'cu_b', accountId: 'a1' }, ['accountId', 'opportunityId']);
    assert.deepEqual([r.answer.field, s.sent.length], ['customerId', 1], 'a link the user picked is never dropped: its refusal stands');
    s = answers([{ ok: false, status: 400, field: 'accountId' }]);
    r = await saveDroppingRefused(s.send, { accountId: 7 }, ['accountId']);
    assert.deepEqual([r.answer.status, s.sent.length], [400, 1], 'not an id (400): said, not dropped');
    s = answers([{ ok: false, status: 404, field: 'accountId' }, { ok: false, status: 404, field: 'accountId' }]);
    r = await saveDroppingRefused(s.send, { accountId: 'gone' }, ['accountId']);
    assert.deepEqual([r.answer.ok, s.sent.length, r.sent.accountId], [false, 2, null], 'each key once: a second refusal of it stands');
    s = answers([undefined]);
    r = await saveDroppingRefused(s.send, { accountId: 'a1' }, ['accountId']);
    assert.deepEqual([r.answer, s.sent.length], [undefined, 1], 'no answer (left early): nothing sent again');
});

// An org's rows as the server's read answers them (in the org): a1 live; a_old merged into a1; a_2hop into
// a_old; c0 → c5 a chain of five hops to a live row, d0 → d6 one of six; loop1 ↔ loop2; to_gone merged into a
// row deleted since; to_b into org B's row (no row of this org).
const chain = (p, n) => Array.from({ length: n + 1 }, (_, i) => [`${p}${i}`, i < n ? { id: `${p}${i}`, mergeArchived: true, mergedIntoId: `${p}${i + 1}` } : { id: `${p}${i}`, mergeArchived: false }]);
const ROWS = new Map([
    ['a1', { id: 'a1', mergeArchived: false }],
    ['a_old', { id: 'a_old', mergeArchived: true, mergedIntoId: 'a1' }],
    ['a_2hop', { id: 'a_2hop', mergeArchived: true, mergedIntoId: 'a_old' }],
    ...chain('c', 5), ...chain('d', 6),
    ['loop1', { id: 'loop1', mergeArchived: true, mergedIntoId: 'loop2' }],
    ['loop2', { id: 'loop2', mergeArchived: true, mergedIntoId: 'loop1' }],
    ['to_gone', { id: 'to_gone', mergeArchived: true, mergedIntoId: 'gone' }],
    ['to_b', { id: 'to_b', mergeArchived: true, mergedIntoId: 'bA' }],
]);
const reader = () => {
    const calls = [];
    return { calls, read: async (ids) => { calls.push(ids); return ids.map((id) => ROWS.get(id)).filter(Boolean); } };
};

test('liveIds: one read for the ids asked — each once, text only; a row of the org is live as itself, one missing is not', async () => {
    const { read, calls } = reader();
    const live = await liveIds(['a1', 'gone', 'a1', '', null, 7, 'bA'], read, { merges: true });
    assert.deepEqual([...live], [['a1', 'a1']]);
    assert.deepEqual(calls, [['a1', 'gone', 'bA']]);
    const none = reader();
    assert.deepEqual([...await liveIds([], none.read, { merges: true })], []);
    assert.deepEqual([...await liveIds(undefined, none.read)], []);
    assert.deepEqual(none.calls, [], 'nothing asked: nothing read');
});

test('E2 — liveIds: a row merged away is the row it was merged into, through rows merged since, up to MERGE_HOPS hops', async () => {
    assert.equal(MERGE_HOPS, 5);
    const { read } = reader();
    const live = await liveIds(['a_old', 'a_2hop', 'c0', 'd0'], read, { merges: true });
    assert.deepEqual([...live], [['a_old', 'a1'], ['a_2hop', 'a1'], ['c0', 'c5']], 'five hops reach c5; six never reach d6');
});

test('liveIds: a walk that ends nowhere names no live row — a loop (each row read once), a survivor gone, one in another org', async () => {
    const { read, calls } = reader();
    assert.deepEqual([...await liveIds(['loop1'], read, { merges: true })], []);
    assert.deepEqual(calls, [['loop1'], ['loop2']], 'the loop is seen, not walked to the limit');
    assert.deepEqual([...await liveIds(['to_gone', 'to_b'], read, { merges: true })], []);
});

test('liveIds: follow: false — a row merged away is not live (a parent); a kind never merged reads no merge', async () => {
    const { read } = reader();
    assert.deepEqual([...await liveIds(['a1', 'a_old'], read, { merges: true, follow: false })], [['a1', 'a1']]);
    assert.deepEqual([...await liveIds(['a_old'], read, { merges: false })], [['a_old', 'a_old']], 'a deal, a lead, a customer: the row itself');
    assert.deepEqual([...await liveIds(['a_old'], read)], [['a_old', 'a_old']], 'merges defaults off');
});

// ── THE GUARD: every write path asks it ─────────────────────────────────────

const SPECS = {
    contacts: ['const CONTACT_LINKS = [', "    { key: 'accountId', kind: 'account' },", "    { key: 'managers', kind: 'contact', shape: 'chips' },", "    { key: 'directReports', kind: 'contact', shape: 'chips' },"],
    activities: ['const ACTIVITY_LINKS = [', "    { key: 'accountId', kind: 'account' },", "    { key: 'opportunityId', kind: 'deal' },", "    { key: 'leadId', kind: 'lead' },",
        "    { key: 'contactIds', kind: 'contact', shape: 'many', heldFrom: ['contactIds', 'contactId'] },", "    { key: 'contactId', kind: 'contact', heldFrom: ['contactId', 'contactIds'] },"],
    tasks: ['const TASK_LINKS = [', "    { key: 'accountId', kind: 'account' },", "    { key: 'opportunityId', kind: 'deal' },",
        "    { key: 'contacts', kind: 'contact', shape: 'chips', heldFrom: ['contacts', 'contactId'] },", "    { key: 'contactId', kind: 'contact', heldFrom: ['contactId', 'contacts'] },"],
    opportunities: ["const DEAL_LINKS = [{ key: 'contactIds', kind: 'contact', shape: 'many' }];"],
    accounts: ["const PARENT_LINK = [{ key: 'parentAccountId', kind: 'account', follow: false }];"],
    'dispatch-customers': ['const CUSTOMER_LINKS = [', "    { key: 'accountId', kind: 'account' },"],
    'dispatch-jobs': ['const JOB_LINKS = [', "    { key: 'customerId', kind: 'customer' },", "    { key: 'locationId', kind: 'location' },", "    { key: 'accountId', kind: 'account' },", "    { key: 'opportunityId', kind: 'deal' },"],
    // A sales record's (§0.204): tests/sales-links.test.mjs runs each, and pins where each is asked.
    'spiff-claims': ["const CLAIM_LINKS = [{ key: 'opportunityId', kind: 'deal' }, { key: 'spiffId', kind: 'spiff' }];"],
    quotes: ["const QUOTE_LINES = [{ key: 'lineItems', kind: 'product', shape: 'many' }];"],
    automations: ["const RULE_LINKS = [{ key: 'actions', kind: 'member', shape: 'many' }];"],
};

test('THE GUARD: each endpoint names its links — the fields batch 4 lists and E1\'s CRM extras', () => {
    for (const [name, lines] of Object.entries(SPECS)) {
        const s = fn(name);
        assert.ok(s.includes("from './_links.mjs';"), name);
        assert.ok(s.includes(lines.join('\n')), `${name}: its links`);
    }
    const l = fn('_links');
    assert.ok(l.includes("import { MERGES, liveIds, linksAsked, linksDecided, bulkLinksAsked, bulkLinksDecided } from '../../src/utils/linkIds.js';"), 'the decisions are the pure module\'s');
    assert.ok(l.includes('const read = (list) => db.select(cols).from(table).where(and(eq(table.orgId, orgId), inArray(table.id, list)));'), 'every read in this org — the merge walk\'s each hop too');
    assert.ok(l.includes('return liveIds(ids, read, { merges, follow });'), 'the walk is liveIds\'s, as run above');
    assert.ok(l.includes('const merges = MERGES.includes(kind);'));
    assert.ok(l.includes('for (const ask of asks) read.set(ask, await liveIdsInOrg(ask.kind, ask.fresh, orgId, { follow: ask.follow }));'), 'each field read as its spec says — a parent not followed');
    assert.equal(count(l, '    if (asked.error) return asked;\n'), 2, 'a value that names no record is refused before any read — one write and a batch');
    assert.equal(count(l, 'db.select('), 7, 'the read; the clean-up\'s count of a mirror, of a list\'s strays and of a required link, and a login\'s member (§0.201); a member and the org\'s SPIFF list, each read apart in idsReadApart (§0.204) — nothing reads around them');
    const ac = read('netlify/functions/accounts.mjs');
    assert.ok(ac.includes("        parentAccountId:   d.parentAccountId   || null,"), 'the parent stored is the parent checked');
    assert.ok(!ac.includes('d.parentId'), "no legacy `parentId` alias: a parent sent so was stored with no check (the review, server S3)");
});

test('THE GUARD: every single write asks checkLinks — a create with nothing held, an update over the stored row, after the ownership check and before the write', () => {
    const at = (s, a, b) => s.indexOf(a) >= 0 && s.indexOf(b, s.indexOf(a)) > s.indexOf(a);   // b after a — the next of it
    const c = fn('contacts');
    assert.ok(c.includes('const linked = await checkLinks(CONTACT_LINKS, data, null, orgId);'));
    assert.ok(c.includes("const newRow = await stampOwnerId(sanitize({ ...data, ...linked.set }), 'contact', { clerkUserId: userId, orgId });"), 'E2: the survivor is what is stored');
    assert.ok(at(c, 'if (forbiddenPut) return forbiddenPut;', 'const linked = await checkLinks(CONTACT_LINKS, data, target, orgId);'));
    assert.ok(at(c, 'const linked = await checkLinks(CONTACT_LINKS, data, target, orgId);', 'const [upserted] = await db.insert(contacts)'));
    assert.ok(c.includes('Object.assign(clean, linked.set);\n            Object.assign(updateData, linked.set);'));
    const a = fn('activities');
    assert.ok(a.includes('const linked = await checkLinks(ACTIVITY_LINKS, data, null, orgId);'));
    assert.ok(at(a, 'if (forbiddenPut) return forbiddenPut;', 'const linked = await checkLinks(ACTIVITY_LINKS, data, target, orgId);'));
    assert.ok(a.includes('const relinked = sanitize({ ...base, ...data, ...linked.set });'), 'contactId follows its list');
    const t = fn('tasks');
    assert.ok(t.includes('const linked = await checkLinks(TASK_LINKS, data, null, orgId);'));
    assert.ok(t.includes("const newRow = await stampOwnerId(sanitize({ ...data, ...linked.set }), 'task', { clerkUserId: userId, orgId });"), 'E2: a new task stores the survivor (the review, tests S6)');
    assert.ok(at(t, 'if (forbiddenPut) return forbiddenPut;', 'const linked = await checkLinks(TASK_LINKS, data, existing, orgId);'));
    assert.ok(at(t, 'Object.assign(data, linked.set);', 'const clean = sanitize({ ...existing, ...data });'), 'before the row is built');
    const o = fn('opportunities');
    assert.ok(o.includes('const people = await checkLinks(DEAL_LINKS, data, null, orgId);'));
    assert.ok(at(o, 'const link = await accountLink(data, existing.accountId, orgId, existing.site, existing.account);', 'const people = await checkLinks(DEAL_LINKS, data, existing, orgId);'), 'after accountLink — itself after the ownership check');
    const dc = fn('dispatch-customers');
    assert.ok(dc.includes('const linked = await checkLinks(CUSTOMER_LINKS, data, priorCust || null, orgId);'), 'the create is an upsert: what it holds is not asked again');
    assert.ok(dc.includes('const linked = await checkLinks(CUSTOMER_LINKS, data, held, orgId);'));
    assert.ok(at(dc, 'const linked = await checkLinks(CUSTOMER_LINKS, data, held, orgId);', 'const updates = { updatedAt: new Date() };'));
    const dj = fn('dispatch-jobs');
    assert.ok(dj.includes('const linked = await checkLinks(JOB_LINKS, data, priorJob || null, orgId);'));
    const putCheck = '            const linked = await checkLinks(JOB_LINKS, data, current, orgId);\n'
        + '            if (linked.error) return { statusCode: linked.status, headers, body: JSON.stringify({ error: linked.error, field: linked.field }) };\n'
        + '            Object.assign(data, linked.set);\n';
    assert.ok(after(dj, putCheck, 'scalarFields.forEach(f => { if (f in data) updates[f] = data[f]; });'), "a job update's survivor stored before its fields are copied into the update (the review, tests S7)");
});

test('THE GUARD: every check answers its refusal and stores what it decided — each write path, counted', () => {
    const ONE = (v) => `if (${v}.error) return { statusCode: ${v}.status, headers, body: JSON.stringify({ error: ${v}.error, field: ${v}.field }) };`;
    const BULK = (v) => `if (${v}.error) return { statusCode: ${v}.status, headers, body: JSON.stringify({ error: ${v}.error, field: ${v}.field, ids: ${v}.ids }) };`;
    for (const [name, v, single, bulkN] of [
        ['contacts', 'linked', 2, 2], ['activities', 'linked', 2, 0], ['tasks', 'linked', 2, 0], ['opportunities', 'people', 2, 2],
        ['accounts', 'parents', 0, 2], ['dispatch-customers', 'linked', 2, 0], ['dispatch-jobs', 'linked', 2, 0],
        // a sales record's (§0.204): a claim's create and save, a quote's, a rule's — none takes a batch
        ['spiff-claims', 'linked', 2, 0], ['quotes', 'lined', 2, 0], ['automations', 'assigned', 2, 0],
    ]) {
        const s = fn(name);
        assert.equal(count(s, ONE(v)), single, `${name}: each single write's refusal is answered`);
        assert.equal(count(s, BULK(v)), bulkN, `${name}: each bulk write's refusal is answered, naming the ids`);
    }
    assert.equal(count(fn('dispatch-customers'), 'Object.assign(data, linked.set);'), 2, 'a customer create and update store the survivor');
    assert.equal(count(fn('dispatch-jobs'), 'Object.assign(data, linked.set);'), 2, 'a job create and update store the survivor');
    assert.equal(count(fn('tasks'), 'Object.assign(data, linked.set);'), 1);
    assert.equal(count(fn('opportunities'), 'Object.assign(data, people.set);'), 1);
    assert.ok(fn('opportunities').includes('const named = { ...data, ...people.set };'), "a new deal's contacts, the survivor of one merged away");
    assert.ok(fn('activities').includes("for (const k of Object.keys(relinked)) if (k !== 'id' && k in updateData) { clean[k] = relinked[k]; updateData[k] = relinked[k]; }"), 'an activity update stores the survivor, contactId with its list');
    const dc = fn('dispatch-customers');
    assert.ok(dc.includes('if (CUSTOMER_LINKS.some((l) => l.key in data)) {'), "a customer update naming its account is asked — or another of its links (§0.201)");
    assert.ok(dc.includes('const [priorCust] = await db.select({ customerNumber: dispatchCustomers.customerNumber, accountId: dispatchCustomers.accountId,'), 'the account the customer holds is read with its number');
});

test('THE GUARD: every bulk write asks checkBulkLinks for the batch, before anything is written — an overwrite against the stored rows; a create clears, after its insert, a link to its own row that did not land', () => {
    const c = fn('contacts');
    assert.ok(c.includes('const taken = new Set((await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.orgId, orgId), inArray(contacts.id, batchIds)))).map(r => r.id));'), 'the batch ids this org already holds, read in this org');
    assert.ok(c.includes("const linked = await checkBulkLinks(CONTACT_LINKS, data, orgId, { also: { kind: 'contact', ids: new Set(batchIds.filter(id => !taken.has(id))) } });"),
        "the batch's own NEW contacts live for its org chart alone — a row this org holds is asked as any link is (the review, server S1; the fix review, server F2)");
    assert.ok(c.includes("const owned = await stampOwnerIds(linked.rows.map(d => sanitize(d)), 'contact', { clerkUserId: userId, orgId });"));
    assert.ok(inOrder(c, 'const result = await bulkInsert({ table: contacts, rows: owned.rows, orgId });', 'if (result.failed.length) {',
        'const swept = await clearStrayLinks(orgId, new Map([[contacts, result.insertedIds]]));', 'result.linksCleared = swept.cleared;',
        'if (swept.failed.length) result.linksNotChecked = swept.failed;'),
        'a row that did not land leaves no link to it (the review, server S2), and the answer says how many it cleared and a field it could not check (the fix review, server F3; the re-check, proof R2)');
    assert.ok(c.includes('const stored = await db.select({ id: contacts.id, accountId: contacts.accountId, managers: contacts.managers, directReports: contacts.directReports })'), 'every link the overwrite holds is read (the review, tests S4)');
    assert.ok(c.includes('const linked = await checkBulkLinks(CONTACT_LINKS, data, orgId, { held: new Map(stored.map(r => [r.id, r])) });'));
    assert.ok(c.includes("const keyed = await rekeyBulkOwners(partialRows(linked.rows, sanitize), 'contact', { table: contacts, orgId });"));
    const o = fn('opportunities');
    assert.ok(o.includes('const people = await checkBulkLinks(DEAL_LINKS, data, orgId);'));
    assert.ok(o.includes("const owned = await stampOwnerIds(people.rows.map(d => sanitize(d)), 'opportunity', { clerkUserId: userId, orgId });"));
    assert.ok(o.includes('const people = await checkBulkLinks(DEAL_LINKS, data, orgId, { held: priors });'));
    assert.ok(o.includes('contactIds:       opportunities.contactIds,'), 'the stored contacts are read with the priors');
    assert.ok(o.includes('data.splice(0, data.length, ...people.rows);'));
    const ac = fn('accounts');
    assert.ok(ac.includes('const taken = new Set((await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.orgId, orgId), inArray(accounts.id, batchIds)))).map(r => r.id));'));
    assert.ok(ac.includes("const parents = await checkBulkLinks(PARENT_LINK, data, orgId, { also: { kind: 'account', ids: new Set(batchIds.filter(id => !taken.has(id))) } });"), "a create's parent may be one of the batch's own new rows");
    assert.ok(inOrder(ac, 'const result = await bulkInsert({ table: accounts, rows: owned.rows, orgId });', 'if (result.failed.length) {',
        'const swept = await clearStrayLinks(orgId, new Map([[accounts, result.insertedIds]]));', 'result.linksCleared = swept.cleared;',
        'if (swept.failed.length) result.linksNotChecked = swept.failed;'),
        'a parent row that did not land leaves no link to it, and the answer says so');
    assert.ok(ac.includes('const stored = await db.select({ id: accounts.id, parentAccountId: accounts.parentAccountId })'), 'the parent the overwrite holds is read');
    assert.ok(ac.includes('const parents = await checkBulkLinks(PARENT_LINK, data, orgId, { held: new Map(stored.map(r => [r.id, r])) });'));
});

test('THE GUARD: each single create answers 409 for an id another org holds — it crashed on the key (a 500 that said the id was taken elsewhere)', () => {
    // A claim's and a quote's since §0.204 (an export run's, whose headers are HEADERS: tests/sales-links.test.mjs).
    for (const [name, table, noun] of [['contacts', 'contacts', 'contact'], ['activities', 'activities', 'activity'], ['tasks', 'tasks', 'task'], ['opportunities', 'opportunities', 'deal'], ['accounts', 'accounts', 'account'],
        ['spiff-claims', 'spiffClaims', 'claim'], ['quotes', 'quotes', 'quote']]) {
        const s = fn(name);
        assert.ok(s.includes(`.onConflictDoNothing({ target: ${table}.id }).returning();`), `${name}: the create writes nothing for a taken id`);
        assert.ok(s.includes(`if (!inserted) return { statusCode: 409, headers, body: JSON.stringify({ error: 'That ${noun} id is already in use.' }) };`), name);
    }
});

test("THE GUARD: an Admin's restore clears, on the rows it inserted, every link that names no row of this org, and says how many — in the answer and the log (E4)", () => {
    const b = fn('backup');
    assert.ok(b.includes("import { clearStrayLinks } from './_links.mjs';"));
    assert.equal(count(b, 'keepRestored(table, await db.insert(table).values('), 2, "a chunk and a row alike — the ids it inserted, not the file's");
    assert.equal(count(b, '.onConflictDoNothing().returning({ id: table.id })'), 2);
    assert.ok(b.includes('for (const r of rows || []) if (r && r.id) ids.push(r.id);'), 'the ids each insert answered — the rows it restored');
    assert.ok(after(b, "{ key: 'jobStatusHistory', table: dispatchJobStatusHistory },", 'swept = await clearStrayLinks(orgId, restored);'), 'after every table is in');
    assert.ok(after(b, 'swept = await clearStrayLinks(orgId, restored);', "const snapId = generateSnapId() + '_import';"), 'before the snapshot');
    const raw = read('netlify/functions/backup.mjs');
    assert.ok(raw.includes('\n            let swept = null;\n            try {\n                swept = await clearStrayLinks(orgId, restored);\n'),
        "at the restore's own level, outside the dispatch block: a file with no dispatch section is cleaned too (the review, tests S5)");
    assert.ok(after(raw, 'swept = await clearStrayLinks(orgId, restored);', '// Record a synthetic snapshot entry'), 'the snapshot comment stays on the snapshot');
    assert.ok(b.includes('} catch (e) { errs.push(`links: not checked — ${e?.cause?.message || e?.message}`); }'), 'a clean-up that throws is said in its cause, and the restore stands');
    assert.ok(b.includes("if (swept.failed.length) errs.push(`links: not checked on ${swept.failed.join(', ')} — the restore stands, those links as the file had them.`);"), 'a field it could not check is named (the review, restore S2)');
    assert.ok(b.includes("if (swept.cleared) notes.push(`${swept.cleared} link${swept.cleared === 1 ? '' : 's'} that named no record of this organization ${swept.cleared === 1 ? 'was' : 'were'} cleared.`);"), 'the answer says how many');
    assert.ok(b.includes("if (swept.jobsWithoutCustomer) notes.push(`${swept.jobsWithoutCustomer} job${swept.jobsWithoutCustomer === 1 ? ' names' : 's name'} a customer that is not in this organization — a job's customer can't be cleared, so ${swept.jobsWithoutCustomer === 1 ? 'it was' : 'they were'} left as restored.`);"), "and the jobs whose customer it can't clear");
    assert.ok(b.includes("if (swept.quotesWithoutDeal) notes.push(`${swept.quotesWithoutDeal} quote${swept.quotesWithoutDeal === 1 ? ' names' : 's name'} a deal that is not in this organization — a quote's deal can't be cleared, so ${swept.quotesWithoutDeal === 1 ? 'it was' : 'they were'} left as restored.`);"), "and the quotes whose deal it can't clear (the review, restore S1)");
    assert.ok(b.includes("detail: `${imported} records imported${linkDetail ? ` · ${linkDetail}` : ''}"), 'the log carries the counts, not only the answer (the review, restore S5; §0.143)');
    assert.ok(b.includes("swept.cleared ? `${swept.cleared} link${swept.cleared === 1 ? '' : 's'} cleared` : '',"));
    const l = fn('_links');
    const sweep = l.slice(l.indexOf('const RESTORE_LINKS = ['));
    assert.ok(sweep.length > 1000, 'the clean-up is there');
    assert.equal(count(sweep, 'eq(table.orgId, orgId), inArray(table.id, ids)'), 5, "this org's inserted rows only — a mirror's count, a scalar's update, a list's count and its update, a required link's count");
    assert.ok(sweep.includes('            const done = await clearField(orgId, table, ids, key, kind, shape, mirrorOf);\n            cleared += done.cleared;\n            carried = done.mirrored;\n'), 'field by field — a mirror\'s ids its list holds carried to the list');
    assert.ok(sweep.includes('        } catch (e) {\n            cleared += carried;\n            carried = 0;\n            failed.push(`${getTableName(table)}.${key}`);\n'),
        'a field that fails is named and the rest go on; a mirror its failed list held is counted here (the fix review, server F4)');
    assert.ok(sweep.includes('return { cleared, jobsWithoutCustomer, quotesWithoutDeal, locationsWithoutCustomer, lineItemsWithoutJob, historyWithoutJob, shelfFailed, failed };'), "batch 4's counts, then Dispatch's (§0.201)");
    assert.ok(sweep.includes("const jobsWithoutCustomer = await countRequired(orgId, restored, dispatchJobs, 'customerId', dispatchCustomers, failed);"), "a job's customer, counted");
    assert.ok(sweep.includes("const quotesWithoutDeal = await countRequired(orgId, restored, quotes, 'opportunityId', opportunities, failed);"), "a quote's deal, counted");
    assert.ok(sweep.includes('sql`NOT EXISTS (SELECT 1 FROM ${parentTable} AS link_parent WHERE link_parent.id = ${table[key]} AND link_parent.org_id = ${orgId})`'), 'a required link, in this org');
    assert.ok(sweep.includes('return stray.length;'));
    assert.ok(sweep.includes("if (shape === 'one') {"));
    assert.ok(sweep.includes(".where(and(eq(table.orgId, orgId), inArray(table.id, ids), isNotNull(col), sql`${col} <> ''`, sql`NOT ${inOrg(col)}`))"), 'a scalar is cleared only where it names no row of this org');
    assert.ok(sweep.includes("sql`NOT ${inOrg(col)}`,\n                    sql`jsonb_typeof(${list}) = 'array'`, sql`(${list} @> jsonb_build_array(${col}) OR ${list} @> jsonb_build_array(jsonb_build_object('id', ${col})))`));"),
        "a mirror read before its list is cleared: is the same id in the list — a bare id or a chip's (the review, restore S4)");
    assert.ok(sweep.includes('return { cleared: done.length - mirrored, mirrored, ids: done.map((r) => r.id) };'), 'a mirror its list holds is not counted again: the pair is one link');
    assert.ok(sweep.includes("const set = table === accounts && key === 'parentAccountId' ? { [key]: null, accountTier: 'account' } : { [key]: null };") && sweep.includes('const done = await db.update(table).set(set)'),
        'an account whose parent is cleared is an account — a top-level account is one (D21; the fix review, server F5)');
    assert.ok(sweep.includes("const el = shape === 'chips' ? sql`(CASE WHEN jsonb_typeof(e) = 'object' THEN e ->> 'id' ELSE e #>> '{}' END)` : sql`(e #>> '{}')`;"), "an entry's id as heldIds reads it — a bare id on an org chart too");
    assert.ok(sweep.includes("const keep = sql`(coalesce(${el}, '') = '' OR ${inOrg(el)})`;"), 'an entry that names no record is kept, and not counted');
    assert.ok(sweep.includes("const [{ strays }] = await db.select({ strays: sql`coalesce(sum((SELECT count(*) FROM jsonb_array_elements(${col}) e WHERE NOT ${keep})), 0)`.mapWith(Number) })"), "a list's strays, counted");
    assert.ok(sweep.includes('jsonb_agg(x.e ORDER BY x.i)'), 'the entries kept in their order');
    assert.ok(sweep.includes('return { cleared: strays, mirrored: 0 };'), 'the links cleared, one each');
    assert.ok(sweep.includes('const named = SWEPT[kind];'), "batch 4's tables and Dispatch's, and a job's quote (§0.201)");
    assert.ok(sweep.includes('        : (expr) => sql`EXISTS (SELECT 1 FROM ${named} AS link_parent WHERE link_parent.id = ${expr} AND link_parent.org_id = ${orgId})`;'),
        "the row a link names read apart from the row restored — an account's own parent — the table aliased in the SQL (drizzle's alias() renders bare in a raw template: 42P01)");
    assert.ok(!l.includes('alias('), 'no drizzle alias() in a raw template');
    assert.ok(l.includes([
        'const RESTORE_LINKS = [',
        "    [contacts, 'accountId', 'account', 'one'],",
        "    [contacts, 'managers', 'contact', 'chips'],",
        "    [contacts, 'directReports', 'contact', 'chips'],",
        "    [activities, 'accountId', 'account', 'one'],",
        "    [activities, 'opportunityId', 'deal', 'one'],",
        "    [activities, 'leadId', 'lead', 'one'],",
        "    [activities, 'contactId', 'contact', 'one', 'contactIds'],",
        "    [activities, 'contactIds', 'contact', 'many'],",
        "    [tasks, 'accountId', 'account', 'one'],",
        "    [tasks, 'opportunityId', 'deal', 'one'],",
        "    [tasks, 'contactId', 'contact', 'one', 'contacts'],",
        "    [tasks, 'contacts', 'contact', 'chips'],",
        "    [accounts, 'parentAccountId', 'account', 'one'],",
        "    [opportunities, 'accountId', 'account', 'one'],",
        "    [opportunities, 'contactIds', 'contact', 'many'],",
        "    [dispatchCustomers, 'accountId', 'account', 'one'],",
        "    [dispatchJobs, 'locationId', 'location', 'one'],",
        "    [dispatchJobs, 'accountId', 'account', 'one'],",
        "    [dispatchJobs, 'opportunityId', 'deal', 'one'],",
        "    [dispatchJobs, 'assignedTechId', 'technician', 'one'],",
    ].join('\n')), "every link batch 4 checks and a deal's account are the restore's to clear — nineteen, each mirror before its list; a job's customer and a quote's deal counted apart; Dispatch's after them (tests/dispatch-links.test.mjs)");
});

test('THE GUARD: a screen that copies a link onto a new record leaves off one the server refuses as naming nothing, and saves without it — the task rail\'s completion notes, a dispatch job (the review, screens S1 and S2)', () => {
    const t = code(read('src/components/rails/TaskRail.jsx'));
    assert.ok(t.includes("if (handleCompleteTask && !task.completed) {\n            const done = await handleCompleteTask(task.id, 'Completed');\n"),
        'Completed, not toggled — and once, by what the bar reads: a second press saves the notes alone (the fix review, screens F5), and a task set to Completed in its Status is completed (the re-check, code R1)');
    assert.ok(t.includes("            if (!done?.ok) notDone = done?.error || '';\n"),
        'a completion that does not land is kept to be said (the re-check, code R2) — and the notes go on to be saved (Jeff, 13 Oct: "Save them anyway")');
    assert.ok(t.includes("const said = (words) => { const s = String(words || 'check your connection and try again'); return s.endsWith('.') ? s.slice(0, -1) : s; };"),
        "a refusal's words, or the connection when nothing answered");
    assert.ok(t.includes('const askedOrg = requestOrg();'), 'the org the press began in');
    assert.ok(inOrder(t, "const done = await handleCompleteTask(task.id, 'Completed');", '        }\n        if (!stillOrg(askedOrg)) return;\n        if (completionNotes.trim()) {\n',
        'const { answer, sent } = await saveDroppingRefused((body) => (stillOrg(askedOrg) ? handleSaveActivity(body, {'),
        'an org switch stops it before the notes are sent, and before each send again: never saved in the org switched to (the fix review, screens F1)');
    assert.ok(t.includes("}) : undefined), activityData, ['opportunityId', 'contactId', 'accountId']);"), "the task's links, each dropped once if refused");
    assert.ok(inOrder(t, "}) : undefined), activityData, ['opportunityId', 'contactId', 'accountId']);\n                if (!stillOrg(askedOrg)) return;\n",
        '                if (!answer?.ok) {\n                    say(notDone !== null\n' +
        '                        ? `The task was not completed: ${said(notDone)}. Its notes were not saved: ${said(answer?.error)}.`\n' +
        '                        : `The task is completed — its notes were not saved: ${said(answer?.error)}.`,\n' +
        "                        { type: sent.type, notes: sent.notes, opportunityId: sent.opportunityId || '', contactId: sent.contactId || '', accountId: sent.accountId || '' });\n" +
        '                    return;\n                }\n                notesSaved = true;\n',
        '        if (notDone !== null) {\n', "            if (notesSaved && here()) setCompletionNotes('');\n",
        '            say(notesSaved\n                ? `Its notes were saved, but the task was not completed: ${said(notDone)}.`\n' +
        '                : `The task was not completed: ${said(notDone)}.`);\n            return;\n        }\n',
        "        if (!here()) return;\n        setCompletionPrompt(false);\n        setCompletionNotes('');\n        closeRail();\n"),
        'a refused notes save keeps the prompt, its notes and the error, and says whether the task is completed — or, the rail moved on, its notice carries the notes and the links last sent (Jeff, 13 Oct: "Show them in the toast"; the fifth re-check, code C1); a completion that did not land is said after the notes are saved, and the notes, saved, leave the prompt; each on the rail the press began on, or in its notice');
    assert.ok(inOrder(t, "        setCompletionError('');\n        let notDone = null;", "\n        let notesSaved = false;\n        if (handleCompleteTask && !task.completed) {\n"),
        'a press starts as landed, nothing saved (the third re-check, proof P1)');
    assert.ok(t.includes("        const here = () => pressGen.current === mine;\n        const say = (words, refused) => (here() ? setCompletionError(words)\n            : setPressNotices?.((list) => [...list, { id: 'press_' + crypto.randomUUID(), title: task.title || 'A task', words, refused: refused || null }]));\n"),
        "a press speaks on the rail it began on, or in a notice of its own once the rail has moved on — never the shared toast, which a later toast replaced, a delete's Undo with it (the fifth re-check, code C1)");
    assert.ok(t.includes('                    setFollowUpPrompt: (prompt) => { if (notDone === null && here()) setFollowUpPrompt(prompt); },\n'),
        'a follow-up is offered for a task completed, on its own rail — never over a prompt that stays for another press (the third re-check, code C2)');
    assert.ok(t.includes('                    setQuickLogOpen: () => {},\n                    setQuickLogForm: () => {},\n                    setQuickLogContactResults: () => {},\n                    quiet: true,\n'),
        "the notes save is quiet: the Activity rail's wait and banner, and QuickLog's draft, are not its own (the fifth re-check, code D1)");
    assert.ok(t.includes("{completionError && completionNotes.trim() ? 'Discard notes' : 'Cancel'}") && t.includes("{completing ? 'Saving…' : completionError && task?.completed ? 'Save notes' : '✓ Mark Complete'}"),
        'and what each button does then — Discard notes while unsaved notes stand, Save notes once the task is completed, Mark Complete again while it is not (the re-check, code R2)');
    assert.ok(t.includes('    const completingRef = useRef(false);'), 'a press is held at the press, before React draws the wait');
    assert.ok(t.includes('    const [completing,       setCompleting]       = useState(false);'), 'no press is out when the rail mounts (the third re-check, proof P2)');
    assert.ok(t.includes('    const pressGen = useRef(0);'), "the rail's opens, counted");
    assert.ok(t.includes('    useEffect(() => {\n        pressGen.current += 1;\n        completingRef.current = false;\n        setCompleting(false);\n        return () => { pressGen.current += 1; };\n    }, [taskRailId, taskRailMode]);\n'),
        "each open of the rail — another task, a new one, its close — is another rail, and lets go of the last one's wait (the third re-check, code C2); so is its unmount, an org switch's or a crash's (the fourth re-check, code C1)");
    assert.ok(inOrder(t, '    const handleConfirmComplete = async () => {\n        if (completingRef.current) return;\n        completingRef.current = true;\n        setCompleting(true);\n        const mine = pressGen.current;\n',
        '        try { await confirmComplete(mine); } finally { if (pressGen.current === mine) { completingRef.current = false; setCompleting(false); } }\n'),
        "one press at a time: a second press while the first is out does nothing, and a press lets go of its own wait when it ends — never another open's (the second re-check, code C1; the third, code C2)");
    assert.ok(t.includes("setCompletionError(''); }} disabled={completing}") && t.includes('onClick={handleConfirmComplete} disabled={completing}'), "the prompt's buttons wait while a press is out, and say so");
    assert.ok(t.includes('<select value={completionType} onChange={e => setCompletionType(e.target.value)} disabled={completing}') && t.includes('<textarea value={completionNotes} onChange={e => setCompletionNotes(e.target.value)} readOnly={completing}'),
        'and its type and notes: what a press clears is what it sent (the third re-check, code C1)');
    assert.ok(t.includes('            e.preventDefault();\n            if (!isEditing) closeRail();\n') && t.includes('onClick={!isEditing ? closeRail : undefined}'),
        'the rail still closes on Escape and the backdrop while a press is out, and the press then says only what did not land, in a notice of its own (Jeff, 13 Oct: "Let it close"; the fourth re-check, code C3; the fifth, proof P6)');
    const k = code(read('src/hooks/useTasks.js'));
    assert.ok(k.includes("if (!res.ok) { refused = data.error || 'Failed to save task'; throw new Error(refused); }"), "the completion keeps the server's words");
    assert.ok(inOrder(k, "addAudit('update', 'task', taskId, next.title || taskId, next.status === 'Completed' ? 'Completed' : 'Reopened');",
        '            return { ok: true };\n        } catch (err) {',
        '            setTasks(prev => prev.map(t => t.id === taskId ? current : t));\n            return { ok: false, error: refused };\n'),
        'and answers whether it landed (the re-check, code R2)');
    assert.ok(t.includes("        setTaskModalError?.(null);\n        setCompletionPrompt(false);\n        setCompletionNotes('');\n        setCompletionError('');\n"),
        'a prompt left by the last task never opens on this one (the fix review, screens F4)');
    assert.ok(t.includes('{completionError && ('), 'the error is shown in the prompt');
    const h = code(read('src/hooks/useActivities.js'));
    assert.equal(count(h, "if (!res.ok) { const error = data.error || 'Failed to save activity. Please try again.'; setActivityModalError(error); setActivityModalSaving(false); return { ok: false, status: res.status, error, field: data.field }; }"), 2,
        "the save answers the server's refusal — its field too — on an update and a create");
    assert.ok(h.includes('        setQuickLogContactResults([]);\n        return { ok: true };\n'), 'and that it saved');
    const d = code(read('src/Tabs/DispatchTab.jsx'));
    assert.ok(d.includes("}, payload, newJobForm.opportunityCopied ? ['accountId', 'opportunityId'] : ['accountId']);"),
        "a job's CRM account copied from its customer, and a won deal's placeholder's deal, dropped once if refused — never a deal the dispatcher picked, its customer or its location (the fix review, screens F3; the re-check, code R3)");
    assert.ok(d.includes('            opportunityId:  row.opportunityId,\n            opportunityCopied: true,'), "the placeholder's deal is copied");
    assert.ok(d.includes('onChange={e => setNewJobForm(f => ({ ...f, opportunityId: e.target.value, opportunityCopied: false }))}'), "a deal picked from the list is the dispatcher's");
    assert.ok(d.includes("                if (!stillOrg(askedOrg)) return undefined;\n                const r = await dbFetch('/.netlify/functions/dispatch-jobs',"), 'an org switch stops it before each send (the fix review, screens F2)');
    assert.ok(d.includes('                return { ok: r.ok, status: r.status, field: data?.field };\n'), "the server's refusal handed to the drop, its status and field (the fix review, tests F2)");
    assert.ok(d.includes("if (!answer.ok) throw new Error(data?.error || 'Save failed');"), 'anything else is said under the form');
    assert.ok(d.includes('opportunityId:   sent.opportunityId || null,'), 'the job on screen holds the deal it was saved with');
});

test('THE GUARD: a press whose task rail moved on says what did not land in a notice of its own — kept until its ✕ or an org switch, its refused notes in full with a way to log them — and its notes save leaves the Activity rail and QuickLog alone (the fifth re-check, code C1, C2 and D1; the sixth, code C1-C4, proof P1)', () => {
    const m = code(read('src/hooks/useModalState.js'));
    assert.ok(m.includes('    const [pressNotices, setPressNotices] = useOrgBoundState(remembered, []);'),
        "the notices are org-bound — an org switch clears them, so none shows a task's title or notes in another org — and remembered: a layer's crash keeps them (the sixth re-check, code C3)");
    assert.ok(m.includes('        pressNotices, setPressNotices,'), 'and handed out');
    const app = code(read('src/App.jsx'));
    assert.equal(count(app, 'pressNotices, setPressNotices,'), 2, 'App takes them from the modal state and puts them in the context');
    const ml = code(read('src/components/layout/ModalLayer.jsx'));
    assert.ok(ml.includes('{pressNotices && pressNotices.length > 0 && ('), 'drawn while any stands');
    assert.ok(ml.includes("<div style={{ position: 'fixed', left: '1rem', zIndex: 100200,") && ml.includes("...(isMobile ? { right: '1rem', top: '4.5rem' } : { bottom: '5.5rem', width: '420px' }),"),
        "bottom-left, clear of the rails' column and the follow-up card — under the header on a phone (the sixth re-check, code C4)");
    assert.ok(ml.includes('{[...pressNotices].reverse().map(n => ('), 'newest first');
    assert.ok(ml.includes('⚠ <strong>{n.title}</strong> — {n.words}</span>'), 'each says its task and what did not land (the sixth re-check, proof P1)');
    assert.ok(ml.includes('onClick={() => setPressNotices(list => list.filter(x => x.id !== n.id))}'), 'each until its own ✕');
    assert.ok(inOrder(ml, '{n.refused?.notes && (', "whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: '30vh', overflowY: 'auto'", '{n.refused.notes}',
        '<button disabled={showActivityModal || !!taskRailId || quickLogOpen}'),
        'the notes refused, as typed — line breaks kept, a long one scrolled — then Log these notes, offered only when Log Activity, the task rail and QuickLog are closed (the sixth re-check, code C2 and C6)');
    assert.ok(ml.includes('onClick={() => { setEditingActivity(null); setActivityInitialContext({ ...n.refused }); setShowActivityModal(true); }}'),
        'it opens Log Activity prefilled — the notes, their type and the links last sent — and leaves the notice standing until its ✕ (the sixth re-check, code C1)');
    assert.ok(!ml.includes('setPressNotices(list => list.filter(x => x.id !== n.id)); setEditingActivity(null);'), 'Log these notes never drops its notice first');
    const t = code(read('src/components/rails/TaskRail.jsx'));
    assert.ok(t.includes('                    setShowActivityModal: () => {},\n'), "a landed notes save never closes the Activity rail (the sixth re-check, proof P1)");
    const h = code(read('src/hooks/useActivities.js'));
    assert.ok(h.includes('const QUIET_RAIL = { setActivityModalError: () => {}, setActivityModalSaving: () => {} };'), "a quiet save's Activity rail setters do nothing");
    assert.ok(inOrder(h, '    const handleSaveActivity = async (activityData, ctx) => saveActivity(activityData, ctx,\n        ctx?.quiet ? QUIET_RAIL : { setActivityModalError, setActivityModalSaving });\n',
        '    const saveActivity = async (\n', '        { setActivityModalError, setActivityModalSaving },\n    ) => {\n'),
        "every save takes the Activity rail setters it may use: a quiet one none of the rail's own");
});
