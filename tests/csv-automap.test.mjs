// Auto-mapping regressions, driven by REAL export header rows.
//
// Every assertion below was a wrong mapping the old inline matcher actually
// produced, verified against a genuine Outlook export before this was written.
// Each one is a mutation test in reverse: revert csvAutoMap.js to first-match
// substring behaviour and these fail.
import { test } from 'node:test';
import assert from 'node:assert';
import { autoMapHeaders, scoreMatch, normalize } from '../src/utils/csvAutoMap.js';

const contactFields = [
    { key: 'firstName', label: 'First Name' }, { key: 'middleName', label: 'Middle Name' },
    { key: 'lastName', label: 'Last Name' }, { key: 'email', label: 'Email' },
    { key: 'personalEmail', label: 'Email 2' }, { key: 'phone', label: 'Business Phone' },
    { key: 'mobile', label: 'Mobile Phone' }, { key: 'title', label: 'Title / Job Title' },
    { key: 'company', label: 'Company' }, { key: 'workLocation', label: 'Work Location' },
    { key: 'address', label: 'Address' }, { key: 'city', label: 'City' },
    { key: 'state', label: 'State/Prov.' }, { key: 'zip', label: 'ZIP Code' },
    { key: 'country', label: 'Country' },
];

// Genuine Microsoft Outlook / 365 contacts export header row.
const OUTLOOK = ['First Name', 'Middle Name', 'Last Name', 'Title', 'Suffix', 'Nickname',
    'Given Yomi', 'Surname Yomi', 'E-mail Address', 'E-mail 2 Address', 'E-mail 3 Address',
    'Home Phone', 'Home Phone 2', 'Business Phone', 'Business Phone 2', 'Mobile Phone',
    'Car Phone', 'Other Phone', 'Primary Phone', 'Pager', 'Business Fax', 'Home Fax',
    'Company Main Phone', 'Job Title', 'Department', 'Company', 'Office Location',
    "Manager's Name", "Assistant's Name", 'Notes', 'Business Street', 'Business City',
    'Business State', 'Business Postal Code', 'Business Country/Region', 'Home Street',
    'Home City', 'Home State', 'Home Postal Code', 'Home Country/Region', 'Web Page', 'Birthday'];

const at = (headers, mapping, key) => mapping[key] === undefined ? null : headers[mapping[key]];

test('Outlook: the four fields the old matcher got wrong', () => {
    const { mapping } = autoMapHeaders(OUTLOOK, contactFields);
    // was "Company Main Phone" — a phone number in the Company column
    assert.equal(at(OUTLOOK, mapping, 'company'), 'Company');
    // was "E-mail Address" — an email in the Address column
    assert.equal(at(OUTLOOK, mapping, 'address'), 'Business Street');
    // was "Home Phone" — first header containing "phone" won
    assert.equal(at(OUTLOOK, mapping, 'phone'), 'Business Phone');
    // was "Title", Outlook's HONORIFIC column (Mr./Dr.), not the job title
    assert.equal(at(OUTLOOK, mapping, 'title'), 'Job Title');
});

test('Outlook: the fields that were already right stay right', () => {
    const { mapping } = autoMapHeaders(OUTLOOK, contactFields);
    assert.equal(at(OUTLOOK, mapping, 'firstName'), 'First Name');
    assert.equal(at(OUTLOOK, mapping, 'lastName'), 'Last Name');
    assert.equal(at(OUTLOOK, mapping, 'middleName'), 'Middle Name');
    assert.equal(at(OUTLOOK, mapping, 'email'), 'E-mail Address');
    assert.equal(at(OUTLOOK, mapping, 'mobile'), 'Mobile Phone');
    assert.equal(at(OUTLOOK, mapping, 'city'), 'Business City');
    assert.equal(at(OUTLOOK, mapping, 'zip'), 'Business Postal Code');
});

test('Yomi columns are never mapped', () => {
    // Phonetic-reading columns Outlook emits for every contact regardless of
    // locale. They are near-always empty and must not take a name slot.
    const { mapping } = autoMapHeaders(OUTLOOK, contactFields);
    const taken = Object.values(mapping).map(i => OUTLOOK[i]);
    assert.ok(!taken.includes('Given Yomi'), 'Given Yomi was mapped');
    assert.ok(!taken.includes('Surname Yomi'), 'Surname Yomi was mapped');
});

