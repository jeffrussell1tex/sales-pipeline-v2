// tests/leave-out.test.mjs
//
// An edit's Save leaves out each link field nobody touched (state §0.198, the pre-ship round;
// Jeff, 12 Oct: "One rule for every link"). The pre-ship audit found an untouched field still
// sent — and what it sent overwrote what was stored: the linked account's own name brought a
// merged-away name back over a contact's Company; a task opened on a contact the caller's list
// does not hold stored a chip with no name; a screen loaded before a merge, a rename or another
// session's pick put its old copy of the link back. Every endpoint lays a PUT over the stored row,
// so a key left out keeps what is stored, and answers the row as stored.
//
// Here: src/utils/leaveOut.js, run; and THE GUARD — each of the four hooks sends an edit through
// sentBody and lists the server's row (or shownRow), and each of the four save screens leaves out
// its untouched links on an edit only, never on a new record (whose prefill is what it saves).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEFT_OUT, leaveOut, sentBody, shownRow, sameList } from '../src/utils/leaveOut.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const count = (s, sub) => s.split(sub).length - 1;

// ── leaveOut.js — run ───────────────────────────────────────────────────────

test('leaveOut names the keys a PUT leaves out; sentBody sends the rest; shownRow keeps all of it for the screen', () => {
    const data = { id: 'c1', phone: '555', company: 'Shell', accountId: 'k' };
    const marked = leaveOut(data, ['company', 'accountId']);
    assert.deepEqual(marked[LEFT_OUT], ['company', 'accountId']);
    assert.deepEqual(sentBody(marked), { id: 'c1', phone: '555' }, 'the untouched link is not sent: the stored one stands');
    assert.deepEqual(shownRow(marked), data, 'the hook and the screen still see the whole of it');
    assert.equal(data[LEFT_OUT], undefined, 'the data given is not changed');
    assert.equal(leaveOut(data, []), data, 'nothing to leave out: the data as it is');
    assert.equal(leaveOut(data, null), data);
    assert.deepEqual(sentBody(data), data, 'data that names nothing is sent whole');
    assert.deepEqual(leaveOut(data, ['company', 'company', '', 7, LEFT_OUT])[LEFT_OUT], ['company'], 'each key once; never the list itself, never a non-key');
    assert.equal(sentBody(null), null);
    assert.equal(shownRow(undefined), undefined);
});

test('the names ride on the data — a spread keeps them, so the Closed Lost dialog\'s later save leaves out the same keys', () => {
    const marked = leaveOut({ id: 'd1', stage: 'Closed Lost', account: 'Shell', accountId: 'k', site: 'Plant B' }, ['account', 'accountId', 'site']);
    const enriched = { ...marked, lostReason: 'Price', lostDate: '2026-10-12' };
    assert.deepEqual(sentBody({ ...enriched, id: 'd1' }), { id: 'd1', stage: 'Closed Lost', lostReason: 'Price', lostDate: '2026-10-12' });
});

test('sameList: the same values in the same order', () => {
    assert.equal(sameList(['a', 'b'], ['a', 'b']), true);
    assert.equal(sameList(['a', 'b'], ['b', 'a']), false, 'the order is the Primary');
    assert.equal(sameList(['a'], ['a', 'b']), false);
    assert.equal(sameList([], null), true, 'none is none');
    assert.equal(sameList(undefined, []), true);
});

// ── THE GUARD: the hooks ────────────────────────────────────────────────────

const HOOKS = [
    ['src/hooks/useContacts.js', 'contacts', 'payload', 'setContacts(prev => prev.map(c => c.id === editingContact.id ? (data.contact || shownRow(payload)) : c));'],
    ['src/hooks/useTasks.js', 'tasks', 'payload', 'setTasks(prev => prev.map(t => t.id === editingTask.id ? (data.task || shownRow(payload)) : t));'],
    ['src/hooks/useActivities.js', 'activities', 'payload', 'setActivities(prev => prev.map(a => a.id === editingActivity.id ? (data.activity || shownRow(payload)) : a));'],
    ['src/hooks/useOpportunities.js', 'opportunities', 'updatedOpp', 'setOpportunities(prev => prev.map(opp => opp.id === editingOpp.id ? (data.opportunity || shownRow(updatedOpp)) : opp));'],
];

test('THE GUARD: each hook sends an edit through sentBody — never the data whole — and lists the row the server answers', () => {
    for (const [file, fn, name, list] of HOOKS) {
        const src = code(read(file));
        assert.ok(src.includes("import { sentBody, shownRow } from '../utils/leaveOut.js';"), file);
        assert.ok(src.includes(`dbFetch('/.netlify/functions/${fn}', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sentBody(${name})) })`), `${file}: the edit's PUT`);
        assert.equal(count(src, `body: JSON.stringify(${name}) })`), 0, `${file}: REGRESSION — a PUT of the data whole sends the untouched links`);
        assert.ok(src.includes(list), `${file}: the list takes the server's row, else the data without the names`);
    }
    const opps = code(read('src/hooks/useOpportunities.js'));
    assert.ok(opps.includes("setOpportunities(prev => prev.map(opp => opp.id === editingOppRef.id ? shownRow(updatedOpp) : opp));\n            const r = await dbWrite('/.netlify/functions/opportunities', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sentBody(updatedOpp)) });"),
        'the Closed Lost dialog sends the deal as the window left it');
});

test('THE GUARD: each of the four save screens builds its Save through leaveOut, once; the key is leaveOut.js\'s alone', () => {
    const files = ['src/components/rails/ContactRail.jsx', 'src/components/rails/ActivityRail.jsx', 'src/components/rails/TaskRail.jsx', 'src/components/modals/OpportunityModal.jsx'];
    for (const f of files) assert.equal(count(code(read(f)), 'leaveOut({'), 1, `${f}: one Save, through leaveOut`);
    for (const f of [...files, ...HOOKS.map(([h]) => h)]) assert.equal(count(read(f), '__leftOut'), 0, `${f}: the key is leaveOut.js's alone`);
});

