// tests/contact-deals.test.mjs
//
// A contact's deals (state §0.176). As Karen in Accelerep QA, the Contacts tab
// showed "2 opps" for Grace Kim, Omar Haddad, Tom Becker and Priya Shah, and
// each one's rail listed one deal; Dana Whitaker's and Luis Ortega's showed 2
// and listed 2 (Jeff, 6 Oct: "I am concerned it is randomly correct and not
// accurately correct"). Not random: the badge counted closed deals too, the
// rail listed open ones only, and only Dana's and Luis's deals were all open.
// Jeff: "All I want showing are active deals - not closed". The badge, the rail
// and the delete check now read one function, src/utils/contactDeals.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { isOpenDeal, dealNamesContact, activeDealsOf } from '../src/utils/contactDeals.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// Accelerep QA's six deals that name them, as stored on 6 Oct (read-only SELECT).
const deal = (opportunityName, stage, contactIds, contacts) => ({ id: opportunityName, opportunityName, stage, contactIds, contacts });
const QA_DEALS = [
    deal('Bluebird HVAC Supply — Annual Renewal', 'Closed Won', ['con_qa_03', 'con_qa_04'], 'Priya Shah (Procurement Lead), Tom Becker (Plant Manager)'),
    deal('Bluebird HVAC Supply — Warehouse Scheduling', 'Negotiation/Review', ['con_qa_03', 'con_qa_04'], 'Priya Shah (Procurement Lead), Tom Becker (Plant Manager)'),
    deal('Cedar Ridge Property Management — Maintenance Dispatch Pilot', 'Discovery', ['con_qa_05', 'con_qa_06'], 'Grace Kim (VP Operations), Omar Haddad (IT Director)'),
    deal('Cedar Ridge Property Management — Tenant Portal', 'Closed Lost', ['con_qa_05', 'con_qa_06'], 'Grace Kim (VP Operations), Omar Haddad (IT Director)'),
    deal('Northwind Facilities Group — Facilities Platform Rollout', 'Proposal', ['con_qa_01', 'con_qa_02'], 'Dana Whitaker (Facilities Director), Luis Ortega (Operations Manager)'),
    deal('Northwind Facilities Group — Service Desk Expansion', 'Contracts', ['con_qa_01', 'con_qa_02'], 'Dana Whitaker (Facilities Director), Luis Ortega (Operations Manager)'),
];
const person = (id, firstName, lastName) => ({ id, firstName, lastName });
const GRACE = person('con_qa_05', 'Grace', 'Kim');
const OMAR = person('con_qa_06', 'Omar', 'Haddad');
const TOM = person('con_qa_04', 'Tom', 'Becker');
const PRIYA = person('con_qa_03', 'Priya', 'Shah');
const DANA = person('con_qa_01', 'Dana', 'Whitaker');
const LUIS = person('con_qa_02', 'Luis', 'Ortega');
const names = (list) => list.map((o) => o.opportunityName);

// ── the report ──────────────────────────────────────────────────────────────

test('REGRESSION: the six contacts count and list their open deals only — 1, 1, 1, 1, 2, 2', () => {
    assert.deepEqual(names(activeDealsOf(GRACE, QA_DEALS)), ['Cedar Ridge Property Management — Maintenance Dispatch Pilot']);
    assert.deepEqual(names(activeDealsOf(OMAR, QA_DEALS)), ['Cedar Ridge Property Management — Maintenance Dispatch Pilot']);
    assert.deepEqual(names(activeDealsOf(TOM, QA_DEALS)), ['Bluebird HVAC Supply — Warehouse Scheduling']);
    assert.deepEqual(names(activeDealsOf(PRIYA, QA_DEALS)), ['Bluebird HVAC Supply — Warehouse Scheduling']);
    assert.deepEqual(names(activeDealsOf(DANA, QA_DEALS)), ['Northwind Facilities Group — Facilities Platform Rollout', 'Northwind Facilities Group — Service Desk Expansion']);
    assert.deepEqual(names(activeDealsOf(LUIS, QA_DEALS)), ['Northwind Facilities Group — Facilities Platform Rollout', 'Northwind Facilities Group — Service Desk Expansion']);
});

// ── open or closed ──────────────────────────────────────────────────────────

test('Closed Won and Closed Lost are not open — in any case, padded, or bare won / lost', () => {
    for (const stage of ['Closed Won', 'Closed Lost', 'closed won', 'CLOSED LOST', ' Closed Lost ', 'Won', 'lost']) {
        assert.equal(isOpenDeal({ stage }), false, stage);
    }
});

test('every other stage is open, and so is a deal with no stage (as the rail had it)', () => {
    for (const stage of ['Qualification', 'Discovery', 'Evaluation (Demo)', 'Proposal', 'Negotiation/Review', 'Contracts', 'Closing', '', null, undefined]) {
        assert.equal(isOpenDeal({ stage }), true, String(stage));
    }
    assert.equal(isOpenDeal({}), true);
    assert.equal(isOpenDeal(null), true);
});

// ── naming the contact ──────────────────────────────────────────────────────

test('by id: a deal whose contactIds hold the contact names it, whatever its text says', () => {
    assert.equal(dealNamesContact({ contactIds: ['con_qa_05'], contacts: '' }, GRACE), true);
    assert.equal(dealNamesContact({ contactIds: ['con_qa_05'], contacts: 'Someone Else' }, GRACE), true);
    assert.equal(dealNamesContact({ contactIds: ['con_qa_06'] }, GRACE), false);
});

