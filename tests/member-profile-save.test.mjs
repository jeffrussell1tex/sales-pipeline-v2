// tests/member-profile-save.test.mjs
//
// The member profile page sends only what changed (state §0.211 — OPEN_ITEMS §1 item 1, "Then, the member profile
// page sends only what changed"; Jeff, 15 Oct: "Send only what changed"; 16 Oct: "File it, own batch next"; 26 Oct:
// "Your change wins", "Only who they report to", "Steps A and B", "Fix the move, file the rest", "File it").
//
// Before: Settings → Users → a member's profile PUT the member's whole row as the roster held it at sign-in — every
// key less access, the status, the login and the pins — with a team id derived from the Team box's NAME on every
// save. The server applies every key sent, so a save put back the member's own title, phone, signature and
// preferences, a Manager's forecast calls and the Teams page's team as the page had loaded them. The derive took the
// first team of that name: a member of a second "East" was moved onto the first (their joined date re-stamped), and
// a member whose team name no team has lost a valid team id. The teams' lists moved by name against the page's first
// copy; the Manager box made the member's "reports to" the manager of their whole team on every save; a second press
// re-sent a changed role; and after a save the page read the member as it had opened them.
//
// Run here, on made-up rows: the rules (src/utils/memberSave.js, src/Tabs/settings/people/memberPickers.js,
// src/utils/teamMembership.js teamsWithMemberOn) and handleSave itself, sliced from UsersDetail.jsx and run with
// scripted requests — beside today's code where it had a line for the rule (OLD, copied verbatim from faed240), run
// on the same rows, to show the test tells them apart. Pinned: the page's lines that are not run (its boxes, its
// button, its card).
// tests/integration/member-profile.itest.mjs guards the server's answers to the bodies the page now sends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
import { PAGE_FIELDS, sameValue, memberChanges, roleChanged, formAfterSave, clause } from '../src/utils/memberSave.js';
import { NETWORK_ERROR } from '../src/utils/storage.js';
import { HELD_TEAM, teamOptions, teamPicked, heldTeam, managerOptions, heldManager, heldTerritory } from '../src/Tabs/settings/people/memberPickers.js';
import { teamIdNamed, teamsWithMemberOn } from '../src/utils/teamMembership.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
// The code a pin reads: whole-line comments dropped, so a comment quoting a line never stands in for it.
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
// From `from` to the first `to` after it, both included — each there.
const between = (s, from, to) => {
    const a = s.indexOf(from);
    assert.ok(a >= 0, `missing: ${from}`);
    const b = s.indexOf(to, a + from.length);
    assert.ok(b > a, `missing after it: ${to}`);
    return s.slice(a, b + to.length);
};
// Each part found after the one before it.
const order = (s, ...parts) => {
    let at = -1;
    for (const p of parts) {
        const i = s.indexOf(p, at + 1);
        assert.ok(i > at, `missing or out of order: ${p}`);
        at = i;
    }
};
// A whole line of s, exactly once.
const once = (s, line, why) => assert.equal(s.split('\n').filter((l) => l === line).length, 1, why || `once, as a whole line: ${line.trim()}`);
const ind = (n, line) => ' '.repeat(n) + line;
const UD = 'src/Tabs/settings/people/UsersDetail.jsx';

// ── the rows (made up, in Accelerep QA's shapes) ────────────────────────────

const TEAMS = Object.freeze([
    Object.freeze({ id: 'team_east', name: 'East', managerId: 'usr_bob', repIds: Object.freeze(['usr_tess']) }),
    Object.freeze({ id: 'team_east2', name: 'East', repIds: Object.freeze(['usr_eve']) }),   // a second team of one name
    Object.freeze({ id: 'team_west', name: 'West', repIds: Object.freeze([]) }),
    'Legacy',                                                                              // an old plain-string entry
]);
const member = (id, name, extra) => ({ id, name, role: 'User', userType: 'User', active: true, status: 'Active', clerkUserId: `clerk_${id}`, ...extra });
const TESS = Object.freeze(member('usr_tess', 'Tess Undoer', {
    firstName: 'Tess', lastName: 'Undoer', email: 'tess@x.test', mobile: '9', title: 'Rep', phone: '1',
    team: 'East', teamId: 'team_east', manager: 'Bob Russell', territory: 'South', vertical: 'Retail',
    forecastCalls: { '2026-Q4': { commit: 10 } }, notificationPrefs: { digest: true }, emailSignature: 'Tess',
    quota: '100', pinnedReports: ['rpt_1'], teamJoinedAt: '2026-01-02T00:00:00.000Z',
}));
const EVE = member('usr_eve', 'Eve Second', { team: 'East', teamId: 'team_east2', phone: '1' });     // the second East
const WES = member('usr_wes', 'Wes Renamed', { team: 'Westside', teamId: 'team_west', phone: '1' }); // renamed since (P28)
const NIA = member('usr_nia', 'Nia Early', { team: 'East', teamId: null, phone: '1' });              // an invitation before §0.168
const LOU = member('usr_lou', 'Lou Gone', { team: 'East', teamId: 'team_gone', phone: '1' });        // a team deleted since
const BOB = member('usr_bob', 'Bob Russell', { role: 'Manager', userType: 'Manager' });
const JO = member('usr_jo', 'Jo Admin', { role: 'Admin', userType: 'Admin' });
const IVY = member('usr_ivy', 'Ivy Invited', { role: 'Manager', userType: 'Manager', active: false, status: 'Invited', clerkUserId: null });
const DEE = member('usr_dee', 'Dee Gone', { role: 'Manager', userType: 'Manager', active: false });
const DAN = member('usr_dan', 'Dan Dispatch', { role: 'Dispatcher', userType: 'Dispatcher' });
const KAREN = member('usr_karen', 'Karen Rep', {});
const TOM = member('usr_tom', 'Tom Tech', { role: 'Technician', userType: 'Technician', manager: 'Dan Dispatch' });
const LEGACY = member('usr_leg', 'Leg Acy', { role: 'member', userType: 'member' });
const USERS = Object.freeze([TESS, EVE, WES, NIA, LOU, BOB, JO, IVY, DEE, DAN, KAREN, TOM, LEGACY]);
const withTeam = (m, id) => ({ ...m, ...teamPicked(teamOptions(TEAMS), id) });
const repIdsOf = (teams) => teams.map((t) => (typeof t === 'string' ? t : t.repIds));

// faed240's UsersDetail.jsx :937-938, verbatim: the body today's page sends.
const OLD_BODY = (form, settings) => {
    const { active: _active, status: _status, clerkUserId: _login, pinnedReports: _pins, ...edited } = form;
    const toSave = { ...edited, teamId: teamIdNamed(settings.teams, form.team) };
    return toSave;
};

// ── S1-S9 the rules ─────────────────────────────────────────────────────────

