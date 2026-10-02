// tests/job-roster.test.mjs
//
// State §0.159, guide §18b52. pipeline-alerts, digest and task-reminders read
// every org's rows in one pass and then found people across all of them by
// DISPLAY NAME: a deal's rep was `userByName[name]` (the last row of ANY org
// won), a manager came from every org's managedReps and team names, one stage
// average pooled every org's history, the Monday team digest listed every org's
// reps, and a member was texted every task whose assignee carried their name, in
// any org. netlify/functions/_jobRoster.mjs is now the one rule — grouped by org
// first; a record's person is its OWNER by app user id, in its own org; a
// manager is an active Manager of that org; aggregates are per org — and it is
// RUN here with two orgs that share every name and every team. Org B's rows come
// LAST throughout, so a lookup that lets the last row of any org win resolves
// org A's names to org B's people and fails these tests. The jobs import
// db/index.js and load only under tsx, so their wiring is pinned by scan (§18b23)
// and their behaviour by tests/integration/scheduled-job-orgs.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    byOrg, rosterOf, rostersByOrg, ownerOf, managerOf, perOrg, dealKey, activitiesByDeal, teamRepsOf, ownedBy,
} from '../netlify/functions/_jobRoster.mjs';
import { SCHEDULED_JOBS } from '../src/utils/jobHealth.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

const A = 'org_A', B = 'org_B';
const person = (org, key, name, role, team, extra = {}) => ({
    id: `usr_${org === A ? 'a' : 'b'}_${key}`, orgId: org, name, role, team, active: true, email: `${key}@${org}`, ...extra,
});
const A_KAREN = person(A, 'karen', 'Karen Russell', 'User', 'Enterprise');
const A_DANA  = person(A, 'dana',  'Dana Diaz',     'User', 'Enterprise');
const A_MAYA  = person(A, 'maya',  'Maya Manager',  'Manager', 'Enterprise', { profile: { managedReps: ['Karen Russell'] } });
const A_AVERY = person(A, 'avery', 'Avery Admin',   'Admin', null);
const B_KAREN = person(B, 'karen', 'Karen Russell', 'User', 'Enterprise');
const B_BRAM  = person(B, 'bram',  'Bram Bravo',    'User', 'Enterprise');
const B_MAYA  = person(B, 'maya',  'Maya Manager',  'Manager', 'Enterprise', { profile: { managedReps: ['Karen Russell', 'Dana Diaz'] } });
const B_AVERY = person(B, 'avery', 'Avery Admin',   'Admin', null);
const PEOPLE = [A_KAREN, A_DANA, A_MAYA, A_AVERY, B_KAREN, B_BRAM, B_MAYA, B_AVERY];   // org B LAST
const ids = (list) => list.map(u => u.id).sort();

test('byOrg groups rows by org and drops a row that names none — never guessed into one', () => {
    const g = byOrg([{ orgId: A, n: 1 }, { orgId: B, n: 2 }, { orgId: A, n: 3 }, { orgId: null }, { orgId: '' }, {}, null, undefined]);
    assert.deepEqual([...g.keys()].sort(), [A, B], 'an org-less row is in no org');
    assert.deepEqual(g.get(A).map(r => r.n), [1, 3]);
    assert.deepEqual(byOrg(undefined).size, 0);
});

test('rosterOf keeps ONE org\'s people — a row of another org handed in is dropped', () => {
    const r = rosterOf(A, PEOPLE);
    assert.equal(r.orgId, A);
    assert.deepEqual(ids(r.people), ids([A_KAREN, A_DANA, A_MAYA, A_AVERY]), 'REGRESSION (§0.159): every org\'s people in one lookup');
    assert.ok(!r.byId.has(B_KAREN.id) && r.byId.has(A_KAREN.id));
    assert.equal(r.managerByRep.get('Karen Russell'), A_MAYA, 'org A\'s Karen is managed by org A\'s Maya — org B\'s Maya names "Karen Russell" too, and comes later');
    assert.equal(r.managerByTeam.get('Enterprise'), A_MAYA, 'org A\'s Enterprise team is org A\'s Manager\'s');
    assert.equal(r.managerByRep.get('Dana Diaz'), undefined, 'org B\'s Maya names "Dana Diaz" — not org A\'s Dana\'s manager');
    assert.deepEqual(rosterOf(null, PEOPLE).people, [], 'no org, no one');
    const all = rostersByOrg(PEOPLE);
    assert.deepEqual([...all.keys()].sort(), [A, B]);
    assert.deepEqual(ids(all.get(B).people), ids([B_KAREN, B_BRAM, B_MAYA, B_AVERY]));
});

