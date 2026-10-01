// tests/buying-committee.test.mjs
//
// The deal's Contacts tab offers contacts to add only for a search (state §0.154 —
// Jeff, 1 Oct: "It should not show a list of all contacts"). The rule
// (src/utils/buyingCommittee.js) is RUN here; the tab's wiring is pinned by scan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contactsToAdd } from '../src/utils/buyingCommittee.js';

const C = [
    { id: 'c1', firstName: 'Dana', lastName: 'Whitaker', title: 'Facilities Director', company: 'Northwind Facilities Group' },
    { id: 'c2', firstName: 'Luis', lastName: 'Ortega', title: 'Operations Manager', company: 'Northwind Facilities Group' },
    { id: 'c3', firstName: 'Priya', lastName: 'Shah', title: 'Procurement Lead', company: 'Bluebird HVAC Supply' },
    { id: 'c4', firstName: 'Dana', lastName: 'Whit', company: 'Elsewhere Inc' },
    { id: 'c5', firstName: '', lastName: '', company: 'Northwind Facilities Group' },
];

test('a blank search offers NOBODY — the tab opens on the deal\'s own contacts, not the org\'s list', () => {
    for (const s of ['', '   ', null, undefined]) assert.deepEqual(contactsToAdd(C, s, []), [], JSON.stringify(s));
    assert.deepEqual(contactsToAdd(undefined, 'dana', []), [], 'no contacts loaded yet');
});

test('a search matches a name or a company, in any case; a contact with no name is never offered', () => {
    assert.deepEqual(contactsToAdd(C, 'pri', []).map(c => c.id), ['c3']);
    assert.deepEqual(contactsToAdd(C, '  NORTHWIND ', []).map(c => c.id), ['c1', 'c2'], 'trimmed; c5 has no name to link by');
    assert.deepEqual(contactsToAdd(C, 'zzz', []), []);
});

test('a contact already on the deal is not offered again — by its WHOLE name, with or without a title', () => {
    const linked = ['Dana Whitaker (Facilities Director)', 'luis ortega'];
    assert.deepEqual(contactsToAdd(C, 'northwind', linked), [], 'both already on the deal');
    assert.deepEqual(contactsToAdd(C, 'dana', linked).map(c => c.id), ['c4'], 'Dana Whit is not Dana Whitaker (the old prefix test hid her)');
});

test('the tab asks the rule, and an empty box no longer matches everyone', () => {
    const s = readFileSync(new URL('../src/components/modals/OpportunityModal.jsx', import.meta.url), 'utf8');
    assert.ok(s.includes("import { contactsToAdd } from '../../utils/buyingCommittee.js';"));
    assert.ok(s.includes('const filtered = contactsToAdd(contacts, ctSearch, selectedContacts);'));
    assert.ok(!s.includes('const matchesSearch = !ctSearch'), 'the blank-matches-all filter is gone');
    assert.ok(s.includes('{ctSearch.trim() && filtered.length === 0 && ('), '"No contacts found" only for a real search');
    assert.ok(!s.includes('showCtSuggestions'), 'the unused suggestions flag is gone');
});
