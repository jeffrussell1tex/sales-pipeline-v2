// §0.168 (Jeff: "fix all 3") — the three things §0.167 found on the people
// pages. (1) An invited member joined on no team's list: a membership is the
// member's id in the team's `repIds`, the team's id in the member's `teamId` and
// its name in `team`, and the invite path wrote the name alone. (2) The Seat
// usage page and the Users rail were a billing mockup — a plan, a per-seat price
// and a 50-seat cap that exist nowhere; the one real limit is Clerk's membership
// limit for the organization. (3) "Change password" linked to a fixed
// https://accounts.clerk.dev, neither instance's account page. And a fourth,
// found on the way (Jeff: "please fix it"): a team changed on the profile kept
// the member's old teamId.
//
// Run here: the REAL membership rules (src/utils/teamMembership.js) and the
// invitation a row becomes. Scanned: the screens, the handler and the server,
// for the wiring tests/integration/invitations.itest.mjs proves end to end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { teamIdNamed, teamsWithMembers, teamsWithout } from '../src/utils/teamMembership.js';
import { inviteFrom } from '../src/utils/userImport.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const code = (src) => src.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');
const between = (s, start, end) => {
    const a = s.indexOf(start);
    assert.ok(a >= 0, `missing: ${start}`);
    const b = s.indexOf(end, a + start.length);
    assert.ok(b > a, `no end after: ${start}`);
    return s.slice(a, b + end.length);
};

const EAST = { id: 'team_east', name: 'East', managerId: 'usr_m', repIds: ['usr_a'] };
const WEST = { id: 'team_west', name: 'West', repIds: [] };
const TEAMS = [EAST, WEST, 'Legacy'];

test('teamIdNamed: the id of the team of that exact name — none for an unknown name or an old plain-string team', () => {
    assert.equal(teamIdNamed(TEAMS, 'East'), 'team_east');
    assert.equal(teamIdNamed(TEAMS, 'West'), 'team_west');
    assert.equal(teamIdNamed(TEAMS, 'east'), null, 'exact — the screens offer the names, the import matches the spelling first');
    assert.equal(teamIdNamed(TEAMS, 'Legacy'), null, 'a plain-string team has no id and no list');
    assert.equal(teamIdNamed(TEAMS, 'North'), null);
    assert.equal(teamIdNamed(TEAMS, ''), null);
    assert.equal(teamIdNamed(undefined, 'East'), null);
});

test('teamsWithMembers: each member joins the list of the team its teamId names — once, and nothing else changes', () => {
    const { teams, changed } = teamsWithMembers(TEAMS, [
        { id: 'usr_b', teamId: 'team_east' },
        { id: 'usr_c', teamId: 'team_west' },
        { id: 'usr_c', teamId: 'team_west' },          // the same row twice
        { id: 'usr_a', teamId: 'team_east' },          // already listed
        { id: 'usr_d', teamId: 'team_gone' },          // names no team
        { id: 'usr_e', teamId: null },                 // no team
        { teamId: 'team_east' },                       // no id
    ]);
    assert.equal(changed, true);
    assert.deepEqual(teams[0].repIds, ['usr_a', 'usr_b'], 'REGRESSION: an invited member is on no team\'s list');
    assert.deepEqual(teams[1].repIds, ['usr_c']);
    assert.equal(teams[2], 'Legacy');
    assert.equal(teams[0].managerId, 'usr_m', 'the rest of the team is kept');
    assert.deepEqual(EAST.repIds, ['usr_a'], 'the teams handed in are not changed in place');
    const none = teamsWithMembers(TEAMS, [{ id: 'usr_a', teamId: 'team_east' }]);
    assert.equal(none.changed, false, 'nothing to save');
    assert.equal(none.teams[0], EAST, 'an untouched team is the same object');
    assert.deepEqual(teamsWithMembers(undefined, [{ id: 'x', teamId: 'team_east' }]), { teams: [], changed: false });
});