test('ownerOf: a record\'s person is its OWNER by app id, in its own org — never the display name, never another org\'s roster', () => {
    const rA = rosterOf(A, PEOPLE), rB = rosterOf(B, PEOPLE);
    const deal = { orgId: A, ownerId: A_KAREN.id, salesRep: 'Karen Russell' };
    assert.equal(ownerOf(deal, rA), A_KAREN);
    assert.equal(ownerOf(deal, rB), null, 'a record is never resolved on another org\'s roster');
    assert.equal(ownerOf({ orgId: B, ownerId: A_KAREN.id }, rA), null, 'REGRESSION (§0.159): an org-B record naming an org-A id is no one\'s — even on the roster that holds the id');
    assert.equal(ownerOf({ orgId: A, ownerId: B_KAREN.id, salesRep: 'Karen Russell' }, rA), null, 'another org\'s id is no one on this roster');
    assert.equal(ownerOf({ orgId: A, ownerId: null, salesRep: 'Karen Russell' }, rA), null, 'REGRESSION (§0.159): an UNASSIGNED deal is no one\'s, though a member carries the name');
    assert.equal(ownerOf({ orgId: A, ownerId: '', assignedTo: 'Karen Russell' }, rA), null, 'an unassigned task likewise');
    assert.equal(ownerOf({ orgId: A, ownerId: `  ${A_KAREN.id}  ` }, rA), A_KAREN, 'a padded id still resolves');
    assert.equal(ownerOf({ ownerId: A_KAREN.id }, rA), null, 'a record with no org is no one\'s');
    assert.equal(ownerOf(deal, undefined), null);
});

test('managerOf: an ACTIVE Manager of the rep\'s OWN org — by managedReps, then by team; never another org\'s, whatever the names', () => {
    const rA = rosterOf(A, PEOPLE), rB = rosterOf(B, PEOPLE);
    assert.equal(managerOf(A_KAREN, rA), A_MAYA, 'by managedReps');
    assert.equal(managerOf(A_DANA, rA), A_MAYA, 'by team — org B\'s Maya lists "Dana Diaz" in managedReps and is on an "Enterprise" team too');
    assert.equal(managerOf(B_KAREN, rB), B_MAYA);
    assert.equal(managerOf(B_KAREN, rA), null, 'REGRESSION (§0.159): org B\'s Karen is never handed org A\'s manager');
    // An org with no Manager of its own gets no manager copy — not the other org's.
    const lone = rosterOf(A, [A_KAREN, A_DANA, A_AVERY, B_MAYA]);
    assert.equal(managerOf(A_KAREN, lone), null);
    assert.equal(managerOf(A_DANA, lone), null);
    // Only an active Manager with an address manages anyone.
    const off = rosterOf(A, [A_KAREN, { ...A_MAYA, active: false }]);
    assert.equal(managerOf(A_KAREN, off), null, 'a deactivated Manager receives no deal');
    assert.equal(managerOf(A_KAREN, rosterOf(A, [A_KAREN, { ...A_MAYA, email: '' }])), null, 'nor one with no address');
    const admin = rosterOf(A, [A_KAREN, { ...A_AVERY, team: 'Enterprise', profile: { managedReps: ['Karen Russell'] } }]);
    assert.equal(managerOf(A_KAREN, admin), null, 'another role whose profile carries managedReps is not a manager');
    const rep = rosterOf(A, [A_KAREN, { ...A_DANA, profile: { managedReps: ['Karen Russell'] } }]);
    assert.equal(managerOf(A_KAREN, rep), null, 'nor is a rep');
    assert.equal(managerOf({ ...A_KAREN, name: 'Someone Else', team: null }, rA), null, 'no name named, no team: no manager');
});

