// tests/report-scope.test.mjs
//
// The Activity report's "Total activities" read 23 for every rep a manager
// selected, because the Rep / Team / Territory slice was applied to
// opportunities and never to activities (0.67). The slice is pure here and
// the wiring in ReportsTab is pinned as text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activityRepOf, repsForSlice, sliceActivities } from '../src/utils/reportScope.js';

const USERS = [
    { name: 'Savannah Miller', team: 'Enterprise West', territory: 'West' },
    { name: 'Karen Russell',   team: 'Enterprise West', territory: 'West' },
    { name: 'Ryan Algie',      team: 'Field',           territory: 'Central' },
    { name: 'Jeff Russell',    team: '',                territory: '' },
    { team: 'Ghost' },                                   // no name: never selectable
];
const ACTS = [
    { id: 1, rep: 'Savannah Miller', type: 'Call' },
    { id: 2, salesRep: 'Savannah Miller', type: 'Email' },
    { id: 3, assignedTo: 'Karen Russell', type: 'Meeting' },
    { id: 4, author: 'Ryan Algie', type: 'Note' },
    { id: 5, type: 'Call' },                             // no rep at all
    { id: 6, author: 'Jeff Russell', type: 'Demo' },
];
const ids = (list) => list.map(a => a.id);

test('activityRepOf reads the four fields in the order the reports use', () => {
    assert.equal(activityRepOf({ rep: 'A', salesRep: 'B', assignedTo: 'C', author: 'D' }), 'A');
    assert.equal(activityRepOf({ salesRep: 'B', author: 'D' }), 'B');
    assert.equal(activityRepOf({ assignedTo: 'C', author: 'D' }), 'C');
    assert.equal(activityRepOf({ author: 'D' }), 'D');
    assert.equal(activityRepOf({}), '');
    assert.equal(activityRepOf(null), '');
});

test('no slice: every activity, untouched', () => {
    assert.equal(repsForSlice({}, USERS), null);
    assert.equal(sliceActivities(ACTS, {}, USERS), ACTS);
    assert.equal(sliceActivities(ACTS, null, USERS), ACTS);
});

test('REGRESSION: a rep slice narrows activities to that rep, across all four rep fields', () => {
    assert.deepEqual(ids(sliceActivities(ACTS, { rep: 'Savannah Miller' }, USERS)), [1, 2]);
    assert.deepEqual(ids(sliceActivities(ACTS, { rep: 'Karen Russell' }, USERS)), [3]);
    assert.deepEqual(ids(sliceActivities(ACTS, { rep: 'Ryan Algie' }, USERS)), [4]);
    assert.notEqual(sliceActivities(ACTS, { rep: 'Savannah Miller' }, USERS).length, ACTS.length, 'the count must change with the rep');
});

test('a team slice resolves to the team\'s names through users', () => {
    assert.deepEqual([...repsForSlice({ team: 'Enterprise West' }, USERS)].sort(), ['Karen Russell', 'Savannah Miller']);
    assert.deepEqual(ids(sliceActivities(ACTS, { team: 'Enterprise West' }, USERS)), [1, 2, 3]);
});

test('a territory slice resolves the same way', () => {
    assert.deepEqual(ids(sliceActivities(ACTS, { territory: 'Central' }, USERS)), [4]);
});

test('rep wins over team wins over territory when more than one is set', () => {
    assert.deepEqual([...repsForSlice({ rep: 'Ryan Algie', team: 'Enterprise West' }, USERS)], ['Ryan Algie']);
    assert.deepEqual([...repsForSlice({ team: 'Field', territory: 'West' }, USERS)], ['Ryan Algie']);
});

test('under a slice, an activity with no rep belongs to nobody selected', () => {
    assert.ok(!ids(sliceActivities(ACTS, { team: 'Enterprise West' }, USERS)).includes(5));
    assert.ok(!ids(sliceActivities(ACTS, { rep: 'Jeff Russell' }, USERS)).includes(5));
});

test('a team nobody is on selects nothing, not everything', () => {
    assert.deepEqual(sliceActivities(ACTS, { team: 'Nobody' }, USERS), []);
    assert.deepEqual(sliceActivities(ACTS, { team: 'Ghost' }, USERS), [], 'a user row without a name cannot be selected');
});

test('users missing entirely: rep slice still works, team/territory select nothing', () => {
    assert.deepEqual(ids(sliceActivities(ACTS, { rep: 'Ryan Algie' }, undefined)), [4]);
    assert.deepEqual(sliceActivities(ACTS, { team: 'Field' }, undefined), []);
});

// ── the wiring ──────────────────────────────────────────────────────────────

test('ReportsTab builds the timed activity set from the SLICED activities, not the role-gated list', () => {
    const src = readFileSync(new URL('../src/Tabs/ReportsTab.jsx', import.meta.url), 'utf8');
    assert.match(src, /const reportsActivities = sliceActivities\(roleFilteredActivities, \{ rep: reportsRep, team: reportsTeam, territory: reportsTerritory \}, settings\.users\);/);
    assert.match(src, /\? reportsActivities\.filter\(a => inRange\(dayOf\(a\.date \|\| a\.createdAt\), reportRange\)\)/, 'reportsTimedActivities must start from the sliced set');
    assert.doesNotMatch(src, /roleFilteredActivities\.filter\(a => inRange/, 'the unsliced start is the bug');
    assert.match(src, /from '\.\.\/utils\/reportScope'/);
});