test('teamsWithout: a revoked invitation\'s id leaves every list it is on', () => {
    const teams = [{ id: 't1', repIds: ['a', 'b'] }, { id: 't2', repIds: ['b'] }, { id: 't3', repIds: ['c'] }, 'Legacy'];
    const out = teamsWithout(teams, 'b');
    assert.equal(out.changed, true);
    assert.deepEqual(out.teams.map((t) => (typeof t === 'string' ? t : t.repIds)), [['a'], [], ['c'], 'Legacy']);
    assert.equal(out.teams[2], teams[2], 'an untouched team is the same object');
    assert.equal(teamsWithout(teams, 'z').changed, false);
    assert.equal(teamsWithout(teams, null).changed, false);
});

test('an imported row carries its team\'s id with its name', () => {
    assert.equal(inviteFrom({ email: 'a@x.test', team: 'east' }, { teams: TEAMS }).teamId, 'team_east');
    assert.equal(inviteFrom({ email: 'a@x.test', team: 'Legacy' }, { teams: TEAMS }).teamId, null);
    assert.equal(inviteFrom({ email: 'a@x.test' }, { teams: TEAMS }).teamId, null);
});

test('the Invite page sends the team\'s id and adds the new members to their teams\' lists — a failed save is said', () => {
    const s = code(read('src/Tabs/settings/people/UsersDetail.jsx'));
    const page = between(s, 'const UsersInvitePage = ', '\nconst UsersExportPage = ');
    assert.ok(page.includes('teamId: teamIdNamed(settings.teams, r.team)'), 'REGRESSION: the invite stores the team\'s name alone');
    assert.ok(page.includes('const { teams: joinedTeams, changed: teamsChanged } = teamsWithMembers(settings.teams, sent);'));
    assert.ok(page.includes("const rt = await dbWrite('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ teams: joinedTeams }) });"));
    assert.ok(page.includes('if (teamNote) throw new Error('), 'a team list that did not save is said, not dropped');
});

test('the import adds its new members to their teams\' lists after the last request — a failed save is a warning', () => {
    const l = code(read('src/components/layout/ModalLayer.jsx'));
    const h = between(l, 'onImportUsers={async (invites) => {', 'return { receipt, refusals, warning };');
    assert.ok(h.includes('landed.push(...sent);'));
    assert.ok(h.includes('teamsWithMembers(settings.teams, landed)'), 'REGRESSION: an imported member is on no team\'s list');
    assert.ok(h.includes("dbWrite('/.netlify/functions/settings', { method: 'PUT', body: JSON.stringify({ teams: joinedTeams }) })"));
    const m = code(read('src/components/modals/CsvImportModal.jsx'));
    assert.ok(m.includes('setImportWarning(sent?.warning || null);'));
    assert.ok(m.includes('{isUsers && importWarning && ('), 'the warning is on the results');
});

test('a team changed on the profile moves the member\'s teamId with the name — on every save', () => {
    const s = code(read('src/Tabs/settings/people/UsersDetail.jsx'));
    const profile = between(s, 'const UserProfilePage = ', 'export const UsersDetail = ');
    assert.ok(profile.includes('const toSave = { ...form, teamId: teamIdNamed(settings.teams, form.team) };'),
        'REGRESSION: a new team keeps the old teamId — coaching notes and the digest read it');
    assert.ok(!profile.includes('form.team !== user.team'), 'never compared with the page\'s first copy of the member — an id already wrong would be kept');
    assert.ok(profile.includes('body:JSON.stringify(toSave) });'));
    assert.ok(!profile.includes('body:JSON.stringify(form) });'), 'the form as loaded is not what is saved');
    assert.ok(profile.includes('users: (prev.users||[]).map(u => u.id === toSave.id ? { ...u, ...toSave } : u),'), 'and the roster on screen holds what was saved');
});

