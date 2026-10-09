// tests/deal-engagement.test.mjs
//
// Per-contact engagement by contact id (state §0.192; OPEN_ITEMS §4.2; Jeff, 1 Oct: key
// both on contactIds; Jeff, 9 Oct: "Reword, same rule", "Add it, nobody pre-picked",
// "3 / 10 / 21 days", "Add last touch + count").
//
// Five places counted a deal's per-contact engagement from `activity.contactName`, a
// field no writer stores and the activities table does not have: the deal window's
// Contacts tab (0 / 0 / 0 and "—" for everyone), its rail (every dot stale), its History
// tab's "Contacts engaged" (the names LISTED), Home's "Missing stakeholder" (every $20k
// deal with two names) and ai-score.mjs ("Contacts engaged: none" — on dev, 9 Oct,
// Bluebird HVAC's Warehouse Scheduling scored "Priya Shah and Tom Becker unresponsive"
// though its one activity carries Priya's id). src/utils/dealEngagement.js is the one
// rule now; these tests RUN it, pin where each site calls it, and guard the class.
//
// THE GUARDS (text scans with comments stripped, so the harness pays no second parse):
//   G1 no code under src/ or netlify/functions reads or writes `contactName` but the
//      dispatch customer's column (dispatch_customers.contact_name);
//   G2 no code splits a deal's `contacts` text on ", " but quote-email.mjs's fallback
//      recipient (recorded, its own batch) — dealEngagement.js reads the text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
    activityContactIds, contactIndex, listedContacts, personLabel, engagementByContact,
    engagedContacts, engagedLabel, dealCommittee, withoutPerson, onDealOf,
} from '../src/utils/dealEngagement.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const between = (src, from, to) => { const a = src.indexOf(from); assert.ok(a >= 0, from); const b = src.indexOf(to, a + from.length); assert.ok(b > a, to); return src.slice(a, b); };
const count = (src, s) => src.split(s).length - 1;
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
// Comments out: block comments, then whole-line and trailing // comments (not a URL's "://").
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');

const person = (id, firstName, lastName, title = '', extra = {}) => ({ id, firstName, lastName, title, ...extra });
const PRIYA = person('con_qa_03', 'Priya', 'Shah', 'Procurement Lead');
const TOM = person('con_qa_04', 'Tom', 'Becker', 'Plant Manager');
const BLUEBIRD = { contactIds: ['con_qa_03', 'con_qa_04'], contacts: 'Priya Shah (Procurement Lead), Tom Becker (Plant Manager)' };
const act = (id, type, date, ids, extra = {}) => ({ id, type, date, contactIds: ids, ...extra });
const rows = (ps) => ps.map((p) => [p.id, p.name, p.engagement.count, p.engagement.lastTouch]);

// ── RUN ──────────────────────────────────────────────────────────────────────

test('the regression (dev, 9 Oct): Priya\'s email engages Priya — the AI hears it, and Tom reads not engaged', () => {
    const acts = [act('a1', 'Email', '2026-09-30', ['con_qa_03'], { contactId: null })];
    assert.deepEqual(rows(dealCommittee(BLUEBIRD, [PRIYA, TOM], acts)),
        [['con_qa_03', 'Priya Shah', 1, '2026-09-30'], ['con_qa_04', 'Tom Becker', 0, null]]);
    assert.deepEqual(engagedContacts(acts, [PRIYA, TOM]).map((p) => p.name), ['Priya Shah']);
    assert.deepEqual(engagedContacts(acts, [PRIYA, TOM]).map(engagedLabel), ['Priya Shah (last touch 2026-09-30, 1 activity)']);
});