test('S1 (P1) memberChanges sends the page fields that changed and nothing else — never access, the status, the login, the pins, the email, mobile, calls, preferences, signature, quota or vertical (OLD :937-938: the whole form as loaded)', () => {
    assert.deepEqual(memberChanges(TESS, { ...TESS }), {}, 'an unchanged form sends nothing');
    assert.deepEqual(memberChanges(TESS, { ...TESS, phone: '2' }), { phone: '2' });
    assert.deepEqual(memberChanges(TESS, { ...TESS, title: 'Lead', territory: '' }), { title: 'Lead', territory: '' });
    const notSent = { active: false, status: 'Invited', clerkUserId: null, pinnedReports: [], email: 'new@x.test', mobile: '0',
        forecastCalls: {}, notificationPrefs: {}, emailSignature: 'X', quota: '0', userType: 'Admin', teamJoinedAt: null, vertical: 'Gov' };
    assert.deepEqual(memberChanges(TESS, { ...TESS, ...notSent }), {}, 'REGRESSION: a field the page does not edit is sent as it holds it');
    for (const k of Object.keys(notSent)) assert.ok(!PAGE_FIELDS.includes(k), `${k} is no page field`);
    assert.deepEqual([...PAGE_FIELDS], ['name', 'title', 'phone', 'team', 'teamId', 'manager', 'territory']);
    assert.ok(Object.isFrozen(PAGE_FIELDS));
    // '', null and absent are one value — the server stores each as none.
    assert.deepEqual(memberChanges({ ...TESS, title: null }, { ...TESS, title: '' }), {}, "REGRESSION: '' against none reads as a change");
    assert.deepEqual(memberChanges({ ...TESS, title: undefined }, { ...TESS, title: null }), {});
    assert.equal(sameValue('', null), true);
    assert.equal(sameValue('a', 'a'), true);
    assert.equal(sameValue('a', 'b'), false);
    assert.equal(sameValue('a', null), false);
    assert.deepEqual(memberChanges(TESS, { ...TESS, title: 'Rep' }), {}, 'a field changed and changed back is not sent');
    // Only page keys, and First/Last with a name.
    for (const form of [{ ...TESS, phone: '2', name: 'X' }, withTeam(TESS, 'team_west'), { ...TESS, manager: 'Jo Admin' }]) {
        for (const k of Object.keys(memberChanges(TESS, form))) assert.ok(PAGE_FIELDS.includes(k) || k === 'firstName' || k === 'lastName', k);
    }
    // OLD: a phone edit sends what the page loaded of everything else.
    const old = OLD_BODY({ ...TESS, phone: '2' }, { teams: TEAMS });
    for (const k of ['title', 'email', 'forecastCalls', 'notificationPrefs', 'emailSignature', 'quota', 'mobile']) assert.ok(k in old, `OLD sends ${k} as loaded`);
});

// users.mjs sanitize's name, run as written: the server builds the name from First and Last first.
const NAME_LINE = ind(8, "name:         ((data.firstName || '') + ' ' + (data.lastName || '')).trim() || String(data.name ?? '').trim() || 'Unnamed User',");
const storedName = (data) => new Function('data', `return ${NAME_LINE.trim().slice('name:'.length).replace(/,$/, '')};`)(data);

test('S2 (P2) a Full name typed goes with First and Last cleared — from a first copy with them and from one with none, so First and Last set since cannot rebuild the old name; an untouched name sends nothing (Jeff: "Yes, Full name wins")', () => {
    once(code(read('netlify/functions/users.mjs')), NAME_LINE, 'the rule the pair answers to');
    assert.deepEqual(memberChanges(TESS, { ...TESS, name: 'Tess Renamed' }), { name: 'Tess Renamed', firstName: null, lastName: null });
    const bare = { ...TESS }; delete bare.firstName; delete bare.lastName;          // a first sign-in's row: no First/Last
    const body = memberChanges(bare, { ...bare, name: 'Tess Renamed' });
    assert.deepEqual(body, { name: 'Tess Renamed', firstName: null, lastName: null });
    // Since the page opened, the member's own panel set First and Last; the server lays the body over that row.
    const since = { ...bare, firstName: 'Tess', lastName: 'Undoer' };
    assert.equal(storedName({ ...since, ...body }), 'Tess Renamed', 'the name typed is stored');
    assert.equal(storedName({ ...since, name: 'Tess Renamed' }), 'Tess Undoer',
        'REGRESSION: without the pair, First and Last set since rebuild the old name — why the pair rides every time');
    assert.deepEqual(memberChanges(TESS, { ...TESS, firstName: null, lastName: null }), {}, 'First and Last are no page fields: an untouched name sends nothing');
});

test('S3 (P3) a team is sent by its id with its name, only when the Team box changed (OLD :938: the first team of the name answers — a member of a second "East" moved onto the first, a gone team "healed" by its name, a valid team cleared)', () => {
    const opts = teamOptions(TEAMS);
    assert.deepEqual(teamPicked(opts, 'team_east2'), { team: 'East', teamId: 'team_east2' });
    assert.deepEqual(memberChanges(TESS, withTeam(TESS, 'team_east2')), { team: 'East', teamId: 'team_east2' }, 'same name, another team: both sent');
    assert.deepEqual(memberChanges(TESS, withTeam(TESS, 'team_west')), { team: 'West', teamId: 'team_west' });
    assert.deepEqual(memberChanges(TESS, withTeam(TESS, '')), { team: '', teamId: '' }, 'unassigned clears both');
    assert.deepEqual(memberChanges(TESS, { ...TESS, teamId: 'team_east2' }), { team: 'East', teamId: 'team_east2' }, "REGRESSION: a team's id is sent without its name");
    assert.deepEqual(memberChanges(NIA, { ...NIA, team: 'West' }), { team: 'West', teamId: null }, 'and a name with its id');
    for (const m of [NIA, LOU, EVE, WES]) assert.deepEqual(memberChanges(m, { ...m, phone: '2' }), { phone: '2' }, `${m.name}: a phone save sends no team`);
    const settings = { teams: TEAMS };
    assert.equal(OLD_BODY({ ...EVE, phone: '2' }, settings).teamId, 'team_east', 'OLD: a phone save moves a member of the second East onto the first');
    assert.equal(OLD_BODY({ ...LOU, phone: '2' }, settings).teamId, 'team_east', 'OLD: a gone team "healed" to the first East by its name');
    assert.equal(OLD_BODY({ ...WES, phone: '2' }, settings).teamId, null, 'OLD: no team has "Westside" — a valid team id cleared');
});

test("S4 (P7) the role goes only when the Role box names another role than the member's column — never against the stale userType; after it landed a second press sends nothing (OLD :959-960: the first copy never moved, so it was sent again)", () => {
    assert.equal(roleChanged({ role: 'Manager', userType: 'User' }, { role: 'Manager' }), false, "REGRESSION: the role read off the profile's stale userType");
    assert.equal(roleChanged({ role: 'member' }, { role: 'member' }), false, 'an unknown stored role, untouched, is no change');
    assert.equal(roleChanged(TESS, { ...TESS, role: '' }), false);
    assert.equal(roleChanged({ role: null }, { role: 'User' }), false, 'no stored role reads as a Sales Rep');
    assert.equal(roleChanged(TESS, { ...TESS, role: 'Manager' }), true);
    const landed = { ...TESS, role: 'Manager', userType: 'Manager' };   // the page holds the member as stored (S10 R3)
    assert.equal(roleChanged(landed, { ...TESS, role: 'Manager' }), false);
    const OLD = (user, form) => { const priorRole = user.role || 'User'; return !!(form.role && form.role !== priorRole); };   // :959-960
    assert.equal(OLD(TESS, { ...TESS, role: 'Manager' }), true, 'OLD: after it landed, the second press sends it again');
});