// The job's own arithmetic, lifted out of its source and RUN (the §18b33 pattern):
// pipeline-alerts imports db/index.js, so the module itself cannot be imported here.
const alertsSrc = read('netlify/functions/pipeline-alerts.mjs');
const fnSrc = (name) => {
    const m = alertsSrc.match(new RegExp(`^function ${name}\\([^)]*\\) \\{[\\s\\S]*?^\\}`, 'm'));
    assert.ok(m, `${name} is a top-level function declaration in pipeline-alerts.mjs`);
    return m[0];
};
const buildAvgDaysInStage = new Function(`${fnSrc('daysBetween')}\n${fnSrc('buildAvgDaysInStage')}\nreturn buildAvgDaysInStage;`)();

test('perOrg: a stage\'s average is each org\'s own — one org\'s slow history never moves another\'s threshold', () => {
    const won = (org, createdDate, date) => ({ orgId: org, stage: 'Closed Won', createdDate, stageHistory: [{ stage: 'Proposal', prevStage: 'Qualification', date }] });
    // daysBetween reads LOCAL noon, so a span across one DST change is an hour short
    // off UTC; 1 Feb → 28 Nov crosses both changes (US, EU and southern), and nets zero.
    const opps = [won(A, '2026-01-01', '2026-01-06'), won(B, '2025-02-01', '2025-11-28'), { orgId: B, stage: 'Proposal' }];
    const avg = perOrg(opps, buildAvgDaysInStage);
    assert.deepEqual(avg.get(A), { Qualification: 5 }, 'org A: five days');
    assert.deepEqual(avg.get(B), { Qualification: 300 }, 'org B: three hundred');
    assert.deepEqual(buildAvgDaysInStage(opps), { Qualification: 153 }, 'pooled, as it was: org A\'s deal 25 days in Qualification never reached twice 153');
    assert.deepEqual([...perOrg([{ orgId: A }, { orgId: A }, { orgId: B }], (l) => l.length)], [[A, 2], [B, 1]]);
});

test('activitiesByDeal: a deal\'s activities are its OWN org\'s, newest first — one org\'s row naming another org\'s deal id is never that deal\'s', () => {
    const acts = [
        { orgId: A, opportunityId: 'deal_1', date: '2026-09-01' },
        { orgId: A, opportunityId: 'deal_1', date: '2026-09-20' },
        { orgId: B, opportunityId: 'deal_1', date: '2026-10-01' },   // org B names org A's deal
        { orgId: A, opportunityId: null, date: '2026-10-01' },
        { opportunityId: 'deal_1', date: '2026-10-02' },
    ];
    const by = activitiesByDeal(acts);
    assert.deepEqual(by.get(dealKey(A, 'deal_1')).map(a => a.date), ['2026-09-20', '2026-09-01'], 'REGRESSION (§0.159): org B\'s call hid org A\'s silence');
    assert.deepEqual(by.get(dealKey(B, 'deal_1')).map(a => a.date), ['2026-10-01'], 'it is filed under its own org');
    assert.equal(by.size, 2, 'an activity with no deal, or no org, is filed nowhere');
    assert.notEqual(dealKey(A, 'deal_1'), dealKey(B, 'deal_1'));
});

test('teamRepsOf: the Monday digest lists the manager\'s OWN org\'s reps — every one for an Admin, the team\'s for a Manager', () => {
    assert.deepEqual(ids(teamRepsOf(A_AVERY, PEOPLE)), ids([A_KAREN, A_DANA]), 'REGRESSION (§0.159): an Admin\'s digest listed every org\'s reps');
    assert.deepEqual(ids(teamRepsOf(A_MAYA, PEOPLE)), ids([A_KAREN, A_DANA]), 'REGRESSION (§0.159): a Manager\'s team was matched by its name in every org');
    assert.deepEqual(ids(teamRepsOf(B_MAYA, PEOPLE)), ids([B_KAREN, B_BRAM]));
    assert.deepEqual(ids(teamRepsOf({ ...A_MAYA, team: 'Midmarket' }, PEOPLE)), [], 'a team with no reps in the org lists none');
    assert.deepEqual(teamRepsOf({ ...A_MAYA, team: null }, PEOPLE), [], 'a Manager on no team lists none');
    assert.deepEqual(teamRepsOf({ ...A_AVERY, orgId: '' }, PEOPLE), [], 'a manager with no org lists none');
    assert.ok(teamRepsOf(A_AVERY, PEOPLE).every(u => u.role === 'User'), 'reps are role User — the column, not the profile\'s userType');
});