test('an activity names its people by contactIds and contactId — a QuickLog row\'s single id counts', () => {
    assert.deepEqual(activityContactIds({ contactIds: ['c1', 'c2'], contactId: 'c1' }), ['c1', 'c2']);
    assert.deepEqual(activityContactIds({ contactId: 'c9' }), ['c9']);
    assert.deepEqual(activityContactIds({ contactIds: null, contactId: 'c9' }), ['c9']);
    assert.deepEqual(activityContactIds({ contactIds: ['', null, 7, 'c1'] }), ['c1']);
    assert.deepEqual(activityContactIds({ contactName: 'Priya Shah' }), [], 'a name is no one');
    assert.deepEqual(activityContactIds(null), []);
    const quick = [{ id: 'q', type: 'Call', date: '2026-10-02', contactId: 'con_qa_04' }];
    assert.deepEqual(rows(dealCommittee(BLUEBIRD, [PRIYA, TOM], quick))[1], ['con_qa_04', 'Tom Becker', 1, '2026-10-02']);
});

test('the buckets: calls are Call and Follow-up, emails Email and Proposal Sent, meetings the rest; the latest day is the last touch', () => {
    const types = [['Call', '2026-09-01'], ['Follow-up', '2026-09-02'], ['Email', '2026-09-03'], ['Proposal Sent', '2026-09-04'],
        ['Meeting', '2026-09-05'], ['Other', '2026-09-06'], ['Demo', '2026-09-30'], ['Call', '2026-09-10']];
    const e = engagementByContact(types.map(([type, date], i) => act(`b${i}`, type, date, ['c1']))).get('c1');
    assert.deepEqual(e, { count: 8, calls: 3, emails: 2, meetings: 3, lastTouch: '2026-09-30' });
    assert.equal(engagementByContact(undefined).size, 0);
    assert.equal(engagementByContact([act('x', 'Call', '2026-09-01', ['c1', 'c1'])]).get('c1').count, 1, 'once for a person named twice');
});

test('a merged duplicate reads as the contact it was merged into — its touches fold in, its id stands with the survivor\'s', () => {
    const DUP = person('con_dup', 'Priya', 'Shah', '', { mergedIntoId: 'con_qa_03' });
    const acts = [
        act('m1', 'Meeting', '2026-10-01', ['con_dup'], { contactId: 'con_qa_03' }),   // merge.mjs rewrote contactId only
        act('m2', 'Email', '2026-10-02', ['con_dup']),
    ];
    assert.deepEqual(rows(dealCommittee(BLUEBIRD, [PRIYA, TOM, DUP], acts))[0], ['con_qa_03', 'Priya Shah', 2, '2026-10-02']);
    const both = dealCommittee({ contactIds: ['con_dup', 'con_qa_03', 'con_qa_04'] }, [PRIYA, TOM, DUP], []);
    assert.deepEqual(both.map((p) => p.id), ['con_qa_03', 'con_qa_04']);
    assert.deepEqual(both[0].rawIds, ['con_dup', 'con_qa_03']);
    assert.ok(['x', 'y'].includes(contactIndex([{ id: 'x', mergedIntoId: 'y' }, { id: 'y', mergedIntoId: 'x' }]).survivor('x')), 'a loop ends');
    assert.deepEqual(engagedContacts([act('m3', 'Call', '2026-10-03', ['con_qa_03'])], [DUP]).map((p) => p.name), ['Priya Shah'],
        'a list holding only the duplicate names the survivor by it');
    const BEA = person('con_b', 'Bea', 'Lo');
    const onlyDup = dealCommittee({ contactIds: ['con_qa_03', 'con_b'], contacts: 'Bea Lo, Priya Shah (PL)' }, [DUP, BEA], []);
    assert.deepEqual(onlyDup.map((p) => [p.id, p.name]), [['con_qa_03', 'Priya Shah'], ['con_b', 'Bea Lo']],
        'and so does the committee — not "Contact not in your list"');
    const chain = contactIndex([{ id: 'a', mergedIntoId: 'b' }, { id: 'b', mergedIntoId: 'c' }, { id: 'c' }]);
    assert.equal(chain.survivor('a'), 'c', 'a two-step merge reads as its last survivor');
});