test('S5 (P8, P11) after a save the form is the member as stored — but a field typed while it was out, and a role that did not land, still wait for Save', () => {
    const sent = { ...TESS, phone: '2' };
    const stored = { ...TESS, phone: '2', title: 'Rep (newer)' };
    assert.deepEqual(formAfterSave(sent, sent, stored, false), stored, 'the stored row replaces the form');
    const typed = { ...sent, title: 'Typing' };
    assert.equal(formAfterSave(typed, sent, stored, false).title, 'Typing', 'REGRESSION: a field typed during the save is overwritten');
    assert.equal(formAfterSave(typed, sent, stored, false).phone, '2');
    const picked = { ...sent, role: 'Manager' };
    assert.equal(formAfterSave(picked, picked, stored, true).role, 'Manager', 'REGRESSION: a role not saved reads as saved');
    assert.equal(formAfterSave(picked, picked, stored, false).role, 'User', 'without keepRole the stored role stands');
    assert.equal(formAfterSave({ ...sent, role: 'Admin' }, sent, stored, false).role, 'Admin', 'a role picked during the save is kept');
    const after = formAfterSave(withTeam(sent, 'team_west'), sent, stored, false);
    assert.deepEqual([after.team, after.teamId], ['West', 'team_west'], 'a team picked during the save keeps both fields');
});

test("S6 (P4) teamsWithMemberOn: the member off every other list and onto the new team's once, by id — or off every list; an untouched team is the same object (OLD :976-980: by name, onto both \"East\" lists)", () => {
    const onWest = teamsWithMemberOn(TEAMS, 'usr_tess', 'team_west');
    assert.equal(onWest.changed, true);
    assert.deepEqual(repIdsOf(onWest.teams), [[], ['usr_eve'], ['usr_tess'], 'Legacy'], 'REGRESSION: a moved member stays on their old team\'s list');
    assert.equal(onWest.teams[1], TEAMS[1], 'an untouched team is the same object');
    assert.equal(onWest.teams[3], 'Legacy');
    assert.equal(onWest.teams[0].managerId, 'usr_bob', 'the rest of the team is kept');
    const again = teamsWithMemberOn(onWest.teams, 'usr_tess', 'team_west');
    assert.equal(again.changed, false, 'REGRESSION: an untouched list is rebuilt and saved');
    again.teams.forEach((t, i) => assert.equal(t, onWest.teams[i], 'each the same object'));
    const off = teamsWithMemberOn(TEAMS, 'usr_tess', null);
    assert.equal(off.changed, true);
    assert.deepEqual(repIdsOf(off.teams), [[], ['usr_eve'], [], 'Legacy'], 'none: off every list');
    const listed = teamsWithMemberOn(TEAMS, 'usr_tess', 'team_east');
    assert.equal(listed.changed, false);
    assert.deepEqual(listed.teams[0].repIds, ['usr_tess'], 'REGRESSION: listed twice on the new team');
    const twice = [{ id: 'a', repIds: ['x'] }, { id: 'b', repIds: ['x', 'y'] }];
    assert.deepEqual(repIdsOf(teamsWithMemberOn(twice, 'x', 'a').teams), [['x'], ['y']], 'a member is on one team');
    const bare = [{ id: 'team_n', name: 'North' }, 'Legacy'];
    assert.deepEqual(teamsWithMemberOn(bare, 'usr_tess', 'team_n').teams[0].repIds, ['usr_tess'], "a team with no list gets one when it is the member's");
    assert.equal(teamsWithMemberOn(bare, 'usr_tess', null).teams[0], bare[0], 'and is left alone when not');
    // The review (proof-1, proof-2): a move onto a list that holds others keeps them; a join from no list is a change.
    assert.deepEqual(repIdsOf(teamsWithMemberOn(TEAMS, 'usr_tess', 'team_east2').teams), [[], ['usr_eve', 'usr_tess'], [], 'Legacy'],
        "REGRESSION: the new team's other members dropped from its list");
    assert.equal(teamsWithMemberOn(bare, 'usr_tess', 'team_n').changed, true, 'REGRESSION: a member joining from no list is no change — the list is never written');
    const none = teamsWithMemberOn(TEAMS, null, 'team_west');
    assert.equal(none.changed, false, 'no member id changes nothing');
    none.teams.forEach((t, i) => assert.equal(t, TEAMS[i]));
    assert.deepEqual(teamsWithMemberOn(undefined, 'usr_tess', 'team_west'), { teams: [], changed: false });
    // OLD (:971-981), verbatim but for its inputs: a member moved from West onto "East" lands on BOTH East lists.
    const OLD = (settings, user, form) => {
        let updatedTeams = settings.teams || [];
        const oldTeamName = user.team;
        const newTeamName = form.team;
        if (oldTeamName !== newTeamName) {
            updatedTeams = updatedTeams.map(t => {
                if (t.name === oldTeamName) return { ...t, repIds: (t.repIds||[]).filter(id => id !== user.id) };
                if (t.name === newTeamName) return { ...t, repIds: [...new Set([...(t.repIds||[]), user.id])] };
                return t;
            });
        }
        return updatedTeams;
    };
    const fromWest = { ...TESS, team: 'West', teamId: 'team_west' };
    const old = OLD({ teams: [TEAMS[0], TEAMS[1], { ...TEAMS[2], repIds: ['usr_tess'] }] }, fromWest, withTeam(fromWest, 'team_east2'));
    assert.deepEqual(old.map((t) => t.repIds), [['usr_tess'], ['usr_eve', 'usr_tess'], []], 'OLD: by name — onto both East lists');
});

test('S7 (P3) the Team box: each team of the list once, by name, a second of one name numbered; a pick sets its name and id together; a team the options leave out shows as itself, in words', () => {
    const opts = teamOptions(TEAMS);
    assert.deepEqual(opts.map((o) => o.label), ['East', 'East (2)', 'West'], 'REGRESSION: a second team of one name reads the same');
    assert.deepEqual(opts.map((o) => o.value), ['team_east', 'team_east2', 'team_west']);
    assert.deepEqual(opts.map((o) => o.name), ['East', 'East', 'West']);
    assert.deepEqual(teamOptions([TEAMS[2], TEAMS[0]]).map((o) => o.label), ['East', 'West'], "REGRESSION: the teams in the list's order, not by name");
    assert.ok(!opts.some((o) => o.value === HELD_TEAM), 'no team id is the held value');
    assert.deepEqual(teamOptions([{ id: '', name: 'No id' }, { id: 'x' }, null, 'Plain']), [], 'an entry with no id or no name is not offered');
    assert.deepEqual(teamPicked(opts, 'team_west'), { team: 'West', teamId: 'team_west' }, 'REGRESSION: a new team keeps the old teamId');
    assert.deepEqual(teamPicked(opts, ''), { team: '', teamId: '' });
    assert.deepEqual(teamPicked(opts, 'team_unknown'), { team: '', teamId: '' });
    assert.equal(heldTeam(LOU, opts), 'East (no longer on the team list)', 'REGRESSION: a held team reads as unassigned');
    assert.equal(heldTeam(NIA, opts), 'East (not linked to the team list — pick it again)', 'REGRESSION: a team name with no id reads as unassigned');
    assert.equal(heldTeam({ team: 'North' }, opts), 'North (not on the team list)');
    assert.equal(heldTeam({ teamId: 'team_gone' }, opts), 'A team (no longer on the team list)');
    assert.equal(heldTeam(TESS, opts), null);
    assert.equal(heldTeam(WES, opts), null, 'an offered id shows as its team; the stale name waits for a pick (P28, filed)');
    assert.equal(heldTeam({}, opts), null);
    assert.equal(heldTeam({ team: '', teamId: null }, opts), null);
});