test('ownedBy: a member\'s own records — their app id as the owner, in their own org; another member\'s name earns nothing', () => {
    const rows = [
        { id: 't1', orgId: A, ownerId: A_KAREN.id, assignedTo: 'Karen Russell' },
        { id: 't2', orgId: B, ownerId: B_KAREN.id, assignedTo: 'Karen Russell' },
        { id: 't3', orgId: A, ownerId: null, assignedTo: 'Karen Russell' },
        { id: 't4', orgId: B, ownerId: A_KAREN.id },                        // another org's row carrying this member's id
        { id: 't5', orgId: A, ownerId: A_DANA.id, assignedTo: 'Karen Russell' },
    ];
    assert.deepEqual(ownedBy(A_KAREN, rows).map(r => r.id), ['t1'], 'REGRESSION (§0.159): by name, org B\'s task and the unassigned one counted too');
    assert.deepEqual(ownedBy(B_KAREN, rows).map(r => r.id), ['t2']);
    assert.deepEqual(ownedBy({ ...A_KAREN, orgId: null }, rows), [], 'a member with no org owns nothing');
    assert.deepEqual(ownedBy({ ...A_KAREN, id: '' }, rows), [], 'nor one with no id');
});

// ── the jobs: wiring, by scan ────────────────────────────────────────────────

test('pipeline-alerts: the rep is the deal\'s owner, the manager and the averages the deal\'s org\'s, the overdue task\'s assignee its owner', () => {
    const s = code(alertsSrc);
    assert.ok(s.includes("import { rostersByOrg, ownerOf, managerOf, perOrg, activitiesByDeal, dealKey } from './_jobRoster.mjs';"));
    assert.ok(s.includes('        const rosters      = rostersByOrg(allUsers);'), 'one roster per org');
    assert.ok(s.includes('        const avgDaysByOrg = perOrg(allOpps, buildAvgDaysInStage);'), 'one set of stage averages per org');
    assert.ok(s.includes('        const actsByDeal   = activitiesByDeal(allActs);'));
    assert.ok(s.includes('            const roster  = rosters.get(orgId);\n            const repUser = ownerOf(opp, roster);'), 'the deal\'s owner, on its own org\'s roster');
    assert.ok(s.includes('            if (repUser.orgId !== orgId) continue;'), 'the last line of defence fails closed');
    assert.ok(!s.includes('repUser.orgId &&'), 'REGRESSION: a rep with no org slipped past the old check');
    assert.ok(s.includes('            const manager  = managerOf(repUser, roster);'));
    assert.ok(s.includes('            const oppActs = actsByDeal.get(dealKey(orgId, opp.id)) || [];'));
    assert.ok(s.includes('            const avgForStage    = (avgDaysByOrg.get(orgId) || {})[opp.stage] || null;'));
    assert.ok(s.includes('                    const assignee = ownerOf(task, rosters.get(task.orgId));'));
    assert.ok(s.includes('                    if (assignee.orgId !== task.orgId) continue;'), 'kept: the assignee is THIS org\'s user');
    assert.ok(s.includes('.where(inArray(tasks.orgId, [...orgsWithRule]));'), 'only the orgs with a rule have their tasks read');
    // (`function buildAvgDaysInStage(allOpps)` is the declaration; `= buildAvgDaysInStage(allOpps)` the pooled call.)
    for (const gone of ['userByName', '= buildAvgDaysInStage(allOpps)', 'managedReps', 'a.opportunityId === opp.id', 'allUsers.forEach']) {
        assert.ok(!s.includes(gone), `REGRESSION (§0.159): ${gone} is back in pipeline-alerts.mjs`);
    }
});