test('one header is never claimed by two fields', () => {
    // The Outlook set alone cannot prove this — no two fields there compete for
    // the same column, so the assertion held even with the constraint deleted.
    // (Caught by mutation-testing this suite.) These two fields genuinely
    // collide: "Company" is an exact match for `company` (1.0) and a weighted
    // alias of `account` (0.9). The stronger claim wins and the weaker field
    // gets nothing, rather than both pointing at the same column.
    const fields = [{ key: 'company', label: 'Company' }, { key: 'account', label: 'Account' }];
    const { mapping } = autoMapHeaders(['Company'], fields);
    assert.equal(mapping.company, 0);
    assert.equal(mapping.account, undefined);

    // And the original invariant, across the full real-world set.
    const outlookMap = autoMapHeaders(OUTLOOK, contactFields).mapping;
    const idxs = Object.values(outlookMap);
    assert.equal(idxs.length, new Set(idxs).size, 'a header was assigned twice');
});

test('column ORDER does not change the result', () => {
    // The core defect: the old matcher was findIndex-based, so the answer
    // depended on which column happened to come first in the file.
    const forward = autoMapHeaders(OUTLOOK, contactFields).mapping;
    const reversed = [...OUTLOOK].reverse();
    const back = autoMapHeaders(reversed, contactFields).mapping;
    for (const f of contactFields) {
        assert.equal(
            at(reversed, back, f.key), at(OUTLOOK, forward, f.key),
            `${f.key} changed when the columns were reordered`,
        );
    }
});

test('a wrong-but-plausible header is not taken when the right one is absent', () => {
    // No "Company" column at all. Mapping a phone number into Company is worse
    // than mapping nothing: a blank is visible, a phone number reads as data.
    const headers = ['First Name', 'Last Name', 'Company Main Phone'];
    const { mapping } = autoMapHeaders(headers, contactFields);
    assert.equal(mapping.company, undefined);
});

test('confidence is honest — a weak match reports below the warn threshold', () => {
    // The UI warns under 0.85. The old code gave a buried substring 0.85, so a
    // wrong mapping rendered green. Anything inexact must now fall below it.
    const { confidence } = autoMapHeaders(['Full Name', 'Role', 'Org'], contactFields);
    for (const [k, v] of Object.entries(confidence)) {
        assert.ok(v < 0.85, `${k} claimed ${v} confidence on an inexact header`);
    }
});

test('exact matches report full confidence', () => {
    const { confidence } = autoMapHeaders(OUTLOOK, contactFields);
    assert.equal(confidence.firstName, 1);
    assert.equal(confidence.company, 1);
    assert.equal(confidence.title, 1);
});

test('Google Contacts export', () => {
    const google = ['Given Name', 'Family Name', 'Name Prefix', 'Organization Name',
        'Organization Title', 'E-mail 1 - Value', 'Phone 1 - Value', 'Address 1 - Street',
        'Address 1 - City', 'Address 1 - Region', 'Address 1 - Postal Code'];
    const { mapping } = autoMapHeaders(google, contactFields);
    assert.equal(at(google, mapping, 'firstName'), 'Given Name');
    assert.equal(at(google, mapping, 'lastName'), 'Family Name');
    assert.equal(at(google, mapping, 'company'), 'Organization Name');
});

test('empty and junk headers are ignored', () => {
    const { mapping } = autoMapHeaders(['', '   ', '###', 'First Name'], contactFields);
    assert.equal(mapping.firstName, 3);
    assert.equal(Object.keys(mapping).length, 1);
});

test('no headers at all yields an empty mapping, not a throw', () => {
    const { mapping, confidence } = autoMapHeaders([], contactFields);
    assert.deepEqual(mapping, {});
    assert.deepEqual(confidence, {});
});

test('normalize strips punctuation and case', () => {
    assert.equal(normalize('E-mail 2 Address'), 'email2address');
    assert.equal(normalize('  Business Country/Region '), 'businesscountryregion');
    assert.equal(normalize(null), '');
});

test('deny rules beat alias weight', () => {
    // "companymainphone" contains "company" but must score 0 for the company field.
    assert.equal(scoreMatch('company', 'Company', 'Company Main Phone'), 0);
    assert.equal(scoreMatch('address', 'Address', 'E-mail Address'), 0);
    assert.equal(scoreMatch('phone', 'Business Phone', 'Home Phone'), 0);
});