test('S8 (P12) the Manager box offers members with access whose role is Admin or Manager (roles.js canSeeAll), never the member; a stored manager it does not offer shows as itself with why (OLD :914: every named member but this one)', () => {
    const opts = managerOptions(USERS, 'usr_tess');
    assert.deepEqual(opts, [{ id: 'usr_bob', name: 'Bob Russell' }, { id: 'usr_jo', name: 'Jo Admin' }],
        'not Ivy (invited), Dee (deactivated), Dan (Dispatcher), Karen (Sales Rep) or Tess herself');
    assert.deepEqual(managerOptions(USERS, 'usr_bob').map((o) => o.id), ['usr_jo'], 'never the member themselves');
    assert.deepEqual(managerOptions([JO, BOB], 'usr_x').map((o) => o.name), ['Bob Russell', 'Jo Admin'], "REGRESSION: the managers in the roster's order, not by name");
    const held = (manager, selfId = 'usr_tess') => heldManager({ manager }, managerOptions(USERS, selfId), USERS, selfId);
    assert.equal(held('Bob Russell'), null, 'offered: no held option');
    assert.equal(held(''), null);
    assert.equal(held(null), null);
    assert.equal(held('Karen Rep'), 'Karen Rep (Sales Rep)', 'REGRESSION: a held manager reads as none');
    assert.equal(held('Dee Gone'), 'Dee Gone (deactivated)');
    assert.equal(held('Ivy Invited'), 'Ivy Invited (invited, not yet joined)');
    assert.equal(held('Gone Name'), 'Gone Name (no member has this name now)');
    assert.equal(held('Tess Undoer'), 'Tess Undoer (this member)');
    assert.equal(held('Leg Acy'), 'Leg Acy (member)', 'an unknown role as itself');
    assert.equal(heldManager(TOM, managerOptions(USERS, 'usr_tom'), USERS, 'usr_tom'), 'Dan Dispatch (Dispatcher)', "a Technician's Dispatcher is kept, said");
    const OLD = (settings, user) => (settings.users || []).filter(u => u.name && u.id !== user.id).map(u => u.name).sort();   // :914
    const old = OLD({ users: USERS }, TESS);
    for (const n of ['Karen Rep', 'Ivy Invited', 'Dee Gone', 'Dan Dispatch']) assert.ok(old.includes(n), `OLD offers ${n}`);
});

test('S9 (P13) the Territory box shows a stored territory the list does not hold as itself', () => {
    assert.equal(heldTerritory('South', ['North', 'South']), null);
    assert.equal(heldTerritory('Gone', ['North', 'South']), 'Gone (not on the territory list)', 'REGRESSION: a held territory reads as unassigned');
    assert.equal(heldTerritory('', ['North']), null);
    assert.equal(heldTerritory(null, undefined), null);
    assert.equal(heldTerritory('West', undefined), 'West (not on the territory list)');
});

// ── S10 handleSave, run as written ──────────────────────────────────────────

const isFn = (n) => n && /^(ArrowFunctionExpression|FunctionExpression|FunctionDeclaration)$/.test(n.type);
const walk = (node, visit, parent = null, key = null) => {
    if (!node || typeof node.type !== 'string') return;
    visit(node, parent, key);
    for (const k of Object.keys(node)) {
        if (k === 'loc' || k === 'start' || k === 'end' || k === 'extra') continue;
        const v = node[k];
        if (Array.isArray(v)) v.forEach((c) => walk(c, visit, node, k));
        else if (v && typeof v.type === 'string') walk(v, visit, node, k);
    }
};
// A component's own handler, as its source text: `const <handler> = …` directly in the body of `const <component> = …`.
const handlerOf = (src, component, handler) => {
    const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
    let out = null;
    walk(ast.program, (n) => {
        if (n.type !== 'VariableDeclarator' || n.id.name !== component || !isFn(n.init)) return;
        for (const st of n.init.body.body || []) {
            if (st.type !== 'VariableDeclaration') continue;
            for (const d of st.declarations) if (d.id.name === handler) out = src.slice(d.init.start, d.init.end);
        }
    });
    assert.ok(out, `${component}'s ${handler} not found`);
    return out;
};
// The names a function reads that it does not declare — what it must be handed (the language's own aside).
const BUILTINS = new Set(['Object', 'JSON', 'Error', 'String', 'Array', 'Number', 'Boolean', 'Promise', 'Set', 'Map', 'undefined']);
const freeNames = (fnSrc) => {
    const declared = new Set(), used = new Set();
    const bind = (p) => {
        if (!p) return;
        if (p.type === 'Identifier') declared.add(p.name);
        else if (p.type === 'ObjectPattern') p.properties.forEach((q) => bind(q.type === 'RestElement' ? q.argument : q.value));
        else if (p.type === 'ArrayPattern') p.elements.forEach(bind);
        else if (p.type === 'AssignmentPattern') bind(p.left);
        else if (p.type === 'RestElement') bind(p.argument);
    };
    walk(parse(`(${fnSrc})`, { sourceType: 'module', plugins: ['jsx'] }).program, (n, parent, key) => {
        if (n.type === 'VariableDeclarator') bind(n.id);
        if (isFn(n)) n.params.forEach(bind);
        if (n.type === 'CatchClause') bind(n.param);
        if (n.type !== 'Identifier') return;
        if (/^(Optional)?MemberExpression$/.test(parent?.type) && key === 'property' && !parent.computed) return;
        if (parent?.type === 'ObjectProperty' && key === 'key' && !parent.computed) return;
        used.add(n.name);
    });
    return [...used].filter((n) => !declared.has(n) && !BUILTINS.has(n)).sort();
};

const SAVE = handlerOf(read(UD), 'UserProfilePage', 'handleSave');
const SAVE_NAMES = ['clause', 'dbFetch', 'dbWrite', 'form', 'formAfterSave', 'listOwed', 'memberChanges', 'requestOrg', 'roleChanged', 'setError',
    'setForm', 'setListOwed', 'setMyProfile', 'setRoleNote', 'setSaved', 'setSaving', 'setSettings', 'setTimeout', 'setUser',
    'settings', 'stillOrg', 'teamsWithMemberOn', 'user'];

// The server's answer to a member PUT, made up the way it builds one: the body laid over the stored row, the name
// built from First and Last first (S2), the profile's userType the column's role.
const storedRow = (stored, body) => {
    const row = { ...stored, ...body };
    return { ...row, name: storedName(row), userType: row.role };
};
// One run of a handleSave: scripted answers per endpoint (a queue, then the default), every request and every
// setter call recorded in order, the setters' updaters applied to made-up state.
// `typeDuring`: what the Admin types while the member's PUT is out — laid over the form when that request is asked.
const runSave = async ({ fn = SAVE, user, form, listOwed = null, teams = TEAMS, users = USERS, me = null, answers = {}, org = () => true, typeDuring = null }) => {
    const calls = [], sets = [], timers = [];
    const settings = { teams, users };
    const state = { user, form, me, listOwed, settings, error: undefined, saving: undefined, saved: undefined, roleNote: undefined };
    const queue = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, [...v]]));
    const DEFAULT = {
        users: (body) => ({ status: 200, body: { user: storedRow(user, body) } }),
        'user-role': (body) => ({ status: 200, body: { ok: true, userId: body.targetUserId, role: body.role } }),
        settings: (body) => ({ ok: true, status: 200, error: null, data: body }),
    };
    const ask = (via, url, opts = {}) => {
        const to = url.split('/').pop().split('?')[0];
        const body = opts.body ? JSON.parse(opts.body) : undefined;
        calls.push({ to, via, method: opts.method || 'GET', body });
        if (typeDuring && to === 'users') state.form = { ...state.form, ...typeDuring };
        return queue[to]?.length ? queue[to].shift() : DEFAULT[to](body);
    };
    const set = (name, key) => (v) => { sets.push([name, v]); state[key] = typeof v === 'function' ? v(state[key]) : v; };
    const scope = {
        user, form, listOwed, settings, memberChanges, roleChanged, teamsWithMemberOn, formAfterSave, clause, teamIdNamed,
        requestOrg: () => 'org_A',
        stillOrg: (asked) => asked === 'org_A' && org(calls),
        dbFetch: async (url, opts) => {
            const a = ask('dbFetch', url, opts);
            if (a.throws) throw new TypeError(a.throws);
            return { ok: a.status < 400, status: a.status, json: async () => a.body };
        },
        dbWrite: async (url, opts) => ask('dbWrite', url, opts),
        setError: set('setError', 'error'), setSaving: set('setSaving', 'saving'), setSaved: set('setSaved', 'saved'),
        setRoleNote: set('setRoleNote', 'roleNote'), setUser: set('setUser', 'user'), setForm: set('setForm', 'form'),
        setSettings: set('setSettings', 'settings'), setMyProfile: set('setMyProfile', 'me'), setListOwed: set('setListOwed', 'listOwed'),
        setTimeout: (_f, ms) => { timers.push(ms); },
    };
    const names = freeNames(fn);
    for (const n of names) assert.ok(n in scope, `the run hands in every name the function reads: ${n}`);
    await new Function(...names, `return (${fn});`)(...names.map((n) => scope[n]))();
    const named = (n) => sets.filter(([k]) => k === n).map(([, v]) => v);
    return { calls, sets, state, timers, named, to: calls.map((c) => c.to) };
};
const SAID = (r) => r.named('setError').filter(Boolean);