test('every revoke takes the row off the roster and off its team\'s list', () => {
    const s = code(read('src/Tabs/settings/people/UsersDetail.jsx'));
    const drop = between(s, 'const dropRevokedRow = async (removedRowId, teams, setSettings) => {', '\n};');
    assert.ok(drop.includes('teamsWithout(teams, removedRowId)'));
    assert.ok(drop.includes("dbWrite('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ teams: remaining }) })"));
    assert.equal((s.match(/await dropRevokedRow\(r\.removedRowId, settings\.teams, (_setSettings|setSettings)\)/g) || []).length, 3,
        'REGRESSION: a revoke site leaves the id on its team\'s list (the Pending page, the profile, the row menu)');
    assert.ok(!/if \(r\.removedRowId\) (_setSettings|setSettings)\(/.test(s), 'no revoke site drops the row on its own');
});

test('the server: an invitation\'s row carries the team\'s id; GET ?seats=true is Clerk\'s limit and count, an Admin\'s', () => {
    const u = code(read('netlify/functions/users.mjs'));
    assert.ok(u.includes("teamId:    (typeof invite.teamId === 'string' && invite.teamId) ? invite.teamId : null,"));
    const seats = between(u, "if (event.httpMethod === 'GET' && event.queryStringParameters?.seats === 'true') {", "'Could not read the membership limit from Clerk.' }) };");
    assert.ok(seats.includes("if (userRole !== 'Admin') {"), 'an Admin\'s');
    assert.ok(seats.includes('clerk.organizations.getOrganization({ organizationId: orgId, includeMembersCount: true })'), 'the caller\'s org, with its count');
    assert.ok(seats.includes('limit: count(org?.maxAllowedMemberships), members: count(org?.membersCount), pendingInvitations: pending.length'));
    assert.ok(seats.includes('statusCode: 502'), 'a read Clerk refuses is said, not guessed');
});

test('Seat usage is Clerk\'s limit: no plan, price, cap or button that is not real', () => {
    const s = code(read('src/Tabs/settings/people/UsersDetail.jsx'));
    const page = between(s, 'const UsersSeatPage = ', '\nconst UsersSecurityPage = ');
    for (const dead of ['$39', 'Business plan', 'Soft cap', 'Overage policy', 'Per-seat price', 'Add seats', 'Manage plan', 'onClick={() => {}}']) {
        assert.ok(!page.includes(dead), `REGRESSION: "${dead}" is back on Seat usage — there is no plan and no billing`);
    }
    assert.ok(!/const cap\s*=/.test(page), 'REGRESSION: an invented seat cap is back');
    assert.ok(page.includes('const limit   = Number.isFinite(seats?.limit) ? seats.limit : null;'));
    assert.ok(page.includes('const inClerk = Number.isFinite(seats?.members) ? seats.members : null;'));
    assert.ok(page.includes("'Unknown — could not read Clerk'"), 'a failed read says so');
    const main = between(s, 'export const UsersDetail = ', '\n};');
    assert.ok(!/const cap\s*=/.test(main), 'REGRESSION: the Users rail has a seat cap of its own again');
    assert.ok(main.includes("const res = await dbFetch('/.netlify/functions/users?seats=true');"));
    assert.ok(main.includes('const seatPct      = limit > 0 && inClerk !== null ? Math.round((inClerk / limit) * 100) : null;'));
    assert.ok(main.includes('seats={seats} seatsFailed={seatsFailed}'));
});

test('Change password opens Clerk\'s own profile screen, not a fixed address', () => {
    const h = code(read('src/components/layout/AppHeader.jsx'));
    assert.ok(!h.includes('href="https://accounts.clerk.dev"'), 'REGRESSION: the password link goes to a fixed accounts.clerk.dev again');
    assert.ok(h.includes("import { OrganizationSwitcher, useOrganizationList, useClerk } from '@clerk/clerk-react';"));
    assert.ok(h.includes('const { openUserProfile } = useClerk();'));
    assert.ok(h.includes('onClick={() => { setShowProfilePanel(false); openUserProfile(); }}'), 'the panel closes first, so nothing of ours sits over Clerk\'s screen');
});
