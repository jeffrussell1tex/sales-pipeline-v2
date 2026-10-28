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
//
// And step B (state §0.212 — Jeff, 26 Oct: "Steps A and B"): the manager was stored by NAME (`profile.manager`), so a
// rename broke "reports to", and the box was a list. Now `profile.managerId` — a member of this org, never the
// member themselves — is sent with the name, asked by the server where a write names it anew (users.mjs MANAGER_LINK),
// cleared by a restore where it names no member here, picked by a type-ahead, and read by id by the band, the Users
// list and the export (S13-S16; I5 in the integration suite, each case shown failing on step A's server).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
import { PAGE_FIELDS, sameValue, memberChanges, roleChanged, formAfterSave, clause } from '../src/utils/memberSave.js';
import { NETWORK_ERROR } from '../src/utils/storage.js';
import { HELD_TEAM, teamOptions, teamPicked, heldTeam, managerOptions, managerPicked, managerNameOf, heldManager, heldTerritory } from '../src/Tabs/settings/people/memberPickers.js';
import { linksAsked, linksDecided, memberLinksCleared, NOT_AN_ID, namesItself, notInOrg } from '../src/utils/linkIds.js';
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
    assert.deepEqual([...PAGE_FIELDS], ['name', 'title', 'phone', 'team', 'teamId', 'manager', 'managerId', 'territory']);
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