const R1 = () => runSave({ user: TESS, form: { ...TESS, phone: '2' },
    answers: { users: [{ status: 200, body: { user: { ...TESS, phone: '2', title: 'Rep (newer)' } } }] } });
const R5 = () => runSave({ user: TESS, form: { ...TESS, phone: '2', role: 'Manager' },
    answers: { 'user-role': [{ status: 400, body: { error: 'You cannot change your own role. Ask another Admin.' } }] } });
const R6 = () => runSave({ user: TESS, form: withTeam(TESS, 'team_west'), answers: { settings: [{ ok: false, status: 500, error: 'TEST' }] } });

test('S10 (P1, P5, P7-P11) handleSave, run as written: what it sends, in what order, what it says, and what it holds after — faed240\'s handleSave runs on R1\'s and R3\'s rows in S10 OLD', async () => {
    assert.deepEqual(freeNames(SAVE), SAVE_NAMES, 'the names it reads are the ones handed in');

    // R0 a blank name: nothing sent, said, and the button never spins.
    const r0 = await runSave({ user: TESS, form: { ...TESS, name: '  ' } });
    assert.deepEqual(r0.calls, []);
    assert.deepEqual(r0.sets, [['setError', 'A member needs a name.']]);

    // R1 a phone edit: one PUT whose body is the id and the phone; the page and the roster hold the row as stored.
    const r1 = await R1();
    assert.deepEqual(r1.calls, [{ to: 'users', via: 'dbFetch', method: 'PUT', body: { id: 'usr_tess', phone: '2' } }],
        'REGRESSION: the whole row as loaded is sent — what changed since is put back');
    assert.deepEqual(r1.named('setUser'), [{ ...TESS, phone: '2', title: 'Rep (newer)' }], 'REGRESSION: after a save the page holds the member as opened');
    assert.equal(r1.state.settings.users.find((u) => u.id === 'usr_tess').title, 'Rep (newer)', 'REGRESSION: the roster takes the body sent, not the stored row');
    assert.equal(r1.state.settings.teams, TEAMS, 'the teams untouched');
    assert.deepEqual(memberChanges(r1.state.user, r1.state.form), {}, 'nothing waits');
    assert.equal(roleChanged(r1.state.user, r1.state.form), false);
    assert.equal(r1.state.form.title, 'Rep (newer)', 'the form is the member as stored');
    assert.deepEqual(r1.named('setSaved'), [true]);
    assert.deepEqual(r1.timers, [2500]);
    assert.deepEqual(r1.named('setSaving'), [true, false]);
    assert.deepEqual(SAID(r1), []);
    assert.deepEqual(r1.named('setListOwed'), [null]);

    // R2 a rename: the name with First and Last cleared; the page holds the name as stored (trimmed).
    const r2 = await runSave({ user: TESS, form: { ...TESS, name: '  Tess Renamed ' } });
    assert.deepEqual(r2.calls.map((c) => c.body), [{ id: 'usr_tess', name: '  Tess Renamed ', firstName: null, lastName: null }]);
    assert.equal(r2.state.user.name, 'Tess Renamed');
    assert.equal(r2.state.form.name, 'Tess Renamed');
    assert.equal(r2.state.settings.users.find((u) => u.id === 'usr_tess').name, 'Tess Renamed');

    // R3 a role alone: no member PUT, one role request; the page holds the new role; a second press sends nothing.
    const r3 = await runSave({ user: TESS, form: { ...TESS, role: 'Manager' } });
    assert.deepEqual(r3.calls, [{ to: 'user-role', via: 'dbFetch', method: 'PUT', body: { targetUserId: 'usr_tess', role: 'Manager' } }],
        'REGRESSION: a role change alone PUTs the member too');
    assert.equal(r3.state.user.role, 'Manager');
    assert.equal(r3.state.user.userType, 'Manager');
    assert.equal(r3.state.settings.users.find((u) => u.id === 'usr_tess').role, 'Manager', 'the roster too');
    assert.equal(r3.state.roleNote, 'Role updated — it can take up to 30 seconds to take effect.');
    const r3b = await runSave({ user: r3.state.user, form: r3.state.form, listOwed: r3.state.listOwed });
    assert.deepEqual(r3b.calls, [], 'REGRESSION: a second press re-sends the role');
    assert.deepEqual(r3b.named('setSaving'), [], 'it returns before the button spins');

    // R4 a team: its id and name, then the lists by id — the member on West's list only — in that order.
    const r4 = await runSave({ user: TESS, form: withTeam(TESS, 'team_west') });
    assert.deepEqual(r4.calls.map((c) => [c.to, c.method]), [['users', 'PUT'], ['settings', 'PUT']]);
    assert.deepEqual(r4.calls[0].body, { id: 'usr_tess', team: 'West', teamId: 'team_west' });
    assert.deepEqual(repIdsOf(r4.calls[1].body.teams), [[], ['usr_eve'], ['usr_tess'], 'Legacy']);
    assert.deepEqual(repIdsOf(r4.state.settings.teams), [[], ['usr_eve'], ['usr_tess'], 'Legacy'], 'the roster on screen holds the moved list');
    assert.equal(r4.state.settings.users.find((u) => u.id === 'usr_tess').teamId, 'team_west');
    assert.deepEqual(r4.named('setListOwed'), [null]);

    // R5 the role refused after a phone save: said as such; the page holds the stored role; the box keeps the pick.
    const r5 = await R5();
    assert.deepEqual(r5.to, ['users', 'user-role']);
    assert.deepEqual(SAID(r5), ['Saved, but the role was not changed — You cannot change your own role. Ask another Admin.'],
        'REGRESSION: a refused role after a save is said as an unknown failure');
    assert.equal(r5.state.user.role, 'User');
    assert.equal(r5.state.user.phone, '2');
    assert.equal(r5.state.form.role, 'Manager', 'the pick still waits');
    assert.deepEqual(r5.named('setSaved'), []);
    const r5b = await runSave({ user: r5.state.user, form: r5.state.form, listOwed: r5.state.listOwed });
    assert.deepEqual(r5b.calls.map((c) => c.to), ['user-role'], 'Save again sends the role alone');

    // R6 the list refused: said; owed; the next Save sends the list alone, then nothing is owed.
    const r6 = await R6();
    assert.deepEqual(SAID(r6), ['Saved, but the team list was not updated — TEST. Save changes tries the list again.']);
    assert.deepEqual(r6.named('setListOwed'), [{ teamId: 'team_west' }], 'REGRESSION: a team list that did not save is forgotten');
    assert.equal(r6.state.settings.teams, TEAMS, 'the list on screen is as it was');
    assert.equal(r6.state.user.teamId, 'team_west', 'the member was saved');
    const r6b = await runSave({ user: r6.state.user, form: r6.state.form, listOwed: r6.state.listOwed });
    assert.deepEqual(r6b.calls.map((c) => [c.to, c.method]), [['settings', 'PUT']], 'only the list');
    assert.deepEqual(repIdsOf(r6b.calls[0].body.teams), [[], ['usr_eve'], ['usr_tess'], 'Legacy']);
    assert.deepEqual(r6b.named('setListOwed'), [null]);
    assert.deepEqual(r6b.named('setUser'), [], 'no member row was sent');
    assert.deepEqual(r6b.named('setSaved'), [true]);
    assert.deepEqual(repIdsOf(r6b.state.settings.teams), [[], ['usr_eve'], ['usr_tess'], 'Legacy'],
        'REGRESSION: a retried team list that landed is not the list on screen (the review, proof-3)');
    // …and changed back before the retry (proof-4): East's list already holds her — nothing is owed, nothing waits.
    const r6back = await runSave({ user: r6.state.user, form: withTeam(r6.state.form, 'team_east'), listOwed: r6.state.listOwed });
    assert.deepEqual(r6back.to, ['users']);
    assert.deepEqual(r6back.named('setListOwed'), [null], 'REGRESSION: a move owed to a team the member has left stays owed');

    // R7 the member PUT refused: its words; nothing more sent, nothing held; the button stops spinning.
    const r7 = await runSave({ user: TESS, form: { ...TESS, name: 'Bob Russell', role: 'Manager' },
        answers: { users: [{ status: 409, body: { error: 'TEST: that name is taken.' } }] } });
    assert.deepEqual(r7.to, ['users']);
    assert.deepEqual(SAID(r7), ['TEST: that name is taken.']);
    assert.deepEqual(r7.named('setUser'), []);
    assert.deepEqual(r7.named('setSettings'), []);
    assert.equal(r7.named('setSaving').at(-1), false, 'REGRESSION: a refused save leaves the button on Saving…');

    // R8 the org switched while the PUT was out: nothing more sent, nothing set but the button.
    const r8 = await runSave({ user: TESS, form: { ...withTeam(TESS, 'team_west'), role: 'Manager' }, org: () => false });
    assert.deepEqual(r8.to, ['users']);
    assert.deepEqual(r8.sets.map(([k]) => k), ['setSaving', 'setError', 'setSaving']);
    assert.equal(r8.state.saving, false);

    // R9 an Admin's own row: the header's profile takes the stored row; another member's leaves it as it was.
    const meTess = { id: 'usr_tess', name: 'Tess Undoer', firstName: 'Tess', lastName: 'Undoer' };
    const r9 = await runSave({ user: TESS, form: { ...TESS, name: 'Tess Renamed' }, me: meTess });
    assert.equal(r9.state.me.name, 'Tess Renamed', "REGRESSION: an Admin's own rename leaves the header on the old name");
    assert.equal(r9.state.me.firstName, null, 'and the panel, next opened, refills from the new name');
    const meJo = { id: 'usr_jo', name: 'Jo Admin' };
    const r9b = await runSave({ user: TESS, form: { ...TESS, name: 'Tess Renamed' }, me: meJo });
    assert.equal(r9b.state.me, meJo, "another member's save leaves the header's profile as it was");

    // R10 a member on no team's list (a drift): a phone save touches no list.
    const drift = [{ ...TEAMS[0], repIds: [] }, TEAMS[1], TEAMS[2], TEAMS[3]];
    const r10 = await runSave({ user: TESS, form: { ...TESS, phone: '2' }, teams: drift });
    assert.deepEqual(r10.to, ['users'], 'REGRESSION: an unrelated save writes the team list');

    // R11 the role request fails after the org switched (the phone landed): nothing shared is set here.
    const r11 = await runSave({ user: TESS, form: { ...TESS, phone: '2', role: 'Manager' }, me: meTess,
        answers: { 'user-role': [{ throws: 'Failed to fetch' }] }, org: (calls) => calls.length < 2 });
    assert.deepEqual(r11.to, ['users', 'user-role']);
    assert.deepEqual(r11.named('setUser'), [], 'REGRESSION: a failed request after an org switch still sets the page');
    assert.deepEqual(r11.named('setSettings'), [], 'nor the roster');
    assert.deepEqual(r11.named('setMyProfile'), [], 'nor the header');
    assert.deepEqual(SAID(r11), []);
    assert.equal(r11.state.saving, false);

    // R12 a team and a role; the role request fails: the list was already moved; said; the box keeps the pick.
    const r12 = await runSave({ user: TESS, form: { ...withTeam(TESS, 'team_west'), role: 'Manager' }, answers: { 'user-role': [{ throws: 'Failed to fetch' }] } });
    assert.deepEqual(r12.to, ['users', 'settings', 'user-role'], 'REGRESSION: a role request that fails first leaves the team list unmoved');
    assert.deepEqual(r12.named('setListOwed'), [null]);
    assert.deepEqual(SAID(r12), ['Saved, but not everything — Failed to fetch. Reload to see what was saved.']);
    assert.equal(r12.state.user.teamId, 'team_west');
    assert.equal(r12.state.user.role, 'User');
    assert.equal(r12.state.form.role, 'Manager');
    assert.deepEqual(repIdsOf(r12.state.settings.teams), [[], ['usr_eve'], ['usr_tess'], 'Legacy']);

    // R13 a manager alone: who the member reports to, and no team's manager (Jeff, 26 Oct: "Only who they report to").
    const r13 = await runSave({ user: { ...TESS, manager: null }, form: { ...TESS, manager: 'Bob Russell' } });
    assert.deepEqual(r13.calls.map((c) => c.body), [{ id: 'usr_tess', manager: 'Bob Russell' }],
        "REGRESSION: every save makes the member's manager their team's manager again");
    assert.equal(r13.state.settings.teams, TEAMS);

    // R14 a role alone, refused: its words; nothing held; the pick still waits.
    const r14 = await runSave({ user: TESS, form: { ...TESS, role: 'Manager' }, answers: { 'user-role': [{ status: 400, body: { error: 'TEST role refused' } }] } });
    assert.deepEqual(SAID(r14), ['TEST role refused']);
    assert.deepEqual(r14.named('setUser'), []);
    assert.deepEqual(r14.named('setSettings'), []);
    assert.equal(roleChanged(r14.state.user, r14.state.form), true);
    const r14b = await runSave({ user: TESS, form: { ...TESS, role: 'Manager' }, answers: { 'user-role': [{ status: 400, body: {} }] } });
    assert.deepEqual(SAID(r14b), ['Could not change the role.']);

    // R15 the member, the list and the role all land: one roster update holding all three; nothing owed; saved.
    const r15 = await runSave({ user: TESS, form: { ...withTeam(TESS, 'team_west'), phone: '2', role: 'Manager' } });
    assert.deepEqual(r15.to, ['users', 'settings', 'user-role']);
    assert.equal(r15.named('setSettings').length, 1);
    const tess = r15.state.settings.users.find((u) => u.id === 'usr_tess');
    assert.deepEqual([tess.phone, tess.teamId, tess.role], ['2', 'team_west', 'Manager']);
    assert.deepEqual(repIdsOf(r15.state.settings.teams), [[], ['usr_eve'], ['usr_tess'], 'Legacy']);
    assert.equal(r15.state.user.role, 'Manager');
    assert.deepEqual(r15.named('setListOwed'), [null]);
    assert.deepEqual(r15.named('setSaved'), [true]);
    assert.deepEqual(SAID(r15), []);

    // R16 (the review) dbWrite's own words are whole sentences: the page's sentence goes on from them with one full
    // stop; a list refused and then a role request with no answer says to Save again — a reload would lose the move.
    const r16 = await runSave({ user: TESS, form: withTeam(TESS, 'team_west'), answers: { settings: [{ ok: false, status: 0, error: NETWORK_ERROR }] } });
    assert.deepEqual(SAID(r16), [`Saved, but the team list was not updated — ${NETWORK_ERROR.slice(0, -1)}. Save changes tries the list again.`],
        'REGRESSION: the server\'s full stop doubled — "saved.. Save changes"');
    const r16b = await runSave({ user: TESS, form: { ...withTeam(TESS, 'team_west'), role: 'Manager' },
        answers: { settings: [{ ok: false, status: 500, error: 'The server returned 500.' }], 'user-role': [{ throws: 'NetworkError when attempting to fetch resource.' }] } });
    assert.deepEqual(r16b.to, ['users', 'settings', 'user-role']);
    assert.deepEqual(SAID(r16b), ['Saved, but the team list was not updated — The server returned 500. Save changes tries the list again. '
        + 'Saved, but not everything — NetworkError when attempting to fetch resource. Save changes tries again.'],
        "REGRESSION: an owed list's words say Reload, which loses the move");
    assert.deepEqual(r16b.named('setListOwed'), [{ teamId: 'team_west' }]);
    assert.equal(r16b.state.form.role, 'Manager', 'the pick waits too: Save sends the list and the role again');
    const r16c = await runSave({ user: r16b.state.user, form: r16b.state.form, listOwed: r16b.state.listOwed });
    assert.deepEqual(r16c.to, ['settings', 'user-role'], 'Save again: the owed list, then the role');
    assert.deepEqual([clause('Done.'), clause('Done..'), clause(' Done '), clause('Done'), clause(undefined), clause(null)], ['Done', 'Done', 'Done', 'Done', '', '']);

    // R17 (proof-2) a member on no team's list — a name with no id, as the box asks — picks a team: the list is written.
    const r17 = await runSave({ user: NIA, form: withTeam(NIA, 'team_west') });
    assert.deepEqual(r17.to, ['users', 'settings'], 'REGRESSION: a member joining from no list is no change — the list is never written');
    assert.deepEqual(repIdsOf(r17.calls[1].body.teams), [['usr_tess'], ['usr_eve'], ['usr_nia'], 'Legacy']);

    // R18 (proof-5) a title typed while the phone save was out still waits for Save when the answer lands.
    const r18 = await runSave({ user: TESS, form: { ...TESS, phone: '2' }, typeDuring: { title: 'Typing' } });
    assert.equal(r18.state.form.title, 'Typing', 'REGRESSION: a field typed during the save is overwritten when it lands');
    assert.equal(r18.state.form.phone, '2');
    assert.deepEqual(memberChanges(r18.state.user, r18.state.form), { title: 'Typing' }, 'and it is what Save sends next');
});

