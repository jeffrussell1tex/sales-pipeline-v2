// tests/report-scope.test.mjs
//
// The Activity report's "Total activities" read 23 for every rep a manager
// selected, because the Rep / Team / Territory slice was applied to
// opportunities and never to activities (0.67). The slice is pure here and
// the wiring in ReportsTab is pinned as text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activityRepOf, repsForSlice, sliceActivities, leadRepOf, sliceLeads, visibleReps } from '../src/utils/reportScope.js';

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

// ── Leads and rep lists (0.68 batch 3) ──────────────────────────────────────

const LEADS = [
    { id: 'l1', assignedTo: 'Savannah Miller' },
    { id: 'l2', assignedTo: 'Karen Russell' },
    { id: 'l3', assignedTo: 'Ryan Algie' },
    { id: 'l4' },                                      // unassigned
];

test('REGRESSION: the leads tab honours the rep slice — the same fix activities got', () => {
    assert.deepEqual(ids(sliceLeads(LEADS, { rep: 'Karen Russell' }, USERS)), ['l2']);
    assert.deepEqual(ids(sliceLeads(LEADS, { team: 'Enterprise West' }, USERS)), ['l1', 'l2']);
    assert.deepEqual(ids(sliceLeads(LEADS, { territory: 'Central' }, USERS)), ['l3']);
    assert.equal(sliceLeads(LEADS, {}, USERS), LEADS, 'no slice: untouched');
});

test('under a slice an unassigned lead belongs to nobody selected', () => {
    assert.ok(!ids(sliceLeads(LEADS, { team: 'Enterprise West' }, USERS)).includes('l4'));
});

test('leadRepOf reads assignedTo, the only rep field a lead has', () => {
    assert.equal(leadRepOf({ assignedTo: 'Karen Russell', author: 'x' }), 'Karen Russell');
    assert.equal(leadRepOf({}), '');
    assert.equal(leadRepOf(null), '');
});

test('visibleReps: null scope is everyone; a scope narrows to its names; nothing else leaks', () => {
    const all = ['Karen Russell', 'Ryan Algie', 'Savannah Miller'];
    assert.deepEqual(visibleReps(all, null), all);
    assert.deepEqual(visibleReps(all, ['Karen Russell', 'Savannah Miller']), ['Karen Russell', 'Savannah Miller']);
    assert.deepEqual(visibleReps(all, ['Karen Russell']), ['Karen Russell']);
    assert.deepEqual(visibleReps(all, []), [], 'an empty scope sees nobody, not everybody');
    assert.deepEqual(visibleReps(undefined, null), []);
});

test('ReportsTab: leads sliced, the sub-tabs handed the gated sets, rep lists scoped', () => {
    const src = readFileSync(new URL('../src/Tabs/ReportsTab.jsx', import.meta.url), 'utf8');
    assert.match(src, /const reportsLeads = sliceLeads\(roleFilteredLeads, \{ rep: reportsRep, team: reportsTeam, territory: reportsTerritory \}, settings\.users\);/);
    assert.match(src, /\? reportsLeads\.filter\(l => inRange\(dayOf\(l\.createdAt\), reportRange\)\)/);
    assert.doesNotMatch(src, /roleFilteredLeads\.filter\(l => inRange/, 'the unsliced start is the bug');
    assert.match(src, /const scopedRepNames = myTeamMembers \? \[\.\.\.myTeamMembers\] : null;/);
    // Deals at risk reads the sliced activities, not the raw array.
    assert.match(src, /const lastAct=reportsActivities\.filter\(a=>a\.opportunityId===o\.id\)/);
    // SavedReportsTab and ActivityHistoryTab get the gated sets.
    assert.match(src, /<SavedReportsTab\s+accounts=\{accounts\}\s+reportsOpps=\{reportsOpps\}\s+reportsTimedActivities=\{reportsTimedActivities\}\s+activities=\{reportsActivities\}\s+scopedRepNames=\{scopedRepNames\}/);
    assert.match(src, /<ActivityHistoryTab\s+accounts=\{accounts\}\s+contacts=\{contacts\}\s+activities=\{reportsActivities\}\s+opportunities=\{roleFilteredOpps\}\s+tasks=\{roleFilteredTasks\}/);
    assert.doesNotMatch(src, /activities=\{activities\}/, 'no sub-tab may receive the raw activities array');
    assert.doesNotMatch(src, /opportunities=\{opportunities\}/);
    assert.doesNotMatch(src, /tasks=\{tasks\}/);
    // Rep lists in the scorecard and the Actions report go through visibleReps.
    assert.match(src, /const repsListSC = visibleReps\(/);
    assert.match(src, /<RecommendationReport\s+currentUser=\{currentUser\}\s+canSeeAll=\{canSeeAll\}\s+scopedRepNames=\{scopedRepNames\}/);
    assert.match(src, /const allReps = canSeeAll\s*\n\s*\? visibleReps\(/);
    assert.doesNotMatch(src, /o\.rep === currentUserName/, 'o.rep is not a column');
});