test('a rep whose list lacks Tom: Tom is named from the deal\'s text at his place, with his touches', () => {
    const p = dealCommittee(BLUEBIRD, [PRIYA], [act('t', 'Call', '2026-10-05', ['con_qa_04'])]);
    assert.deepEqual(p.map((x) => [x.id, x.name, x.title, x.engagement.count]),
        [['con_qa_03', 'Priya Shah', 'Procurement Lead', 0], ['con_qa_04', 'Tom Becker', 'Plant Manager', 1]]);
});

test('a renamed contact is named as the contacts list names them now; a cleared title stays cleared', () => {
    const renamed = dealCommittee({ contactIds: ['con_qa_03'], contacts: 'Priya Shah (Procurement Lead)' }, [person('con_qa_03', 'Priya', 'Patel', 'CFO')], []);
    assert.deepEqual(renamed.map((p) => [p.name, p.title]), [['Priya Patel', 'CFO']]);
    const cleared = dealCommittee({ contactIds: ['con_ann'], contacts: 'Ann Lee (Old Title)' }, [person('con_ann', 'Ann', 'Lee', '')], []);
    assert.equal(cleared[0].title, '');
});

test('text out of step with the ids: an id the caller cannot name is not given another\'s name', () => {
    const p = dealCommittee({ contactIds: ['c_cy'], contacts: 'Ann Old, Bea Old, Cy New (Buyer)' }, [], []);
    assert.deepEqual(p.map((x) => [x.key, x.name]), [['c_cy', ''], ['listed-0', 'Ann Old'], ['listed-1', 'Bea Old'], ['listed-2', 'Cy New']]);
});

test('a kept name left at a removed person\'s id (the old × by index) — the kept person stays, the removed one has no place', () => {
    // From text "Cy Dee, Ann Lee (CFO)" with ids [con_a] (Cy saved before ids): the old × on
    // Ann removed the name at index 1 and the id at index 1 — there was none — leaving
    // "Cy Dee" beside Ann's id.
    const ANN = person('con_a', 'Ann', 'Lee', 'CFO');
    const CY = person('con_cy', 'Cy', 'Dee');
    const p = dealCommittee({ contactIds: ['con_a'], contacts: 'Cy Dee' }, [ANN, CY], [act('c', 'Call', '2026-10-05', ['con_cy'])]);
    assert.deepEqual(p.map((x) => [x.id, x.name, x.slots, x.engagement.count]), [['con_a', 'Ann Lee', [], 0], ['con_cy', 'Cy Dee', [0], 1]]);
    assert.deepEqual(withoutPerson(['Cy Dee'], ['con_a'], p[0]), { contacts: ['Cy Dee'], contactIds: [] }, 'the × on Ann keeps Cy');
});

test('a picker offers no one already on the deal — by id, a merged duplicate by its survivor; a name only when it is not there', () => {
    const renamed = person('con_qa_03', 'Priya', 'Patel', 'CFO');
    const DUP = person('con_dup', 'Priya', 'Shah', '', { mergedIntoId: 'con_qa_03' });
    const committee = dealCommittee(BLUEBIRD, [renamed, TOM, DUP], []);
    const onDeal = onDealOf(committee, [renamed, TOM, DUP]);
    assert.ok(onDeal(renamed), 'renamed: her text no longer names her, her id does');
    assert.ok(onDeal(DUP), 'her merged duplicate');
    assert.ok(onDeal(TOM));
    assert.ok(!onDeal(person('con_new', 'Dana', 'Whit')), 'Dana Whit is not Dana Whitaker');
    assert.ok(!onDeal(null) && !onDeal({}));
    assert.ok(!onDealOf(undefined, undefined)(TOM));
});