test('S8 (P12) the Manager box offers members with access whose role is Admin or Manager (roles.js canSeeAll), never the member; a stored manager it does not offer shows as itself with why, and a name with no id it offers is not linked (§0.212) (OLD :914: every named member but this one)', () => {
    const opts = managerOptions(USERS, 'usr_tess');
    assert.deepEqual(opts, [{ id: 'usr_bob', name: 'Bob Russell' }, { id: 'usr_jo', name: 'Jo Admin' }],
        'not Ivy (invited), Dee (deactivated), Dan (Dispatcher), Karen (Sales Rep) or Tess herself');
    assert.deepEqual(managerOptions(USERS, 'usr_bob').map((o) => o.id), ['usr_jo'], 'never the member themselves');
    assert.deepEqual(managerOptions([JO, BOB], 'usr_x').map((o) => o.name), ['Bob Russell', 'Jo Admin'], "REGRESSION: the managers in the roster's order, not by name");
    const held = (manager, selfId = 'usr_tess') => heldManager({ manager }, managerOptions(USERS, selfId), USERS, selfId);
    assert.equal(held('Bob Russell'), 'Bob Russell (not linked — remove, then pick them again)', 'REGRESSION (§0.212): a name with no id that the box offers reads as linked');
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

    // R13 a manager alone: who the member reports to, and no team's manager (Jeff, 26 Oct: "Only who they report to") —
    // picked as the member, by their id with their name (§0.212).
    const mgrs = managerOptions(USERS, 'usr_tess');
    const r13 = await runSave({ user: { ...TESS, manager: null }, form: { ...TESS, ...managerPicked(mgrs, 'usr_bob') } });
    assert.deepEqual(r13.calls.map((c) => c.body), [{ id: 'usr_tess', manager: 'Bob Russell', managerId: 'usr_bob' }],
        "REGRESSION: every save makes the member's manager their team's manager again");
    assert.equal(r13.state.settings.teams, TEAMS);
    // R13b a row from before §0.212 — the name, no id — picks the member it names: the id goes, with the name.
    const r13b = await runSave({ user: TESS, form: { ...TESS, ...managerPicked(mgrs, 'usr_bob') } });
    assert.deepEqual(r13b.calls.map((c) => c.body), [{ id: 'usr_tess', manager: 'Bob Russell', managerId: 'usr_bob' }],
        'REGRESSION (§0.212): a manager sent without their name, or their id without the other');
    // R13c the box cleared: both go, empty.
    const linked = { ...TESS, managerId: 'usr_bob' };
    const r13c = await runSave({ user: linked, form: { ...linked, ...managerPicked(mgrs, '') } });
    assert.deepEqual(r13c.calls.map((c) => c.body), [{ id: 'usr_tess', manager: '', managerId: '' }]);

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

test('S11 (P3, P5, P8, P12, P13) the page holds the member as stored, counts "Save changes" against it (run), picks a team and (§0.212) a manager by id, offers held values as themselves, and sets what landed once after the requests', async () => {
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
    // The Manager box, a type-ahead of one pick since §0.212 (S16): the member by id, their name with it, held as itself.
    once(page, ind(4, 'const pickManager = (id) => setForm(prev => ({ ...prev, ...managerPicked(mgrOpts, id) }));'));
    once(page, ind(32, '<MemberTypeahead options={mgrOpts} chosenName={managerNameOf(form, settings.users)} held={mgrHeld}'), "REGRESSION: the chip reads the stored name, not the id's member");
    once(page, ind(36, 'onPick={pickManager} inputStyle={inp} placeholder="Search Admins and Managers…" />'));
    assert.ok(!page.includes('value={form.manager'), 'REGRESSION (§0.212): the Manager box a list of names again');
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

// ── S13-S16 the manager by id (state §0.212) ────────────────────────────────

const USERS_MJS = 'netlify/functions/users.mjs';
const MANAGER_LINE = "const MANAGER_LINK = [{ key: 'managerId', kind: 'member', notSelf: true }];";
const MANAGER_LINK = new Function(`return ${MANAGER_LINE.slice('const MANAGER_LINK = '.length, -1)};`)();
const MANAGED_PUT = ind(16, 'const managed = await checkLinks(MANAGER_LINK, data, { id: data.id, managerId: before?.profile?.managerId ?? null }, orgId);');
const MANAGED_NEW = ind(16, 'const managed = await checkLinks(MANAGER_LINK, data, { id: clean.id, managerId: null }, orgId);');
const PAIR_NAME = ind(16, "if ('manager' in data && !('managerId' in data) && !sameValue(data.manager, before?.profile?.manager)) clean.profile = { ...clean.profile, managerId: null };");
const PAIR_ID = ind(16, "if ('managerId' in data && !('manager' in data) && !sameValue(data.managerId, before?.profile?.managerId)) clean.profile = { ...clean.profile, manager: null };");
const MANAGED_REFUSED = ind(16, 'if (managed.error) return { statusCode: managed.status, headers, body: JSON.stringify({ error: managed.error, field: managed.field }) };');

test('S13 (P14) a member\'s manager is a link: a member of this org by id, never themselves, asked only where a write names one anew — the PUT and the create ask it after the team, and sanitize stores it', () => {
    const s = code(read(USERS_MJS));
    once(s, MANAGER_LINE, 'the spec, run below');
    assert.ok(s.includes("const PIN_LINKS = [{ key: 'pinnedReports', kind: 'report', shape: 'many' }];\n" + MANAGER_LINE), 'after the team and pin specs (link-ids.test.mjs keeps those two together)');
    // Run: what each body asks of the stored row { id, managerId }.
    const stored = { id: 'usr_tess', managerId: 'usr_bob' };
    assert.deepEqual(linksAsked(MANAGER_LINK, { id: 'usr_tess', phone: '2' }, stored), { asks: [] }, 'a save naming no manager asks nothing');
    assert.deepEqual(linksAsked(MANAGER_LINK, { id: 'usr_tess', managerId: 'usr_bob' }, stored), { asks: [] }, 'the id the row holds is never asked again');
    assert.deepEqual(linksAsked(MANAGER_LINK, { id: 'usr_tess', managerId: '' }, stored), { asks: [] }, "'' clears it, no link");
    assert.deepEqual(linksAsked(MANAGER_LINK, { id: 'usr_tess', managerId: null }, stored), { asks: [] });
    assert.deepEqual(linksAsked(MANAGER_LINK, { id: 'usr_tess', managerId: 'usr_tess' }, stored), { status: 400, error: namesItself('member'), field: 'managerId' },
        'REGRESSION: a member named their own manager');
    assert.equal(namesItself('member'), 'A member cannot name itself.');
    assert.deepEqual(linksAsked(MANAGER_LINK, { id: 'usr_tess', managerId: 5 }, stored), { status: 400, error: NOT_AN_ID, field: 'managerId' });
    const fresh = linksAsked(MANAGER_LINK, { id: 'usr_tess', managerId: 'usr_jo' }, stored);
    assert.deepEqual(fresh, { asks: [{ key: 'managerId', kind: 'member', shape: 'one', follow: true, fresh: ['usr_jo'] }] }, 'an id named anew is asked, as a member');
    assert.deepEqual(linksDecided(fresh.asks, { managerId: 'usr_jo' }, () => new Map()), { status: 404, error: notInOrg('member'), field: 'managerId' },
        "another org's member, or an id no member holds");
    assert.equal(notInOrg('member'), 'That member is not in your organization — pick one from the list.');
    assert.deepEqual(linksDecided(fresh.asks, { managerId: 'usr_jo' }, () => new Map([['usr_jo', 'usr_jo']])), { set: {} });
    // Stored, and asked where each write asks its team.
    once(s, ind(12, 'managerId:     data.managerId     || null,'), 'REGRESSION: sanitize forgets the manager id — every save, the member\'s own too, wipes it');
    once(s, MANAGED_PUT);
    once(s, MANAGED_NEW);
    assert.equal(s.split('\n').filter((l) => l === MANAGED_REFUSED).length, 2, 'each refused, nothing written');
    order(s, ind(16, 'const teamed = await checkLinks(TEAM_LINK, data, null, orgId);'), MANAGED_NEW, MANAGED_REFUSED, ind(16, 'const result = await upsertUser(clean);'));
    order(s, ind(16, 'const teamed = await checkLinks(TEAM_LINK, data, { teamId: before?.profile?.teamId ?? null }, orgId);'), MANAGED_PUT, MANAGED_REFUSED,
        PAIR_NAME, PAIR_ID, ind(16, 'const putNameTaken = nameRefusal(await memberNamesOf(orgId), clean.name, data.id);'));
    // The create's own id is the minted one: a body's id, however it reads, is never the new row's (the review).
    assert.deepEqual(linksAsked(MANAGER_LINK, { id: 'usr_x', managerId: 'usr_x' }, { id: 'usr_minted', managerId: null }).asks.map((a) => a.fresh), [['usr_x']],
        "REGRESSION: a create's body id read as the new row's — refused as naming itself, not looked for");
    // The PUT keeps the name and the id one manager — run, on the row before (`before`) and the row it writes (`clean`).
    once(s, PAIR_NAME);
    once(s, PAIR_ID);
    const paired = (data, beforeProfile) => {
        const clean = { profile: { manager: data.manager ?? beforeProfile.manager, managerId: data.managerId ?? beforeProfile.managerId } };
        new Function('data', 'before', 'clean', 'sameValue', `${PAIR_NAME.trim()}\n${PAIR_ID.trim()}`)(data, { profile: beforeProfile }, clean, sameValue);
        return clean.profile;
    };
    const linked = { manager: 'Bob Russell', managerId: 'usr_bob' };
    assert.deepEqual(paired({ id: 'usr_tess', manager: 'Jo Admin' }, linked), { manager: 'Jo Admin', managerId: null },
        'REGRESSION: a name changed alone keeps the old id — every reader names the old manager (a page loaded before §0.212)');
    assert.deepEqual(paired({ id: 'usr_tess', managerId: 'usr_jo' }, linked), { manager: null, managerId: 'usr_jo' },
        "REGRESSION: an id changed alone keeps the old name — read once that member is removed");
    assert.deepEqual(paired({ id: 'usr_tess', manager: 'Bob Russell' }, linked), linked, 'the name sent as it stands unlinks nothing');
    assert.deepEqual(paired({ id: 'usr_tess', manager: 'Jo Admin', managerId: 'usr_jo' }, linked), { manager: 'Jo Admin', managerId: 'usr_jo' }, 'both: as sent');
    assert.deepEqual(paired({ id: 'usr_tess', phone: '2' }, linked), linked, 'neither: as stored');
});

test('S14 (P14) a restore clears a member\'s manager that names no member of this org, or the member themselves — the name kept, the rest as before; with no members read it looks at none', () => {
    const members = new Map([['usr_bob', 'usr_bob'], ['usr_tess', 'usr_tess']]);
    const teams = new Map([['team_east', 'team_east']]), reports = new Map();
    const p = (managerId) => ({ teamId: 'team_east', manager: 'Bob Russell', managerId });
    assert.deepEqual(memberLinksCleared(p('usr_gone'), teams, reports, members, 'usr_tess'), { patch: { managerId: null }, cleared: 1 },
        "REGRESSION: a restored member's unknown manager is kept");
    assert.deepEqual(memberLinksCleared(p('usr_bob'), teams, reports, members, 'usr_tess'), { patch: {}, cleared: 0 }, 'a member of this org is kept');
    assert.deepEqual(memberLinksCleared(p('usr_tess'), teams, reports, members, 'usr_tess'), { patch: { managerId: null }, cleared: 1 },
        'REGRESSION: a member restored as their own manager is kept');
    assert.deepEqual(memberLinksCleared(p(7), teams, reports, members, 'usr_tess'), { patch: { managerId: null }, cleared: 1 }, 'no text names no member');
    assert.deepEqual(memberLinksCleared(p(''), teams, reports, members, 'usr_tess'), { patch: {}, cleared: 0 }, 'an empty manager names nothing');
    assert.deepEqual(memberLinksCleared(p('usr_gone'), teams, reports), { patch: {}, cleared: 0 }, 'with no members read, as before §0.212');
    assert.deepEqual(memberLinksCleared({ teamId: 'team_gone', managerId: 'usr_gone' }, teams, reports, members, 'usr_tess'), { patch: { teamId: null, managerId: null }, cleared: 2 });
});

test('S15 (P14) the readers name the manager as the org names them now — the member the id names, else the stored name — and a pick sets both; a manager the box does not offer shows by the id why (S8 has the names)', () => {
    const BOB2 = { ...BOB, name: 'Robert Russell' };   // Bob renamed since
    const roster = [TESS, BOB2, JO, KAREN, DEE, IVY];
    assert.equal(managerNameOf({ manager: 'Bob Russell', managerId: 'usr_bob' }, roster), 'Robert Russell', 'REGRESSION: the stale stored name over the id\'s');
    assert.equal(managerNameOf({ manager: 'Bob Russell', managerId: 'usr_gone' }, roster), 'Bob Russell', 'a manager no longer a member: the stored name');
    assert.equal(managerNameOf({ manager: 'Bob Russell' }, roster), 'Bob Russell', 'a row from before §0.212 reads as before');
    assert.equal(managerNameOf({}, roster), null);
    assert.equal(managerNameOf(null, roster), null);
    assert.equal(managerNameOf({ managerId: 'usr_bob' }, undefined), null);
    const opts = managerOptions(USERS, 'usr_tess');
    assert.deepEqual(managerPicked(opts, 'usr_jo'), { manager: 'Jo Admin', managerId: 'usr_jo' }, 'REGRESSION: a member picked by name, not id');
    assert.deepEqual(managerPicked(opts, ''), { manager: '', managerId: '' }, 'none clears both');
    assert.deepEqual(managerPicked(opts, 'usr_karen'), { manager: '', managerId: '' }, 'one the box does not offer is no pick');
    const held = (managerId, manager, selfId = 'usr_tess') => heldManager({ managerId, manager }, managerOptions(USERS, selfId), USERS, selfId);
    assert.equal(held('usr_bob', 'Old Name'), null, 'offered: no words');
    assert.equal(held('usr_karen', 'Karen Rep'), 'Karen Rep (Sales Rep)');
    assert.equal(held('usr_dee', 'x'), 'Dee Gone (deactivated)', "by the id: the member's name now");
    assert.equal(held('usr_ivy', 'Ivy Invited'), 'Ivy Invited (invited, not yet joined)');
    assert.equal(held('usr_tess', 'Tess Undoer'), 'Tess Undoer (this member)');
    assert.equal(held('usr_gone', 'Old Name'), 'Old Name (no longer a member)', 'REGRESSION: an id no member holds reads as none');
    assert.equal(held('usr_gone', ''), 'Former member', 'an id no member holds, stored with no name: the house word (documentPeople.js)');
    assert.equal(held('usr_dee', 'Old Name'), 'Dee Gone (deactivated)', "REGRESSION: a held manager by id shows the stored name, not the member's now");
    // The three readers, pinned and — the export's line — run.
    const s = code(read(UD));
    once(s, ind(28, "{roleLabel(user.role)} · {user.team || '—'} · reports to {managerNameOf(user, settings.users) || '—'}"), 'REGRESSION: the band reports to the stored name');
    once(s, ind(12, 'manager: managerNameOf(u, settings.users),'), 'REGRESSION: the Users list reads the stored name');
    const EXPORT = ind(16, "if (f === 'Manager') return `\"${managerNameOf(u, users)||''}\"`;");
    once(s, EXPORT, 'REGRESSION: the export names the manager by the stored name');
    const cell = new Function('f', 'u', 'users', 'managerNameOf', `${EXPORT.trim()} return null;`);
    assert.equal(cell('Manager', { manager: 'Bob Russell', managerId: 'usr_bob' }, roster, managerNameOf), '"Robert Russell"');
    assert.equal(cell('Manager', {}, roster, managerNameOf), '""');
});

test('S16 (P14, D15) the Manager box is a type-ahead of one pick at module scope — the shared matcher with its count, a portaled list, Escape marked handled, the chip\'s × clearing the pick', () => {
    const s = code(read(UD));
    const box = between(s, 'const MemberTypeahead = ', '\n};');
    assert.ok(s.indexOf('const MemberTypeahead = ') < s.indexOf('const UserProfilePage = '), 'declared at module scope, before the page that draws it');
    once(box, 'const MemberTypeahead = ({ options, chosenName, held, onPick, inputStyle, placeholder }) => {');
    once(box, ind(4, 'const { shown, more } = peopleMatching(options, query);'), 'the shared matcher (the search guard holds its "N more" line)');
    // Placed from the field, closed by a scroll or a resize but not by its own scrollbar or its field's own scroll, a press
    // in it keeping the focus.
    once(box, ind(8, 'if (r) setPos({ ...popoverPlacement(r, { width: r.width, height: 220 }), width: r.width });'), 'placed from the field\'s rect');
    once(box, ind(8, "window.addEventListener('scroll', close, true);"), 'REGRESSION: a scroll leaves the list where the field was');
    once(box, ind(8, "window.addEventListener('resize', close);"));
    once(box, ind(8, 'const close = (e) => { if (e && e.target instanceof Node && (e.target === fieldRef.current || (listRef.current && listRef.current.contains(e.target)))) return; setOpen(false); };'),
        "its own scrollbar and its field's own scroll keep it open — and a resize, whose target is the window, is checked for a node first (REGRESSION: it threw and left the list open; tests/resize-targets.test.mjs)");
    once(box, ind(16, '<div ref={listRef} onMouseDown={e => e.preventDefault()}'), 'a press in the list keeps the focus in the field');
    once(box, ind(24, "<div style={{ padding:'8px 10px', fontSize:12, color:T.inkMuted, fontStyle:'italic', fontFamily:T.sans }}>No Admin or Manager matches.</div>"), 'the words when no one matches');
    // A pick swaps the field for the chip: the focus goes to its ×, and × back to the field (the review).
    once(box, ind(4, "const pick = (id) => { onPick(id); setQuery(''); setOpen(false); setRefocusChip(true); };"), 'REGRESSION: a pick drops the focus to the page');
    once(box, ind(8, 'if (refocusChip && chipRef.current) { chipRef.current.focus(); setRefocusChip(false); }'));
    once(box, ind(20, "else if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false); }"), "REGRESSION: the box's Escape left unmarked — App's own Escape acts on it too");
    once(box, ind(20, "if (e.key === 'Enter' && open && shown[0]) { e.preventDefault(); pick(shown[0].id); }"));
    once(box, ind(12, '{open && pos && createPortal('), 'the list portaled — no ancestor clips or traps it');
    assert.ok(box.includes("position:'fixed'"), 'and fixed, from the field');
    once(box, ind(12, "<button ref={chipRef} type=\"button\" onClick={() => { setRefocus(true); onPick(''); }} title={`Remove ${chosenName || 'the manager'}`}"),
        "REGRESSION: the chip's × clears nothing");
    once(box, ind(4, 'if (chosenName || held) return ('), 'a chosen or held manager shows as a chip');
    once(box, ind(12, "<span style={{ color: held ? T.inkMuted : T.ink, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{held || chosenName}</span>"),
        'held words greyed — no new colour');
});

test('the suites: this file is graded by the harness', () => {
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/member-profile-save.test.mjs'), 'SUITES runs this file');
});