test('by id: only an array of ids — a string is not searched for a substring', () => {
    assert.equal(dealNamesContact({ contactIds: 'xcon_qa_05' }, GRACE), false);
    assert.equal(dealNamesContact({ contactIds: '["con_qa_05"]' }, GRACE), false);
});

test('by name (saved before ids): "First Last" or "First Last (role)", in any case, among commas', () => {
    for (const contacts of ['Grace Kim', 'Grace Kim (VP Operations)', 'grace kim', 'GRACE KIM (vp operations)', 'Omar Haddad, Grace Kim', '  Grace Kim  ,Omar Haddad', 'Grace Kim (VP, Operations)']) {
        assert.equal(dealNamesContact({ contactIds: [], contacts }, GRACE), true, contacts);
    }
});

test('by name: never a prefix — "Grace Kimball" and "Grace Kim Jr" are not Grace Kim', () => {
    // The delete check matched any name that began with the contact's: a deal
    // naming "Grace Kimball" blocked deleting "Grace Kim".
    for (const contacts of ['Grace Kimball', 'Grace Kimball (CFO)', 'Grace Kim Jr', 'Grace Kim-Lee', 'Grace']) {
        assert.equal(dealNamesContact({ contactIds: [], contacts }, GRACE), false, contacts);
    }
});

test('a contact with no name and no id names no deal — an empty name is not a match', () => {
    const nameless = { id: '', firstName: '', lastName: '' };
    assert.equal(dealNamesContact({ contactIds: [''], contacts: ', Grace Kim' }, nameless), false);
    assert.deepEqual(activeDealsOf(nameless, [{ stage: 'Discovery', contactIds: [], contacts: ', ,' }]), []);
});

test('a contact missing a first or last name still matches the name it has', () => {
    assert.equal(dealNamesContact({ contacts: 'Cher (Owner)' }, { id: 'c1', firstName: 'Cher' }), true);
    assert.equal(dealNamesContact({ contacts: 'Kim' }, { id: 'c2', lastName: 'Kim' }), true);
});

test('no contact, no deals: nothing, and nothing throws', () => {
    assert.deepEqual(activeDealsOf(null, QA_DEALS), []);
    assert.deepEqual(activeDealsOf(undefined, QA_DEALS), []);
    assert.deepEqual(activeDealsOf(GRACE, null), []);
    assert.deepEqual(activeDealsOf(GRACE, undefined), []);
    assert.equal(dealNamesContact(null, GRACE), false);
    assert.equal(dealNamesContact({ contactIds: ['con_qa_05'] }, null), false);
    assert.equal(dealNamesContact({ contacts: null, contactIds: null }, GRACE), false);
});

test('a deal named both ways is listed once', () => {
    const both = [deal('Both', 'Discovery', ['con_qa_05'], 'Grace Kim (VP Operations)')];
    assert.equal(activeDealsOf(GRACE, both).length, 1);
});

// ── the three places read it ────────────────────────────────────────────────

test('the Contacts tab\'s badge counts the contact\'s open deals — the rail\'s list', () => {
    const src = read('src/Tabs/ContactsTab.jsx');
    assert.ok(src.includes("import { activeDealsOf } from '../utils/contactDeals.js';"));
    assert.ok(src.includes('(visibleContacts || []).forEach(c => { map[c.id] = activeDealsOf(c, opportunities).length; });'), 'the badge');
    assert.ok(!/contactIds\s*&&\s*o\.contactIds\.includes/.test(src), 'a hand-rolled match');
    assert.ok(!src.includes('.split(\',\')'), 'a hand-rolled name match');
});

test('the contact rail lists the contact\'s open deals', () => {
    const src = read('src/components/rails/ContactRail.jsx');
    assert.ok(src.includes("import { activeDealsOf } from '../../utils/contactDeals.js';"));
    assert.ok(src.includes('const openOpps = activeDealsOf(contact, opportunities);'), 'the rail');
    assert.ok(!src.includes("['closed won','closed lost','won','lost']"), 'a second closed set');
});

test('every contact delete keeps a contact on an open deal — the same deals, never a prefix (state §0.178)', () => {
    const src = read('src/hooks/useContacts.js');
    assert.ok(src.includes("import { activeDealsOf } from '../utils/contactDeals.js';"));
    assert.ok(src.includes('const kept = wanted.map(c => ({ c, deal: activeDealsOf(c, deps.opportunities)[0] })).filter(k => k.deal);'), 'the delete check');
    assert.ok(!src.includes('n.startsWith(fullName'), 'the prefix match');
});

test('only contactDeals.js matches a deal to a contact by its legacy names', () => {
    // A deal's "contacts" text split on bare commas and compared to a contact's
    // name is the contact-to-deals match; one module holds it. (The deal modal
    // splits on ", " to list a deal's own people — the other direction.)
    const hits = [];
    const walk = (dir) => {
        for (const name of readdirSync(new URL(`../${dir}`, import.meta.url))) {
            const rel = `${dir}/${name}`;
            if (statSync(new URL(`../${rel}`, import.meta.url)).isDirectory()) { walk(rel); continue; }
            if (!/\.(jsx?|mjs)$/.test(name) || rel === 'src/utils/contactDeals.js') continue;
            if (/contacts\b[^;\n]{0,40}\.split\(\s*','\s*\)/.test(read(rel))) hits.push(rel);
        }
    };
    walk('src');
    assert.deepEqual(hits, []);
});