test('a deal saved before ids: a name is the one contact of that whole name, any case — never a prefix, never a guess between two', () => {
    const ANN = person('con_ann', 'Ann', 'Lee');
    const p = dealCommittee({ contactIds: [], contacts: 'ann lee, Bo Chen (CFO)' }, [ANN], [act('l', 'Call', '2026-10-01', ['con_ann'])]);
    assert.deepEqual(rows(p), [['con_ann', 'Ann Lee', 1, '2026-10-01'], [null, 'Bo Chen', 0, null]]);
    assert.equal(p[1].title, 'CFO');
    assert.equal(dealCommittee({ contacts: 'Ann Lee' }, [ANN, person('con_ann2', 'Ann', 'Lee')], [])[0].id, null, 'two Ann Lees: no id');
    assert.equal(dealCommittee({ contacts: 'Ann Leeson' }, [ANN], [])[0].id, null, 'not a prefix');
});

test('ids and legacy names together: each person once, their places in the text recorded', () => {
    const ANN = person('con_ann', 'Ann', 'Lee');
    const CY = person('con_cy', 'Cy', 'Dee', 'CFO');
    assert.deepEqual(dealCommittee({ contactIds: ['con_cy'], contacts: 'Ann Lee, Bo Chen, Cy Dee (CFO)' }, [CY, ANN], []).map((p) => [p.id, p.name]),
        [['con_cy', 'Cy Dee'], ['con_ann', 'Ann Lee'], [null, 'Bo Chen']]);
    const twice = dealCommittee({ contactIds: ['con_qa_03'], contacts: 'Priya Shah (Procurement Lead), Ann Lee, Priya Shah' }, [PRIYA, ANN], []);
    assert.deepEqual(twice.map((p) => p.id), ['con_qa_03', 'con_ann']);
    assert.deepEqual(twice[0].slots, [0, 2]);
    const bo = dealCommittee({ contacts: 'Bo Chen, Bo Chen (CFO)' }, [], []);
    assert.equal(bo.length, 1);
    assert.deepEqual(bo[0].slots, [0, 1]);
});

test('an id the text does not name, and text in another order', () => {
    assert.deepEqual(dealCommittee({ contactIds: ['con_qa_03', 'con_gone'], contacts: 'Priya Shah' }, [PRIYA], []).map((p) => [p.id, p.name]),
        [['con_qa_03', 'Priya Shah'], ['con_gone', '']]);
    const swapped = { contactIds: ['con_qa_03', 'con_qa_04'], contacts: 'Tom Becker (Plant Manager), Priya Shah (Procurement Lead)' };
    assert.deepEqual(dealCommittee(swapped, [PRIYA, TOM], []).map((p) => [p.id, p.name]), [['con_qa_03', 'Priya Shah'], ['con_qa_04', 'Tom Becker']]);
    assert.ok(!dealCommittee(swapped, [PRIYA], []).some((p) => p.id === 'con_qa_04' && p.name === 'Priya Shah'), 'never paired by position');
});

test('the deal\'s text: a comma inside a title is one person; an unclosed "(" falls back to ", "', () => {
    assert.deepEqual(listedContacts('Priya Shah (Procurement Lead), Tom Becker').map((t) => [t.name, t.title]), [['Priya Shah', 'Procurement Lead'], ['Tom Becker', '']]);
    assert.deepEqual(listedContacts('Grace Kim (VP, Operations)').map((t) => [t.name, t.title]), [['Grace Kim', 'VP, Operations']]);
    assert.deepEqual(listedContacts(' , ,Ann Lee,').map((t) => t.name), ['Ann Lee']);
    assert.deepEqual(listedContacts('Ann Lee (Interim, Bo Chen').map((t) => t.name), ['Ann Lee (Interim', 'Bo Chen']);
    for (const v of [null, undefined, '', ['Ann Lee']]) assert.deepEqual(listedContacts(v), []);
    assert.equal(personLabel({ name: 'Ann Lee', title: 'CFO' }), 'Ann Lee (CFO)');
    assert.equal(personLabel({ name: 'Ann Lee', title: '' }), 'Ann Lee');
});