// faed240's handleSave (UsersDetail.jsx :923-1015), verbatim — one string per line; run as the function it declares.
const OLD_SAVE = [
    "    const handleSave = async () => {",
    "        if (!String(form.name ?? '').trim()) { setError('A member needs a name.'); return; }",
    "        setSaving(true); setError('');",
    "        try {",
    "            // The member's teamId is the id of the team the form names, on every",
    "            // save (state §0.168): the form carried the row's teamId as it was",
    "            // loaded, so a new team kept the old id — the one coaching notes and",
    "            // the digest read — and comparing with the page's first copy of the",
    "            // member would keep an id that was already wrong.",
    "            // Not access (state §0.202 — Jeff, 15 Oct: \"Fix in 4b-2a\"): the form held",
    "            // `active` and the status as loaded, so a save made after the member",
    "            // accepted deactivated them (or switched a deactivated one back on).",
    "            // Deactivate / Reactivate change access; a sign-in links the login.",
    "            // Nor the pins (state §0.205): the member's own; the server keeps them whatever a save sends.",
    "            const { active: _active, status: _status, clerkUserId: _login, pinnedReports: _pins, ...edited } = form;",
    "            const toSave = { ...edited, teamId: teamIdNamed(settings.teams, form.team) };",
    "            const askedOrg = requestOrg();   // cut by an org switch, it stops (state §0.175)",
    "            const resp = await dbFetch('/.netlify/functions/users', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(toSave) });",
    "            const d = await resp.json().catch(() => ({}));",
    "            if (!stillOrg(askedOrg)) return;",
    "            if (!resp.ok) throw new Error(d.error || 'Save failed');",
    "            // The server trims the name it stores (state §0.196): the roster on screen holds what was stored.",
    "            const storedName = d.user?.name ?? toSave.name;",
    "",
    "            // A role change goes to user-role.mjs, the one path that changes a",
    "            // role: the PUT above keeps the stored one. The role is this org's",
    "            // roster row, which auth.mjs reads per request, cached up to 30",
    "            // seconds — the note below (state §0.163).",
    "            // `role`, not `userType`: the latter is a stale copy in the profile blob.",
    "            // Comparing against it meant the \"did the role change?\" test was asking",
    "            // about a field nothing maintained.",
    "            //",
    "            // `targetUserId` is the APP id (usr_...). user-role.mjs resolves the Clerk",
    "            // identity from the roster row itself — it used to take this value and",
    "            // hand it straight to the Clerk API, which stopped working the moment",
    "            // users.id stopped being the Clerk id.",
    "            const priorRole = user.role || 'User';",
    "            if (form.role && form.role !== priorRole) {",
    "                const rr = await dbFetch('/.netlify/functions/user-role', {",
    "                    method: 'PUT', headers: { 'Content-Type': 'application/json' },",
    "                    body: JSON.stringify({ targetUserId: user.id, role: form.role }),",
    "                });",
    "                const rd = await rr.json().catch(() => ({}));",
    "                if (!stillOrg(askedOrg)) return;",
    "                if (!rr.ok) throw new Error(rd.error || 'Could not change the role.');",
    "                setRoleNote('Role updated \\u2014 it can take up to 30 seconds to take effect.');",
    "            }",
    "",
    "            // Sync team assignment into settings.teams repIds",
    "            let updatedTeams = settings.teams || [];",
    "            const oldTeamName = user.team;",
    "            const newTeamName = form.team;",
    "            if (oldTeamName !== newTeamName) {",
    "                updatedTeams = updatedTeams.map(t => {",
    "                    if (t.name === oldTeamName) return { ...t, repIds: (t.repIds||[]).filter(id => id !== user.id) };",
    "                    if (t.name === newTeamName) return { ...t, repIds: [...new Set([...(t.repIds||[]), user.id])] };",
    "                    return t;",
    "                });",
    "            }",
    "",
    "            // Sync manager into settings.teams managerId",
    "            const newManagerName = form.manager;",
    "            if (newManagerName && newTeamName) {",
    "                const mgr = (settings.users||[]).find(u => u.name === newManagerName);",
    "                if (mgr) {",
    "                    updatedTeams = updatedTeams.map(t =>",
    "                        t.name === newTeamName ? { ...t, managerId: mgr.id } : t",
    "                    );",
    "                }",
    "            }",
    "",
    "            // Persist updated teams if changed",
    "            if (JSON.stringify(updatedTeams) !== JSON.stringify(settings.teams || [])) {",
    "                // Was fire-and-forget. A failed team sync leaves the user assigned",
    "                // to a team the roster does not have, which reads as a data bug",
    "                // rather than a permissions one.",
    "                const rt = await dbWrite('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ teams: updatedTeams }) });",
    "                if (!stillOrg(askedOrg)) return;",
    "                if (!rt.ok) { setError(`User saved, but the team list was not updated — ${rt.error}`); return; }",
    "            }",
    "",
    "            // Update local settings state",
    "            setSettings(prev => ({",
    "                ...prev,",
    "                users: (prev.users||[]).map(u => u.id === toSave.id ? { ...u, ...toSave, name: storedName } : u),",
    "                teams: updatedTeams,",
    "            }));",
    "            setForm(prev => ({ ...prev, name: storedName }));",
    "            setSaved(true); setTimeout(() => setSaved(false), 2500);",
    "        } catch(err) {",
    "            setError(err.message || 'Failed to save. Please try again.');",
    "        } finally { setSaving(false); }",
    "    };",
].join('\n').replace(/^ *const handleSave = /, '').replace(/;$/, '');