test('digest: a member\'s digest reads what they own; the team digest\'s reps are the manager\'s org\'s, each counted by app id', () => {
    const s = code(read('netlify/functions/digest.mjs'));
    assert.ok(s.includes("import { teamRepsOf } from './_jobRoster.mjs';"));
    assert.equal((s.match(/eq\(tasks\.orgId, user\.orgId\), eq\(tasks\.ownerId, user\.id\)/g) || []).length, 2, 'the task digest and the overdue nudge');
    assert.equal((s.match(/eq\(opportunities\.orgId, user\.orgId\), eq\(opportunities\.ownerId, user\.id\)/g) || []).length, 1, 'the deal digest');
    assert.ok(s.includes('                    const visibleReps = teamRepsOf(mgr, allUsers);'));
    assert.equal((s.match(/o\.ownerId === rep\.id/g) || []).length, 2, 'a rep\'s open and closed deals');
    assert.equal((s.match(/a\.ownerId === rep\.id/g) || []).length, 2, 'a rep\'s activities, and this week\'s');
    assert.equal((s.match(/t\.ownerId === rep\.id/g) || []).length, 1, 'a rep\'s tasks');
    for (const gone of ['eq(tasks.assignedTo', 'eq(opportunities.salesRep', '=== rep.name', "allUsers.filter(u => u.role === 'User')", '.teamId']) {
        assert.ok(!s.includes(gone), `REGRESSION (§0.159): ${gone} is back in digest.mjs`);
    }
});

test('task-reminders: a member is texted the tasks they own, in their own org', () => {
    const s = code(read('netlify/functions/task-reminders.mjs'));
    assert.ok(s.includes("import { ownedBy } from './_jobRoster.mjs';"));
    assert.ok(s.includes('            const userTasks = ownedBy(user, allTasks).filter(t =>'));
    assert.ok(!s.includes('assignedTo === user.name'), 'REGRESSION (§0.159): by name, with no org at all');
});

test('each of the three runs at an instant a test can hand it; the schedule\'s run is now', () => {
    for (const [file, fn] of [['pipeline-alerts', 'runPipelineAlerts'], ['digest', 'runDigest'], ['task-reminders', 'runTaskReminders']]) {
        const s = code(read(`netlify/functions/${file}.mjs`));
        assert.ok(s.includes(`export const ${fn} = async ({ now = new Date() } = {}) => {`), `${file}: the run takes its instant`);
        assert.ok(s.includes(`const run = async () => {\n    return ${fn}();\n};`), `${file}: the scheduled run is the instant now`);
        assert.ok(!/^const (today|todayStr) = /m.test(s), `${file}: no module-level clock — a warm container kept the first run's`);
    }
    const itest = read('tests/integration/scheduled-job-orgs.itest.mjs');
    for (const fn of ['runPipelineAlerts', 'runDigest', 'runTaskReminders']) assert.ok(itest.includes(`await ${fn}({ now: NOW })`), `the integration suite runs ${fn}`);
});

// Every scheduled job, present and future: no person is found by a display name.
const NAME_KEYED = [
    [/\w+\[\s*\w+\.name\s*\]\s*=(?!=)/, 'a lookup keyed by a display name'],
    [/\.(?:salesRep|assignedTo|author)\s*===?\s*\w+\.name\b/, 'a record matched to a person by display name'],
    [/\b\w+\.name\s*===?\s*\w+\.(?:salesRep|assignedTo|author)\b/, 'a person matched to a record by display name'],
    [/eq\(\s*\w+\.(?:salesRep|assignedTo|author)\s*,/, 'a query keyed on a display-name column'],
];

test('no scheduled job finds a person by display name — guide §18b52, over every job in SCHEDULED_JOBS', () => {
    assert.ok(SCHEDULED_JOBS.length >= 5);
    for (const { job } of SCHEDULED_JOBS) {
        const s = code(read(`netlify/functions/${job}.mjs`));
        for (const [re, what] of NAME_KEYED) assert.ok(!re.test(s), `${job}.mjs: ${what} — ${(s.match(re) || [])[0]}`);
    }
    // The guard has teeth: each shape is one the jobs held until §0.159.
    const old = [
        'allUsers.forEach(u => { userByName[u.name] = u; });',
        'const userTasks = allTasks.filter(t => t.assignedTo === user.name && t.dueDate === todayLocal);',
        "const repOpps = allOpps.filter(o => o.salesRep === rep.name && !['Closed Won'].includes(o.stage));",
        '.where(and(eq(tasks.orgId, user.orgId), eq(tasks.assignedTo, user.name)));',
    ];
    for (const line of old) assert.ok(NAME_KEYED.some(([re]) => re.test(line)), `the guard sees: ${line}`);
    assert.ok(NAME_KEYED[2][0].test('const assignee = allUsers.find(u => u.name === task.assignedTo);'));
});