test('everyone the activities name, latest touch first — on the committee or not; a contact the caller lacks has no name', () => {
    const OZ = person('con_oz', 'Oz', 'Out');
    // Out of date order on purpose: the order is the sort's, not the fixture's.
    const acts = [act('e4', 'Call', '2026-09-20', ['con_x']), act('e3', 'Meeting', '2026-10-01', ['con_qa_04']),
        act('e1', 'Call', '2026-10-03', ['con_oz']), act('e2', 'Email', '2026-10-02', ['con_qa_03'])];
    assert.deepEqual(engagedContacts(acts, [PRIYA, TOM, OZ]).map((p) => [p.name, p.engagement.count]),
        [['Oz Out', 1], ['Priya Shah', 1], ['Tom Becker', 1], ['', 1]]);
    assert.equal(engagedLabel({ name: 'Ann Lee', engagement: { count: 2, lastTouch: null } }), 'Ann Lee (2 activities)');
});

test('the form\'s ×: removes the person it shows — every id and every place in the text — not the index', () => {
    const ANN = person('con_ann', 'Ann', 'Lee');
    const CY = person('con_cy', 'Cy', 'Dee', 'CFO');
    const form = dealCommittee({ contactIds: ['con_cy'], contacts: ['Ann Lee', 'Cy Dee (CFO)'].join(', ') }, [CY, ANN], []);
    assert.deepEqual(form.map((p) => [p.id, p.rawIds, p.slots]), [['con_cy', ['con_cy'], [1]], ['con_ann', [], [0]]]);
    assert.deepEqual(withoutPerson(['Ann Lee', 'Cy Dee (CFO)'], ['con_cy'], form[1]), { contacts: ['Cy Dee (CFO)'], contactIds: ['con_cy'] },
        'by index, removing Ann took Cy\'s id');
    assert.deepEqual(withoutPerson(['Ann Lee', 'Cy Dee (CFO)'], ['con_cy'], form[0]), { contacts: ['Ann Lee'], contactIds: [] });
    const DUP = person('con_dup', 'Priya', 'Shah', '', { mergedIntoId: 'con_qa_03' });
    const texts = ['Priya Shah (Procurement Lead)', 'Priya Shah', 'Tom Becker (Plant Manager)'];
    const ids = ['con_dup', 'con_qa_03', 'con_qa_04'];
    const priya = dealCommittee({ contactIds: ids, contacts: texts.join(', ') }, [PRIYA, TOM, DUP], [])[0];
    assert.deepEqual(withoutPerson(texts, ids, priya), { contacts: ['Tom Becker (Plant Manager)'], contactIds: ['con_qa_04'] });
    const grace = dealCommittee({ contacts: 'Grace Kim (VP, Operations), Ann Lee' }, [], [])[0];
    assert.deepEqual(withoutPerson(['Grace Kim (VP, Operations)', 'Ann Lee'], [], grace), { contacts: ['Ann Lee'], contactIds: [] });
    assert.deepEqual(withoutPerson(undefined, undefined, null), { contacts: [], contactIds: [] });
});

test('nothing throws on what a row can hold', () => {
    assert.deepEqual(dealCommittee(null, null, null), []);
    assert.deepEqual(dealCommittee({ contactIds: 'con_qa_03', contacts: null }, [PRIYA], []), []);
    assert.deepEqual(engagedContacts(undefined, undefined), []);
});

// ── PINS ─────────────────────────────────────────────────────────────────────