test("S10 OLD — faed240's handleSave on the same rows: the whole form as loaded is sent, the team's managerId rewritten on every save, and a role alone PUTs the member", async () => {
    const old = await runSave({ fn: OLD_SAVE, user: TESS, form: { ...TESS, phone: '2' } });
    const body = old.calls[0].body;
    for (const k of ['title', 'email', 'forecastCalls', 'notificationPrefs', 'emailSignature', 'quota', 'mobile', 'vertical']) {
        assert.ok(k in body, `OLD sends ${k} as loaded`);
    }
    assert.deepEqual(old.to, ['users', 'settings'], 'OLD: a phone save writes the team list');
    assert.deepEqual(old.calls[1].body.teams.slice(0, 2).map((t) => t.managerId), ['usr_bob', 'usr_bob'], "OLD: the member's manager made manager of both East teams");
    const oldRole = await runSave({ fn: OLD_SAVE, user: TESS, form: { ...TESS, role: 'Manager' } });
    assert.equal(oldRole.to[0], 'users', 'OLD: a role change alone PUTs the member');
});

// ── S11-S12 the page's lines ────────────────────────────────────────────────

test('S11 (P3, P5, P8, P12, P13) the page holds the member as stored, counts "Save changes" against it (run), picks a team by id, offers held values as themselves, and sets what landed once after the requests', async () => {
    const page = between(code(read(UD)), 'const UserProfilePage = ', 'export const UsersDetail = ');
    once(page, ind(0, 'const UserProfilePage = ({ user: opened, settings, onBack, onUsers, mfaByEmail }) => {'));
    once(page, ind(4, 'const { setSettings, showConfirm, setMyProfile } = useApp();'));
    once(page, ind(4, 'const [user, setUser]     = useState(opened);'));
    once(page, ind(4, 'const [listOwed, setListOwed] = useState(null);'));
    const DIRTY = ind(4, 'const dirty = Object.keys(memberChanges(user, form)).length > 0 || roleChanged(user, form) || !!listOwed;');
    once(page, DIRTY);
    once(page, ind(4, 'const pickTeam = (id) => setForm(prev => ({ ...prev, ...teamPicked(teamOpts, id) }));'));
    once(page, ind(4, 'const teamOpts = teamOptions(settings.teams);'));
    once(page, ind(4, 'const teamHeld = heldTeam(form, teamOpts);'));
    once(page, ind(4, 'const mgrOpts  = managerOptions(settings.users, user.id);'));
    once(page, ind(4, 'const mgrHeld  = heldManager(form, mgrOpts, settings.users, user.id);'));
    once(page, ind(4, 'const terrHeld = heldTerritory(form.territory, allTerr);'));
    once(page, ind(32, "<select style={sel} value={teamHeld ? HELD_TEAM : (form.teamId || '')} onChange={e=>pickTeam(e.target.value)}>"));
    once(page, ind(36, '{teamHeld && <option value={HELD_TEAM} disabled>{teamHeld}</option>}'));
    once(page, ind(36, '{teamOpts.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}'));
    once(page, ind(36, '{mgrHeld && <option value={form.manager} disabled>{mgrHeld}</option>}'));
    once(page, ind(36, '{mgrOpts.map(o=><option key={o.id} value={o.name}>{o.name}</option>)}'));
    once(page, ind(36, '{terrHeld && <option value={form.territory} disabled>{terrHeld}</option>}'));
    once(page, ind(20, "{dirty && <PeoplePriBtn onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</PeoplePriBtn>}"));
    assert.ok(!page.includes("'✓ Saved'"), 'the button leaves once nothing waits');
    // What landed, set once after the requests (guide §18b102 rule 5).
    once(page, ind(16, '...(row ? { users: (prev.users||[]).map(u => u.id === row.id ? { ...u, ...row } : u) } : {}),'));
    once(page, ind(8, 'if (row) setMyProfile(prev => (prev && prev.id === row.id ? { ...prev, ...row } : prev));'));
    once(page, ind(8, 'if (!stillOrg(askedOrg)) return;   // a request that failed after an org switch changes nothing here'));
    const save = between(page, '    const handleSave = async () => {', '\n    };');
    order(save, ind(8, '} catch (err) {'), 'missed.push(row || teamsNow ? `Saved, but not everything ', ind(8, '} finally { setSaving(false); }'),
        ind(8, 'if (!stillOrg(askedOrg)) return;'), ind(12, 'setUser(row);'));
    // The member, then the lists (which depend on it alone), then the role (critic C1).
    order(save, ind(12, 'if (Object.keys(changes).length) {'), ind(12, 'if (move) {'), ind(12, 'if (roleNew) {'));
    for (const gone of ['teamIdNamed(', 'managerId: mgr.id', 'oldTeamName', 'JSON.stringify(form)', 'storedName', 'allMgrs', 'allTeams']) {
        assert.ok(!page.includes(gone), `REGRESSION: ${gone} is back on the profile page`);
    }
    // "Save changes", run: nothing waits after a save that landed; the role still waits after it was refused; a
    // list still owed waits too.
    const dirty = new Function('user', 'form', 'listOwed', 'memberChanges', 'roleChanged', `return (${DIRTY.trim().slice('const dirty = '.length, -1)});`);
    const at = (r) => dirty(r.state.user, r.state.form, r.state.listOwed, memberChanges, roleChanged);
    assert.equal(at(await R1()), false, 'REGRESSION: Save changes counts the form against the member as opened');
    assert.equal(at(await R5()), true, 'the refused role waits');
    assert.equal(at(await R6()), true, 'the owed list waits');
    assert.equal(dirty(TESS, { ...TESS }, null, memberChanges, roleChanged), false);
});

test("S12 (P25) the Dispatch technician card's line shows — SectionCard takes `description`", () => {
    const s = code(read(UD));
    once(s, ind(24, '<SectionCard title="Dispatch technician" description="Field technicians are managed in the Dispatch tab.">'));
    assert.ok(!/ desc=/.test(s), "REGRESSION: the Dispatch card's line is lost again (`desc=` is no prop of SectionCard)");
    once(s, 'const SectionCard = ({ title, description, headAction, children }) => (');
});

test('the suites: this file is graded by the harness', () => {
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/member-profile-save.test.mjs'), 'SUITES runs this file');
});