// ── THE GUARD: the screens — an edit only ───────────────────────────────────

test('the contact rail: an untouched Company is left out of an edit, never of a new contact', () => {
    const r = code(read('src/components/rails/ContactRail.jsx'));
    assert.ok(r.includes("import { leaveOut } from '../../utils/leaveOut.js';"));
    assert.ok(r.includes("        }, !isNew && link.untouched ? ['company', 'accountId'] : []);\n"));
    assert.ok(r.includes('await handleSaveContact(saveData, {'), 'the data as marked is what the hook sends');
});

test('Log Activity: an edit leaves out each untouched link — Company, Opportunity, the contacts as they opened', () => {
    const r = code(read('src/components/rails/ActivityRail.jsx'));
    assert.ok(r.includes("import { leaveOut, sameList } from '../../utils/leaveOut.js';"));
    assert.ok(r.includes('    const contactsSeedRef = useRef([]);'));
    assert.ok(r.includes('        setSelectedContactIds(seedContactIds);\n        contactsSeedRef.current = seedContactIds;\n'), 'taken with the seed, once, when the rail opens');
    assert.ok(r.includes(
        "        }, editingActivity ? [\n" +
        "            ...(links.untouched.company ? ['accountId', 'company'] : []),\n" +
        "            ...(links.untouched.deal ? ['opportunityId'] : []),\n" +
        "            ...(sameList(selectedContactIds, contactsSeedRef.current) ? ['contactIds', 'contactId'] : []),\n" +
        "        ] : []);\n"));
    assert.ok(r.includes('await handleSaveActivity(saveData, {'));
});

test('the task rail: an edit leaves out each untouched link — Account, Opportunity, the chips', () => {
    const r = code(read('src/components/rails/TaskRail.jsx'));
    assert.ok(r.includes("import { leaveOut } from '../../utils/leaveOut.js';"));
    assert.ok(r.includes(
        "        }, isNew ? [] : [\n" +
        "            ...(links.untouched.account ? ['accountId'] : []),\n" +
        "            ...(links.untouched.deal ? ['opportunityId'] : []),\n" +
        "            ...(links.untouched.contacts ? ['contacts', 'contactId'] : []),\n" +
        "        ]);\n"));
    assert.ok(r.includes('await handleSaveTask(saveData, {'));
});

test('the deal window: an edit leaves out an untouched Account (and its Site Name when that is as it opened) and untouched Contacts', () => {
    const m = code(read('src/components/modals/OpportunityModal.jsx'));
    assert.ok(m.includes("import { leaveOut, sameList } from '../../utils/leaveOut.js';"));
    assert.ok(m.includes("    const linksSeed = useRef({ site: opportunity?.site ?? '', contactIds: [...(opportunity?.contactIds || [])], contacts: opportunity?.contacts ?? '' }).current;"), 'taken once, with the account seed');
    assert.equal(count(m, 'linksSeed = useRef('), 1);
    assert.ok(m.includes(
        "        const accountKept = !!opportunity?.id && resolvedAccount.how === 'untouched';\n" +
        "        const left = !opportunity?.id ? [] : [\n" +
        "            ...(accountKept ? ['account', 'accountId'] : []),\n" +
        "            ...(accountKept && (formData.site ?? '') === linksSeed.site ? ['site'] : []),\n" +
        "            ...(sameList(selectedContactIds, linksSeed.contactIds) && (formData.contacts ?? '') === linksSeed.contacts ? ['contactIds', 'contacts'] : []),\n" +
        "        ];\n"), "a new deal (a lead's convert has no id) leaves nothing out; a Site Name typed is sent though its Account is not — the endpoint's lift keeps a Site Name only when the account id is sent");
    assert.ok(m.includes('        onSave(leaveOut({ ...formData, account: resolvedAccount.name, accountId: resolvedAccount.id,'));
});

test('THE GUARD (the fix review): the activities PUT keeps both contact columns as stored when the body names neither — sanitize rebuilds contactId from the list', () => {
    const s = code(read('netlify/functions/activities.mjs'));
    const at = s.indexOf("            if (!('contactIds' in data) && !('contactId' in data)) { delete updateData.contactIds; delete updateData.contactId; }");
    assert.ok(at > s.indexOf('const { id, ...updateData } = clean;'), 'after the row is built');
    assert.ok(at < s.indexOf('set: { ...updateData, updatedAt: new Date() }'), 'before the write');
});

test('THE GUARD (the re-check): the activities POST reads an empty contact list beside a contactId as that one contact; the deals list is read again after a CSV that named an account', () => {
    const s = code(read('netlify/functions/activities.mjs'));
    const post = s.slice(s.indexOf("if (event.httpMethod === 'POST') {"), s.indexOf("if (event.httpMethod === 'PUT') {"));
    assert.ok(post.indexOf("if (Array.isArray(data.contactIds) && !data.contactIds.length && data.contactId) data.contactIds = [data.contactId];") >= 0
        && post.indexOf("if (Array.isArray(data.contactIds) && !data.contactIds.length && data.contactId) data.contactIds = [data.contactId];") < post.indexOf('sanitize(data)'), 'before the row is built — a delete\'s Undo of an older activity kept its contact');
    const m = code(read('src/components/layout/ModalLayer.jsx'));
    assert.ok(m.includes("if (ow.appliedIds.length && !overwritesBuilt.some(r => 'salesRep' in r) && overwritesBuilt.some(r => 'account' in r)) loadOpportunities(() => {});"), 'the list shows the spelling the server kept');
});