test('the deal window reads the one rule: the History tile, the log form\'s "With", the Contacts tab, the Quotes panel, the rail, the chips', () => {
    const m = read('src/components/modals/OpportunityModal.jsx');
    assert.ok(m.includes("import { dealCommittee, engagedContacts, listedContacts, onDealOf, personLabel, withoutPerson } from '../../utils/dealEngagement.js';"));
    assert.ok(m.includes("import { contactsToAdd } from '../../utils/buyingCommittee.js';"));
    const hist = between(m, 'function DealHistoryTab(', 'function ContactEngagementTab(');
    assert.ok(hist.includes('const contactsEngaged = engagedContacts(oppActivities, contacts).length;'));
    assert.ok(hist.includes("{ val: contactsEngaged, lbl: 'Contacts engaged', color: T.inkMid },"));
    assert.ok(hist.includes('const [logWith, setLogWith] = React.useState([]);'), 'nobody picked to start');
    assert.ok(hist.includes('const r = await onSaveActivity({ ...newActivity, opportunityId: opportunity.id, contactIds: logWith });'));
    assert.ok(hist.includes('setLogWith([]);'));
    assert.ok(hist.includes('const logPeople = dealCommittee(opportunity, contacts, []).filter((p) => p.id && p.name);'));
    assert.ok(hist.includes('{logPeople.length > 0 && (') && hist.includes('aria-pressed={on}'));
    assert.ok(hist.includes('const on = logWith.includes(p.id);'), 'pressed is who is picked');
    assert.ok(hist.includes('onClick={() => setLogWith((w) => (w.includes(p.id) ? w.filter((x) => x !== p.id) : [...w, p.id]))}'), 'a tap picks, a second unpicks');
    const tab = between(m, 'function ContactEngagementTab(', 'function AiScoreTab(');
    assert.ok(tab.includes("const committee = dealCommittee({ contactIds: selectedContactIds || [], contacts: (selectedContacts || []).join(', ') }, contacts, oppActivities);"), 'the form\'s live people');
    assert.ok(tab.includes('{committee.map(c => ('));
    assert.ok(tab.includes("{c.engagement.lastTouch ? fmtDate(c.engagement.lastTouch) : '—'}"));
    for (const k of ['c.engagement.calls]', 'c.engagement.emails]', 'c.engagement.meetings]']) assert.ok(tab.includes(k), k);
    assert.ok(tab.includes('const onDeal = onDealOf(committee, contacts);'), 'no one on the deal offered again');
    assert.ok(tab.includes('{c.name || UNLISTED_CONTACT}'));
    const quotes = between(m, 'function OppQuotesPanel(', 'function RightRail(');
    assert.ok(quotes.includes('const primaryContact = React.useMemo(() => dealCommittee(opportunity, contacts, []).find((p) => p.name) || null, [opportunity, contacts]);'));
    assert.ok(quotes.includes('{primaryContact.name}{primaryContact.title ?'));
    const rail = between(m, 'function RightRail(', '{/* ── Activity timeline');
    assert.ok(rail.includes('const committee = dealCommittee(opportunity, contacts, oppActivities);'));
    assert.ok(rail.includes('const shownCommittee = committee.slice(0, 5);'));
    assert.ok(rail.includes("Buying committee{committee.length > 0 ? ` · ${committee.length}` : ''}"), 'everyone on the deal in the count');
    assert.ok(rail.includes('{shownCommittee.map((c, i) => ('));
    assert.ok(rail.includes('<EngDot level={engLevel(c.engagement.lastTouch)} size={7}/>'));
    assert.ok(rail.includes('{c.name || UNLISTED_CONTACT}'));
    assert.ok(rail.includes("if (days <= 3) return 'hot';") && rail.includes("if (days <= 10) return 'warm';") && rail.includes("if (days <= 21) return 'cool';"), 'Jeff, 9 Oct: 3 / 10 / 21 days');
    assert.equal(count(m, 'key={c.key}'), 2);
    assert.ok(m.includes('useState(() => listedContacts(opportunity?.contacts).map((t) => t.raw));'), 'a comma title is one chip');
    assert.ok(m.includes("const formCommittee = dealCommittee({ contactIds: selectedContactIds, contacts: selectedContacts.join(', ') }, contacts, []);"));
    assert.ok(m.includes('const formOnDeal = onDealOf(formCommittee, contacts);') && m.includes('&& !formOnDeal(c);'), 'the form picker by id, not a name prefix');
    assert.ok(m.includes('{formCommittee.length > 0 && (') && m.includes('{formCommittee.map(p => (') && m.includes('{p.name ? personLabel(p) : UNLISTED_CONTACT}'));
    const x = between(m, 'const next = withoutPerson(selectedContacts, selectedContactIds, p);', '}} style=');
    for (const w of ['setSelectedContacts(next.contacts);', 'setSelectedContactIds(next.contactIds);', "handleChange('contacts', next.contacts.join(', '));"]) assert.ok(x.includes(w), `the × writes ${w}`);
    const live = code(m);
    for (const gone of ['selectedContactIds.filter((_, i) => i !== idx)', 'contactEngagement', 'contactEngMap', 'oppContactNames', 'enrichedContacts', 'a.contactName']) {
        assert.ok(!live.includes(gone), `gone: ${gone}`);
    }
});

test('Home\'s Missing stakeholder: the same rule, by id, and a title that says what it counts', () => {
    const h = read('src/Tabs/HomeTab.jsx');
    assert.ok(h.includes("import { contactIndex, dealCommittee } from '../utils/dealEngagement.js';"));
    assert.ok(h.includes('        const directory = contactIndex(contacts);'), 'indexed once, not per deal');
    assert.ok(h.includes('            const committee = dealCommittee(opp, directory, oppActs);'));
    assert.ok(h.includes('            const engagedHere = committee.filter(p => p.engagement.count > 0);'));
    assert.ok(h.includes('            if (committee.length >= 2 && engagedHere.length < 2 && arr >= 20000) {'), 'the rule unchanged');
    assert.ok(h.includes('title: `${name} has ${committee.length} contacts, ${engagedHere.length} engaged`,'));
    assert.ok(h.includes("body: `${committee.find(p => p.engagement.count === 0 && p.name)?.name || 'Key contact'} not engaged.`,"), 'the body names someone not engaged');
    assert.ok(!h.includes('no economic buyer'), 'it never looked for one');
});

test('ai-score.mjs tells the model who was engaged — names looked up by id, in this org, after the cache', () => {
    const s = read('netlify/functions/ai-score.mjs');
    assert.ok(s.includes("import { opportunities, activities, settings, contacts } from '../../db/schema.js';"));
    assert.ok(s.includes("import { eq, and, inArray } from 'drizzle-orm';"));
    assert.ok(s.includes("import { activityContactIds, dealCommittee, engagedContacts, engagedLabel, personLabel } from '../../src/utils/dealEngagement.js';"));
    assert.ok(s.includes('            .where(and(eq(contacts.orgId, orgId), inArray(contacts.id, ids)));'), 'this org only');
    assert.ok(s.includes('mergedIntoId: contacts.mergedIntoId })'), 'the merge column, to fold a duplicate');
    assert.ok(s.includes('            ...(Array.isArray(opp.contactIds) ? opp.contactIds : []),') && s.includes('            ...oppActivities.flatMap(activityContactIds),'), 'the deal\'s people and its activities\'');
    assert.ok(s.includes('        let directory = namedIds.length ? await contactsIn(namedIds) : [];'));
    assert.ok(s.includes('            const next = [...new Set(directory.map((c) => c.mergedIntoId).filter((id) => id && !have.has(id)))];')
        && s.includes('            directory = directory.concat(await contactsIn(next));'), 'a merge chain followed, in this org');
    assert.ok(s.includes('const listedPeople = dealCommittee(opp, directory, oppActivities).filter((p) => p.name);'));
    assert.ok(s.includes('const engagedPeople = engagedContacts(oppActivities, directory).filter((p) => p.name);'));
    assert.ok(s.includes("- Contacts listed: ${listedPeople.length ? listedPeople.map(personLabel).join(', ') : 'none'}"));
    assert.ok(s.includes("- Contacts engaged: ${engagedPeople.length ? engagedPeople.map(engagedLabel).join(', ') : 'none'}"), 'with last touch and count');
    assert.ok(!s.includes('${opp.contacts'), 'the stale text is not the list');
    assert.ok(s.indexOf('const cached = opp.aiScore;') > 0 && s.indexOf('const cached = opp.aiScore;') < s.indexOf('await contactsIn(namedIds)'), 'a cached answer costs no query');
});

test('the suites: this file is graded by the harness; the prompt\'s integration test runs', () => {
    assert.ok(read('scripts/mutate-import.mjs').includes(' tests/deal-engagement.test.mjs'));
    assert.ok(JSON.parse(read('package.json')).scripts['test:int'].includes('tests/integration/ai-score.itest.mjs'));
});

// ── THE GUARDS ───────────────────────────────────────────────────────────────

// Any read (a.contactName, x[0]?.contactName, ['contactName']) or key (contactName:) —
// counted per file, so a second one in a known file fails too.
const CONTACT_NAME = /\.contactName\b|\[\s*['"`]contactName['"`]\s*\]|\bcontactName\s*:/g;
const hitsIn = (src, re) => [...code(src).matchAll(re)].length;
const countsOver = (re) => Object.fromEntries(files.map((f) => [f, hitsIn(read(f), re)]).filter(([, n]) => n));

test('G1: nothing reads or writes contactName but the dispatch customer\'s column', () => {
    assert.ok(files.length > 250, `the walk reached the tree (${files.length})`);
    // dispatch_customers.contact_name (db/schema.ts) — a column of its own, not an activity's.
    assert.deepEqual(countsOver(CONTACT_NAME), {
        'src/Tabs/DispatchTab.jsx': 1,
        'netlify/functions/dispatch-customers.mjs': 4,
        'netlify/functions/_customerNotify.mjs': 1,
    });
    const schema = between(read('db/schema.ts'), "export const activities = pgTable('activities', {", '\n}, (t) =>');
    assert.ok(!schema.includes('contactName') && schema.includes("jsonb('contact_ids')"), 'an activity has no contact name');
});

test('G1 finds the shape as it was', () => {
    assert.equal(hitsIn('oppActivities.forEach(a => { if (a.contactName) {} });', CONTACT_NAME), 1);
    assert.equal(hitsIn("onSaveActivity({ ...newActivity, contactName: '' })", CONTACT_NAME), 1);
    assert.equal(hitsIn('const n = acts[0]?.contactName || f().contactName;', CONTACT_NAME), 2);
    assert.equal(hitsIn("const n = a['contactName'];", CONTACT_NAME), 1);
    assert.equal(hitsIn('// It read activity.contactName, which no activity has', CONTACT_NAME), 0, 'a comment is not code');
    assert.equal(hitsIn("function D({ contactName = '' }) { return <X contactName={contactName}/>; }", CONTACT_NAME), 0, 'a prop of its own');
});

// Any split of a `contacts` value, whatever the separator.
const TEXT_SPLIT = /\bcontacts\b[^;\n]{0,40}\.split\(/g;

test('G2: nothing splits a deal\'s contacts text but the two recorded — dealEngagement.js reads it', () => {
    assert.deepEqual(countsOver(TEXT_SPLIT), {
        'src/utils/contactDeals.js': 1,               // the delete check's legacy matcher (§0.176)
        'netlify/functions/quote-email.mjs': 1,       // the fallback recipient — its own batch
    });
    assert.equal(hitsIn("const contactNames    = (opp.contacts||'').split(', ').filter(Boolean);", TEXT_SPLIT), 1, 'finds the shape as it was');
    assert.equal(hitsIn("const names = deal.contacts.split(',');", TEXT_SPLIT), 1);
});
