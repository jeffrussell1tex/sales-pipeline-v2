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
import { teamIdNamed, teamsWithMembers } from '../src/utils/teamMembership.js';
// Since §0.222 (batch 4b-3, step C): a team is one record.
import {
    teamNamesOf, teamPaired, teamRenames, teamNameRefused, teamNameTaken, TEAM_NAME_LONG, namesMember, holdsMember, withoutMember,
    teamSaveMembers, rosterAfterTeamSave, settingsAfterRemoval, removalNote, REMOVAL_LISTS_LEFT,
} from '../src/utils/teamMembership.js';
import { clause } from '../src/utils/memberSave.js';
import { parse } from '@babel/parser';
import { inviteFrom } from '../src/utils/userImport.js';
// Since §0.225 (batch 4b-3, step B-2): a teams save names the token its list was read with.
import { revsAfter, listChanged, STALE_ERROR } from '../src/utils/settingsRevs.js';

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



test('an imported row carries its team\'s id with its name', () => {
    assert.equal(inviteFrom({ email: 'a@x.test', team: 'east' }, { teams: TEAMS }).teamId, 'team_east');
    assert.equal(inviteFrom({ email: 'a@x.test', team: 'Legacy' }, { teams: TEAMS }).teamId, null);
    assert.equal(inviteFrom({ email: 'a@x.test' }, { teams: TEAMS }).teamId, null);
});

test('the Invite page sends the team\'s id and adds the new members to their teams\' lists — a failed save is said', () => {
    const s = code(read('src/Tabs/settings/people/UsersDetail.jsx'));
    const page = between(s, 'const UsersInvitePage = ', '\nconst UsersExportPage = ');
    assert.ok(page.includes('teamId: teamIdNamed(settings.teams, r.team)'), 'REGRESSION: the invite stores the team\'s name alone');
    // With the list's token as the page loaded it (state §0.225, J-B6): a list another tab saved since is read again and
    // the members added to it once more (saveSettings.js addToSettingsList); a second refusal is said in Jeff's words.
    assert.ok(page.includes("const added = await addToSettingsList('teams', (l) => teamsWithMembers(l, sent), { list: settings.teams, rev: settings.revs?.teams ?? null, setSettings });"));
    assert.ok(page.includes("if (!added.ok) teamNote = added.twice ? ` ${TEAMS_CHANGED_TWICE}` : ` The team list was not updated — ${added.error}`;"),
        'REGRESSION: a list refused twice is said as a failed save, or not said');
    assert.ok(page.includes('if (teamNote) throw new Error('), 'a team list that did not save is said, not dropped');
});

test('the import adds its new members to their teams\' lists after the last request — a failed save is a warning', () => {
    const l = code(read('src/components/layout/ModalLayer.jsx'));
    const h = between(l, 'onImportUsers={async (invites) => {', 'return { receipt, refusals, warning };');
    assert.ok(h.includes('landed.push(...sent);'));
    assert.ok(h.includes("const added = await addToSettingsList('teams', (l) => teamsWithMembers(l, landed), { list: settings.teams, rev: settings.revs?.teams ?? null, setSettings });"),
        'REGRESSION: an imported member is on no team\'s list');
    // A second stale refusal is the import's whole warning (state §0.225, J-B6).
    assert.ok(h.includes('if (added.twice) warning = TEAMS_CHANGED_TWICE;'), 'REGRESSION: a list refused twice is said as a failed save, or not said');
    const m = code(read('src/components/modals/CsvImportModal.jsx'));
    assert.ok(m.includes('setImportWarning(sent?.warning || null);'));
    assert.ok(m.includes('{isUsers && importWarning && ('), 'the warning is on the results');
});

test('a team changed on the profile is picked by its id and sent with its name — only when the Team box changed (state §0.211; §0.168\'s every-save derive moved and cleared valid teams)', () => {
    const s = code(read('src/Tabs/settings/people/UsersDetail.jsx'));
    const profile = between(s, 'const UserProfilePage = ', 'export const UsersDetail = ');
    // §0.168 derived the team's id from the box's NAME on every save: the first team of that name answered, so a
    // member of a second "East" was moved onto the first, and a member whose team was renamed since lost a valid id.
    assert.ok(!profile.includes('teamIdNamed('), 'REGRESSION: the team is derived from its name on every save — moved to the first team of the name, or cleared');
    assert.ok(profile.includes("<select style={sel} value={teamHeld ? HELD_TEAM : (form.teamId || '')} onChange={e=>pickTeam(e.target.value)}>"), 'the Team box picks a team by its id');
    assert.ok(profile.includes('{teamOpts.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}'));
    assert.ok(profile.includes('    const pickTeam = (id) => setForm(prev => ({ ...prev, ...teamPicked(teamOpts, id) }));'),
        'REGRESSION: a new team keeps the old teamId — its name and its id are set together (memberPickers.js teamPicked)');
    assert.ok(profile.includes("if ('teamId' in changes) move = { teamId: row.teamId || null };"), 'the lists move only on a team change, to the team as stored');
    assert.ok(profile.includes('teamsWithMemberOn(settings.teams, user.id, move.teamId)'), 'by id — never every team of either name');
    assert.ok(profile.includes('body:JSON.stringify(toSave) });'));
    assert.ok(!profile.includes('body:JSON.stringify(form) });'), 'the form as loaded is not what is saved');
    assert.ok(profile.includes('...(row ? { users: (prev.users||[]).map(u => u.id === row.id ? { ...u, ...row } : u) } : {}),'), 'and the roster on screen holds the row as stored');
});

// Since §0.222 the server takes a removed member's ids off the org's lists in the same request and answers them; every
// screen that removes a member — the three revokes, the two deletes, the app's own delete handler — applies the answer
// (the row off the roster, the lists as written) and only while the org that asked is still on screen.
// Each site is read inside ITS OWN handler (the nearest async function around the call — the review, 2 Nov: a search of
// the whole file let another handler's org check stand in for a site's own).
const removalSites = (file) => {
    const src = read(file).replace(/\r\n/g, '\n');
    const out = [];
    const visit = (node, anc) => {
        if (!node || typeof node.type !== 'string') return;
        if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'settingsAfterRemoval') {
            const fn = [...anc].reverse().find((n) => isFnNode(n) && n.async);
            assert.ok(fn, `${file}: a removal outside an async handler`);
            out.push({ file, call: src.slice(node.start, node.end), body: code(src.slice(fn.start, fn.end)) });
        }
        for (const k of Object.keys(node)) {
            if (k === 'loc' || k === 'start' || k === 'end' || k === 'extra') continue;
            const v = node[k];
            if (Array.isArray(v)) v.forEach((c) => visit(c, [...anc, node]));
            else if (v && typeof v.type === 'string') visit(v, [...anc, node]);
        }
    };
    visit(parse(src, { sourceType: 'module', plugins: ['jsx'] }).program, []);
    return out;
};
test('THE CLASS — every removal applies the server\'s lists inside its own handler: the org asked before its request, checked after its last answer, the lists-left note said; no screen writes a list of its own', () => {
    const s = code(read('src/Tabs/settings/people/UsersDetail.jsx'));
    const sites = [...removalSites('src/Tabs/settings/people/UsersDetail.jsx'), ...removalSites('src/hooks/useUserHandlers.js')];
    assert.equal(sites.length, 6, 'the Pending page\'s, the profile page\'s and the row menu\'s revoke; the profile page\'s, the row menu\'s and the app\'s delete');
    for (const { file, call, body } of sites) {
        const at = body.indexOf(call);
        const asked = body.indexOf('const askedOrg = requestOrg();');
        assert.ok(asked >= 0 && asked < body.indexOf('await '), `REGRESSION: no org asked before the request — ${file}: ${call}`);
        const before = body.slice(0, at);
        assert.ok(before.lastIndexOf('if (!stillOrg(askedOrg)) return;') > before.lastIndexOf('await '), `REGRESSION: an answer after an org switch reaches this org's copy — ${file}: ${call}`);
        const answer = call.match(/, (\w+)\)$/)[1];
        const after = body.slice(at);
        assert.ok(after.includes(`removalNote(${answer})`), `REGRESSION: the lists-left note is not said — ${file}: ${call}`);
        assert.match(after, /\b(setActionError|setUserActionError|onRemoved|console\.error)\(/, `the note goes somewhere it is read — ${file}`);
    }
    assert.ok(!s.includes('dropRevokedRow') && !s.includes('teamsWithout'), 'REGRESSION: a revoke writes the team list of its own');
    assert.ok(s.includes("onRemoved={(note) => { setUserActionError(note || ''); onUsers(); }}"), 'the profile page leaves a removed member\'s page for the list, saying the note there');
    assert.equal((s.match(/= await revokeInvite\(/g) || []).length, 3, 'three revokes');
});

test('the server: an invitation\'s row carries the team\'s id; GET ?seats=true is Clerk\'s limit and count, an Admin\'s', () => {
    const u = code(read('netlify/functions/users.mjs'));
    // The team only when the batch's one read found it (state §0.205): a row removed mid-batch stores no unchecked team.
    assert.ok(u.includes("teamId:    (typeof invite.teamId === 'string' && liveTeams.has(invite.teamId)) ? invite.teamId : null,"));
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

// ── §0.222 — a team is one record (batch 4b-3, step C; Jeff, 2 Nov: "Start please", every answer the Recommended —
// docs/design/links-batch-4b3/STEP-C.md). The REAL rules run; TeamModal's handleSave runs as written. ───────────────

const listed = (map) => (id) => map[id];

test('C1 teamNamesOf: each team\'s name by its id — the first named entry of an id, no name or no text id none', () => {
    const names = teamNamesOf([{ id: 't1', name: 'East' }, { id: 't1', name: 'Again' }, { id: 't2', name: '  ' }, { id: 't2', name: 'West' },
        { id: '', name: 'Blank' }, { id: 3, name: 'Num' }, 'Legacy', null, { id: 't4' }]);
    assert.deepEqual([...names], [['t1', 'East'], ['t2', 'West']]);
    assert.equal(teamNamesOf('not a list').size, 0);
    assert.equal(teamNamesOf(undefined).size, 0);
});

test('C1 teamPaired: a team id stores the list\'s name; a name alone unlinks; a blank id keeps a name sent with it (N5) — never a team by id and another by name', () => {
    const nameOf = listed({ t_east: 'East', t_west: 'West' });
    const stored = { team: 'East', teamId: 't_east' };
    assert.equal(teamPaired({ phone: '2' }, stored, nameOf), null, 'a save naming neither changes neither');
    assert.equal(teamPaired(null, stored, nameOf), null);
    assert.deepEqual(teamPaired({ teamId: 't_west' }, stored, nameOf), { team: 'West', teamId: 't_west' }, 'REGRESSION: an id sent alone keeps the old name');
    assert.deepEqual(teamPaired({ teamId: 't_west', team: 'East (old tab)' }, stored, nameOf), { team: 'West', teamId: 't_west' }, 'the list\'s name, not the one sent');
    assert.deepEqual(teamPaired({ teamId: 't_east', team: 'East' }, stored, nameOf), { team: 'East', teamId: 't_east' });
    // A held id whose team was deleted since: the name sent, else the one stored.
    assert.deepEqual(teamPaired({ teamId: 't_gone', team: 'Gone' }, { team: 'Old', teamId: 't_gone' }, nameOf), { team: 'Gone', teamId: 't_gone' });
    assert.deepEqual(teamPaired({ teamId: 't_gone' }, { team: 'Old', teamId: 't_gone' }, nameOf), { team: 'Old', teamId: 't_gone' });
    assert.deepEqual(teamPaired({ teamId: 't_gone' }, null, nameOf), { team: null, teamId: 't_gone' }, 'a new member: nothing stored');
    // A blank id: a name sent with it is kept, linked to no team (an old tab, an import's row); with no name, both clear.
    assert.deepEqual(teamPaired({ teamId: null, team: 'East' }, stored, nameOf), { team: 'East', teamId: null }, 'REGRESSION: a name sent with no id is dropped');
    assert.deepEqual(teamPaired({ teamId: '', team: 'East' }, null, nameOf), { team: 'East', teamId: null });
    assert.deepEqual(teamPaired({ teamId: '', team: '' }, stored, nameOf), { team: null, teamId: null }, 'the Teams page\'s leave and Delete clear both');
    assert.deepEqual(teamPaired({ teamId: null }, stored, nameOf), { team: null, teamId: null });
    // A name sent alone.
    assert.equal(teamPaired({ team: 'East' }, stored, nameOf), null, 'the same name: nothing to pair');
    assert.equal(teamPaired({ team: '' }, { team: null, teamId: null }, nameOf), null, '\'\' and none are one value');
    assert.deepEqual(teamPaired({ team: 'West' }, stored, nameOf), { team: 'West', teamId: null }, 'REGRESSION: a name alone leaves the old id — on two teams at once');
    assert.deepEqual(teamPaired({ team: '' }, stored, nameOf), { team: null, teamId: null });
    // An id that is no text is never looked up (the team check refuses it after).
    let asked = 0;
    assert.deepEqual(teamPaired({ teamId: 7, team: 'X' }, stored, () => { asked++; return 'East'; }), { team: 'X', teamId: 7 });
    assert.equal(asked, 0);
});

test('C1 teamRenames: an entry the stored list holds, under another name — not a new team, not a blank name', () => {
    const stored = [{ id: 'a', name: 'East' }, { id: 'b', name: 'West' }, { id: 'c', name: 'North' }];
    assert.deepEqual(teamRenames([{ id: 'a', name: 'Atlantic' }, { id: 'b', name: 'West' }, { id: 'c', name: '' }, { id: 'd', name: 'New' }], stored),
        [{ id: 'a', name: 'Atlantic' }]);
    assert.deepEqual(teamRenames([{ id: 'a', name: 'East ' }], stored), [{ id: 'a', name: 'East ' }], 'exactly as written — the list and the members read one text');
    assert.deepEqual(teamRenames(null, stored), []);
    assert.deepEqual(teamRenames([{ id: 'a', name: 'X' }], 'no list'), []);
});

test('C2 teamNameRefused: no NEW team of a name another has — by repeats, case and spaces aside; a stored pair stands; the words', () => {
    const QA = [{ id: 'e1', name: 'East' }, { id: 'e2', name: 'East' }, { id: 'w', name: 'West' }];
    assert.equal(teamNameRefused(QA, QA), null, 'Accelerep QA\'s stored pair re-saved');
    assert.equal(teamNameRefused([...QA, { id: 'n', name: 'North' }], QA), null, 'a new team of a free name');
    const third = teamNameRefused([...QA, { id: 'e3', name: ' east ' }], QA);
    assert.deepEqual(third, { status: 400, error: teamNameTaken('East'), field: 'teams' }, 'REGRESSION: a third East is made');
    assert.equal(third.error, 'A team named "East" already exists — choose a different name.');
    assert.equal(clause(third.error) + '.', third.error, 'one full stop — the profile page\'s clause reads it whole');
    const stored = [{ id: 'a', name: 'North East' }, { id: 'b', name: 'West' }];
    assert.ok(teamNameRefused([...stored, { id: 'c', name: 'north   EAST' }], stored), 'REGRESSION: "North  East" and "north east" are two teams every screen draws alike');
    assert.ok(teamNameRefused([{ id: 'a', name: 'West' }, { id: 'b', name: 'West' }], stored), 'a rename onto another team\'s name');
    assert.equal(teamNameRefused([{ id: 'a', name: 'West' }, { id: 'b', name: 'North East' }], stored), null, 'a swap');
    assert.equal(teamNameRefused([{ id: 'a', name: 'Atlantic' }, { id: 'b', name: 'West' }], stored), null, 'REGRESSION: a rename to a free name is refused (counting totals, not repeats)');
    assert.equal(teamNameRefused([{ id: 'b', name: 'West' }], stored), null, 'a delete');
    assert.ok(teamNameRefused(['West', { id: 'b', name: 'West' }], []), 'an old plain-string entry counts by its text');
    assert.equal(teamNameRefused([{ id: 'a', name: '' }, { id: 'b', name: '  ' }, { id: 'c' }], []), null, 'blank names count none');
    assert.equal(teamNameRefused('not a list', []), null);
    assert.equal(teamNameRefused(null, QA), null);
    const long = 'L'.repeat(256);
    assert.deepEqual(teamNameRefused([{ id: 'x', name: long }], []), { status: 400, error: TEAM_NAME_LONG, field: 'teams' },
        'REGRESSION: a name a member\'s team cannot hold — the rename\'s write rolls the save back as a 500');
    assert.equal(teamNameRefused([{ id: 'x', name: long }], [{ id: 'x', name: long }]), null, 'a long name stored before stands');
    assert.equal(teamNameRefused([{ id: 'x', name: 'L'.repeat(255) }], []), null, '255 fits');
});

test('C4 namesMember / holdsMember / withoutMember: by app id, or by the Clerk id a list held — READ ONLY, a stored null names no one', () => {
    const pat = { id: 'usr_pat', clerkUserId: 'user_pat' }, unlinked = { id: 'usr_new', clerkUserId: null };
    assert.equal(namesMember('usr_pat', pat), true);
    assert.equal(namesMember('user_pat', pat), true, 'REGRESSION: UKG\'s team, listed by Clerk id, reads its members as off it');
    assert.equal(namesMember('user_other', pat), false);
    assert.equal(namesMember(null, unlinked), false, 'REGRESSION: a stored null matches every member with no Clerk id');
    assert.equal(namesMember('', pat), false);
    assert.equal(namesMember(undefined, { name: 'a row with no id' }), false, 'an empty entry never names a row with no id');
    assert.equal(holdsMember([undefined], { name: 'no id' }), false);
    assert.equal(holdsMember([null, 'usr_x'], unlinked), false);
    assert.equal(holdsMember(['user_pat'], pat), true);
    assert.equal(holdsMember('user_pat', pat), false, 'a list that is no list holds no one');
    assert.deepEqual(withoutMember(['usr_pat', 'user_pat', 'usr_x', null], pat), ['usr_x', null], 'off by either id');
    assert.deepEqual(withoutMember(undefined, pat), []);
});

// UKG-shaped (the count of 2 Nov, STEP-C.md §9): one team listing its members by Clerk id — 2 of them members, 2 no
// one — its manager empty, and three holders of the team's id: the two so listed and one the list does not hold.
const UKG_TEAM = { id: 'team_ukg', name: 'UKG', territory: '', vertical: '', managerId: '', repIds: ['user_a', 'user_b', 'user_x', 'user_y'], color: '#2a2622' };
const UKG_USERS = [
    { id: 'usr_a', clerkUserId: 'user_a', name: 'A', team: 'UKG', teamId: 'team_ukg', active: true, userType: 'User' },
    { id: 'usr_b', clerkUserId: 'user_b', name: 'B', team: 'UKG', teamId: 'team_ukg', active: true, userType: 'User' },
    { id: 'usr_c', clerkUserId: 'user_c', name: 'C', team: 'UKG', teamId: 'team_ukg', active: true, userType: 'User' },
    { id: 'usr_d', clerkUserId: 'user_d', name: 'D', team: '', teamId: '', active: true, userType: 'User' },
];

test('C4 teamSaveMembers: a colour change sends no one; who joins, who leaves; a rename is the server\'s; territory goes to the team (N2)', () => {
    const run = (saved, opened = UKG_TEAM) => teamSaveMembers({ opened, saved, users: UKG_USERS }).map(({ u, body }) => [u.id, body]);
    assert.deepEqual(run({ ...UKG_TEAM, color: '#4d6b3d' }), [], 'REGRESSION: a save of UKG\'s team clears its members');
    assert.deepEqual(run({ ...UKG_TEAM, name: 'UKG Renamed' }), [], 'a rename sends no member PUT — the server renames every holder');
    assert.deepEqual(run({ ...UKG_TEAM, repIds: withoutMember(UKG_TEAM.repIds, UKG_USERS[0]) }),
        [['usr_a', { id: 'usr_a', team: '', teamId: '', territory: '', vertical: '' }]], 'a member taken off, by their Clerk id, leaves');
    assert.deepEqual(run({ ...UKG_TEAM, repIds: [...UKG_TEAM.repIds, 'usr_d'] }),
        [['usr_d', { id: 'usr_d', team: 'UKG', teamId: 'team_ukg', territory: '', vertical: '' }]], 'a member ticked on joins, by app id');
    assert.deepEqual(run({ ...UKG_TEAM, repIds: [...UKG_TEAM.repIds, 'usr_c'] }), [], 'C ticked on, already holding the team: nothing to send');
    assert.deepEqual(run({ ...UKG_TEAM, territory: 'NAM' }),
        [['usr_a', { id: 'usr_a', territory: 'NAM', vertical: '' }], ['usr_b', { id: 'usr_b', territory: 'NAM', vertical: '' }]],
        'a changed territory goes to the members the list holds who are on the team (N2, as before §0.222) — not C, whom it does not hold');
    assert.deepEqual(run({ ...UKG_TEAM, id: 'team_new', name: 'New', repIds: ['usr_d'] }, null),
        [['usr_d', { id: 'usr_d', team: 'New', teamId: 'team_new', territory: '', vertical: '' }]], 'a new team clears no one');
    assert.deepEqual(run({ ...UKG_TEAM, managerId: 'usr_d', repIds: UKG_TEAM.repIds }),
        [['usr_d', { id: 'usr_d', team: 'UKG', teamId: 'team_ukg', territory: '', vertical: '' }]], 'a manager picked joins');
});

// The OLD cascade — TeamsDetail.jsx at cadb15c, :58-65 and its changed-rows filter, copied verbatim: on UKG's rows a save
// of the team with nothing changed clears all three holders (OPEN_ITEMS §4.3, High).
const OLD_CASCADE = (allUsers, id, saved, repIds, managerId) => {
    const updatedUsers = allUsers.map(u => {
        const wasInThisTeam = u.teamId === id;
        const isNowRep      = repIds.includes(u.id);
        const isNowManager  = managerId === u.id;
        if (isNowRep || isNowManager) return { ...u, team: saved.name, territory: saved.territory, vertical: saved.vertical, teamId: id };
        if (wasInThisTeam)            return { ...u, team: '', territory: '', vertical: '', teamId: '' };
        return u;
    });
    return updatedUsers.filter((u, i) => {
        const orig = allUsers[i];
        return orig && (u.team !== orig.team || u.teamId !== orig.teamId);
    });
};
test('C4 OLD: the cascade before §0.222 clears UKG\'s three holders on a save that changes nothing', () => {
    const cleared = OLD_CASCADE(UKG_USERS, UKG_TEAM.id, UKG_TEAM, UKG_TEAM.repIds, UKG_TEAM.managerId);
    assert.deepEqual(cleared.map((u) => [u.id, u.teamId]), [['usr_a', ''], ['usr_b', ''], ['usr_c', '']]);
});

test('C1 rosterAfterTeamSave: the rows the server answered; every holder of a renamed team by its new name, an inactive one too', () => {
    const users = [{ id: 'a', team: 'East', teamId: 't' }, { id: 'b', team: 'East', teamId: 't', active: false }, { id: 'c', team: 'West', teamId: 'w' }, null];
    const answered = new Map([['c', { id: 'c', team: 'North', teamId: 't', answered: true }]]);
    const out = rosterAfterTeamSave(users, answered, { id: 't', name: 'North' });
    assert.deepEqual(out.slice(0, 3), [{ id: 'a', team: 'North', teamId: 't' }, { id: 'b', team: 'North', teamId: 't', active: false }, answered.get('c')],
        'REGRESSION: an inactive member keeps the old name on screen (P26)');
    assert.equal(out[3], null);
    const same = rosterAfterTeamSave(users, new Map(), null);
    assert.equal(same[0], users[0], 'an untouched row is the same object');
});

test('C3 settingsAfterRemoval: the row off the roster, the teams and territories as written — nothing else of the answer', () => {
    const prev = { users: [{ id: 'a' }, { id: 'b' }], teams: ['old'], territories: ['old'], spiffs: ['kept'] };
    const out = settingsAfterRemoval(prev, 'a', { lists: { teams: [{ id: 't', repIds: [] }], spiffs: ['NO'] }, success: true });
    assert.deepEqual(out, { users: [{ id: 'b' }], teams: [{ id: 't', repIds: [] }], territories: ['old'], spiffs: ['kept'] });
    assert.deepEqual(settingsAfterRemoval(prev, null, {}).users, prev.users, 'a revoke that removed no row keeps every member');
    assert.deepEqual(settingsAfterRemoval(prev, 'b', { lists: null, listsLeft: true }), { ...prev, users: [{ id: 'a' }] });
    assert.equal(removalNote({ listsLeft: true }), REMOVAL_LISTS_LEFT);
    assert.equal(removalNote({ lists: {} }), null);
    assert.equal(removalNote(undefined), null);
});

test('C3b settingsAfterRemoval (state §0.225): the tokens answered for the lists it writes merged over the held ones — no other key\'s, never the held set replaced whole', () => {
    const prev = { users: [{ id: 'a' }, { id: 'b' }], teams: ['old'], territories: ['old'], revs: { teams: 'T1', territories: 'R1', spiffs: 'S1' } };
    const answer = { lists: { teams: [{ id: 't', repIds: [] }], spiffs: ['NO'] }, revs: { teams: 'T2', territories: 'R2', spiffs: 'S2' }, success: true };
    const out = settingsAfterRemoval(prev, 'a', answer);
    assert.deepEqual(out.revs, { teams: 'T2', territories: 'R1', spiffs: 'S1' },
        'REGRESSION: the written list\'s token is dropped (its next save refused as stale), or a list it did not write takes a token');
    assert.deepEqual(prev.revs, { teams: 'T1', territories: 'R1', spiffs: 'S1' }, 'the copy handed in is not changed in place');
    const both = settingsAfterRemoval(prev, 'a', { lists: { teams: [], territories: [] }, revs: { teams: 'T2', territories: 'R2', spiffs: 'S2' } });
    assert.deepEqual(both.revs, { teams: 'T2', territories: 'R2', spiffs: 'S1' });
    assert.deepEqual(settingsAfterRemoval({ users: [] }, null, { lists: { teams: [] }, revs: { teams: 'T2' } }).revs, { teams: 'T2' }, 'none held: the answered one');
    // No token answered, or none that is text: the held tokens stand as they were — C3's answers add no `revs` at all.
    assert.equal(settingsAfterRemoval(prev, 'a', { lists: { teams: [] } }).revs, prev.revs);
    assert.equal(settingsAfterRemoval(prev, 'a', { lists: { teams: [] }, revs: { teams: 7 } }).revs, prev.revs);
    assert.ok(!('revs' in settingsAfterRemoval({ users: [] }, 'a', { lists: { teams: [] }, revs: { teams: null } })));
    // The lists left as they were (a settings save landed at the same moment): no list written, no token taken.
    const left = settingsAfterRemoval(prev, 'b', { lists: null, listsLeft: true, revs: { teams: 'T9' } });
    assert.deepEqual(left, { ...prev, users: [{ id: 'a' }] });
    assert.equal(left.revs, prev.revs);
});

// ── TeamModal's handleSave, run as written (as tests/member-profile-save.test.mjs S10 runs the profile page's) ────────

const isFnNode = (n) => n && /^(ArrowFunctionExpression|FunctionExpression|FunctionDeclaration)$/.test(n.type);
const walkAst = (node, visit, parent = null, key = null) => {
    if (!node || typeof node.type !== 'string') return;
    visit(node, parent, key);
    for (const k of Object.keys(node)) {
        if (k === 'loc' || k === 'start' || k === 'end' || k === 'extra') continue;
        const v = node[k];
        if (Array.isArray(v)) v.forEach((c) => walkAst(c, visit, node, k));
        else if (v && typeof v.type === 'string') walkAst(v, visit, node, k);
    }
};
const handlerIn = (src, component, handler) => {
    let out = null;
    walkAst(parse(src, { sourceType: 'module', plugins: ['jsx'] }).program, (n) => {
        if (n.type !== 'VariableDeclarator' || n.id.name !== component || !isFnNode(n.init)) return;
        for (const st of n.init.body.body || []) {
            if (st.type !== 'VariableDeclaration') continue;
            for (const d of st.declarations) if (d.id.name === handler) out = src.slice(d.init.start, d.init.end);
        }
    });
    assert.ok(out, `${component}'s ${handler} not found`);
    return out;
};
const TEAM_SAVE = handlerIn(read('src/Tabs/settings/people/TeamsDetail.jsx').replace(/\r\n/g, '\n'), 'TeamModal', 'handleSave');
// Since §0.225 the window sends its list with the token it opened with (`base`, its list and token as one snapshot)
// through writeSettings — a stub here that records the body it sends (`ifRevs`: the tokens) and answers in its shape,
// asked through `answers` as the requests are. The copy's token is 'NEWER', the window's 'OPENED': a save that reads the
// copy's sends the wrong one. `latest`: what a take-latest reads (null: it could not); `base`: a window re-based before.
// dbFetch stays in the scope, so a handler that still sends through it fails on what it sends, not on a missing name.
const runTeamSave = async ({ team, form = {}, teams, users, answers = {}, base = null, latest = null }) => {
    const calls = [], said = [];
    const held = base || { list: teams, rev: 'OPENED' };
    const settings = { teams, users, revs: { teams: 'NEWER', territories: 'TERR' } };
    const state = { settings, base: held, took: 0 };
    const ask = (url, opts = {}) => {
        const to = url.split('/').pop().split('?')[0];
        const body = opts.body ? JSON.parse(opts.body) : undefined;
        calls.push({ to, body });
        return (answers[to] || (() => ({ ok: true, status: 200, data: to === 'users' ? { user: { ...users.find((u) => u.id === body.id), ...body, answered: true } } : body })))(body);
    };
    const opened = team || null;
    const scope = {
        name: form.name ?? opened?.name ?? '', isEdit: !!opened, team: opened, teams: held.list, base: held, settings,
        territory: form.territory ?? opened?.territory ?? '', vertical: form.vertical ?? opened?.vertical ?? '',
        managerId: form.managerId ?? opened?.managerId ?? '', repIds: form.repIds ?? opened?.repIds ?? [], color: form.color ?? opened?.color ?? '#2a2622',
        allUsers: users.filter((u) => u.name && u.active !== false),
        teamNameRefused, teamSaveMembers, rosterAfterTeamSave, revsAfter, listChanged,
        requestOrg: () => 'org_A', stillOrg: (o) => o === 'org_A',
        dbFetch: async (url, opts) => { const a = ask(url, opts); return { ok: a.ok, status: a.status, json: async () => a.data ?? { error: a.error } }; },
        dbWrite: async (url, opts) => ask(url, opts),
        // saveSettings.js writeSettings: never throws; { ok, status, error, data }, the answered tokens on a landed save,
        // the keys that moved on a stale refusal.
        writeSettings: async (payload, revs) => {
            const a = ask('/.netlify/functions/settings', { body: JSON.stringify({ ...payload, ifRevs: revs }) });
            return { ok: a.ok, status: a.status, error: a.error ?? a.data?.error ?? null, data: a.data,
                ...(a.ok ? { revs: a.revs ?? { teams: 'T2' } } : {}), ...(a.stale ? { stale: a.stale } : {}) };
        },
        // saveSettings.js takeLatestSettings: one read; the copy takes the latest, the roster kept; null when unread.
        takeLatestSettings: async (set) => { state.took++; if (!latest) return null; set((prev) => ({ ...latest, users: prev.users })); return latest; },
        setErr: (v) => said.push(v), setSaving: () => {},
        setSettings: (f) => { state.settings = f(state.settings); },
        setBase: (v) => { state.base = v; },
        onSave: () => { state.saved = true; }, onStale: (words) => { state.stale = words; }, onClose: () => { state.closed = true; },
        Date,
    };
    const names = Object.keys(scope);
    await new Function(...names, `return (${TEAM_SAVE});`)(...names.map((n) => scope[n]))();
    return { calls, said: said.filter(Boolean), state };
};

test('C4 handleSave, run as written: UKG\'s team saved with a colour change sends the list as held and no member PUT; the window closes', async () => {
    const r = await runTeamSave({ team: UKG_TEAM, form: { color: '#4d6b3d' }, teams: [UKG_TEAM], users: UKG_USERS });
    assert.deepEqual(r.calls.map((c) => c.to), ['settings'], 'REGRESSION: the save clears UKG\'s members');
    assert.deepEqual(r.calls[0].body.teams[0].repIds, UKG_TEAM.repIds, 'the list goes back as it held its entries — no Clerk id rewritten');
    assert.equal(r.state.closed, true);
    assert.deepEqual(r.said, []);
    assert.deepEqual(r.state.settings.users.map((u) => u.teamId), ['team_ukg', 'team_ukg', 'team_ukg', ''], 'the roster on screen as it was');
});

test('C4 handleSave, run as written: a rename sends only the list, and the screen renames every holder — an inactive one too', async () => {
    const users = [...UKG_USERS, { id: 'usr_e', clerkUserId: 'user_e', name: 'E', team: 'UKG', teamId: 'team_ukg', active: false }];
    const r = await runTeamSave({ team: UKG_TEAM, form: { name: 'UKG North' }, teams: [UKG_TEAM], users });
    assert.deepEqual(r.calls.map((c) => c.to), ['settings']);
    assert.deepEqual(r.state.settings.users.map((u) => u.team), ['UKG North', 'UKG North', 'UKG North', '', 'UKG North']);
});

test('C4 handleSave, run as written: a member taken off is cleared and one ticked on joins — as the server answered', async () => {
    const r = await runTeamSave({ team: UKG_TEAM, form: { repIds: [...withoutMember(UKG_TEAM.repIds, UKG_USERS[1]), 'usr_d'] }, teams: [UKG_TEAM], users: UKG_USERS });
    assert.deepEqual(r.calls.map((c) => [c.to, c.body.id]), [['settings', undefined], ['users', 'usr_b'], ['users', 'usr_d']]);
    assert.deepEqual(r.calls[1].body, { id: 'usr_b', team: '', teamId: '', territory: '', vertical: '' });
    const roster = r.state.settings.users;
    assert.equal(roster.find((u) => u.id === 'usr_b').answered, true, 'the row as the server answered it');
    assert.equal(roster.find((u) => u.id === 'usr_d').teamId, 'team_ukg');
    assert.equal(roster.find((u) => u.id === 'usr_c').teamId, 'team_ukg', 'C, whom the list does not hold, untouched');
});

test('C2 handleSave, run as written: a new team of a taken name says so and sends nothing', async () => {
    const QA = [{ id: 'e1', name: 'East', repIds: [] }, { id: 'e2', name: 'East', repIds: [] }];
    const r = await runTeamSave({ team: null, form: { name: ' east' }, teams: QA, users: UKG_USERS });
    assert.deepEqual(r.calls, [], 'REGRESSION: a duplicate name reaches the server');
    assert.deepEqual(r.said, ['A team named "East" already exists — choose a different name.']);
    const ok = await runTeamSave({ team: QA[1], form: { color: '#3a5a7a' }, teams: QA, users: UKG_USERS });
    assert.deepEqual(ok.calls.map((c) => c.to), ['settings'], 'the second East still saves');
});

test('C4 the Teams page reads a list through the matcher — the window\'s ticks, its manager, the counts and the org chart', () => {
    const t = code(read('src/Tabs/settings/people/TeamsDetail.jsx'));
    assert.ok(t.includes("import { holdsMember, namesMember, withoutMember, teamNameRefused, teamSaveMembers, rosterAfterTeamSave } from '../../../utils/teamMembership.js';"));
    assert.ok(t.includes('const toggleRep = (u) => setRepIds(prev => holdsMember(prev, u) ? withoutMember(prev, u) : [...prev, u.id]);'), 'a tick adds the app id; an untick takes either');
    assert.ok(t.includes('const selected   = holdsMember(repIds, u);'));
    assert.ok(t.includes('const otherTeam  = (settings.teams||[]).find(t => t.id !== team?.id && holdsMember(t.repIds, u));'));
    assert.ok(t.includes('<select value={managers.find(u => namesMember(managerId, u))?.id ?? managerId} onChange={e=>setManagerId(e.target.value)} style={sel}>'));
    assert.ok(t.includes('const activeReps = activeUsers.filter(u => holdsMember(team.repIds, u)).length;'));
    assert.equal((t.match(/allUsers\.find\(u => namesMember\(team\.managerId, u\) && u\.active !== false\)/g) || []).length, 2, 'the org chart and the table');
    assert.ok(!/repIds\.includes\(u\.id\)|\(t\.repIds\|\|\[\]\)\.includes\(u\.id\)|\(team\.repIds\|\|\[\]\)\.includes\(u\.id\)/.test(t), 'REGRESSION: a list read by app id alone');
});

test('N16 teamOptions: a second team of one name, as the server judges a name (case and spaces aside), reads numbered', async () => {
    const { teamOptions } = await import('../src/Tabs/settings/people/memberPickers.js');
    const labels = teamOptions([{ id: 'a', name: 'East' }, { id: 'b', name: 'east' }, { id: 'c', name: 'North  East' }, { id: 'd', name: 'north east' }]).map((o) => o.label);
    assert.deepEqual(labels.sort(), ['East', 'east (2)', 'North  East', 'north east (2)'].sort(), 'REGRESSION: two teams the server holds as one name read alike');
});

test('C4 teamSaveMembers (the review, 2 Nov): a member the list holds only by a Clerk id it held when the window opened, moved off the team elsewhere, is never sent back onto it', () => {
    const moved = UKG_USERS.map((u) => (u.id === 'usr_a' ? { ...u, team: '', teamId: '' } : u.id === 'usr_b' ? { ...u, team: 'Other', teamId: 'team_other' } : u));
    const sends = (saved, opened = UKG_TEAM) => teamSaveMembers({ opened, saved, users: moved }).map(({ u, body }) => [u.id, body]);
    assert.deepEqual(sends({ ...UKG_TEAM, color: '#4d6b3d' }), [], 'REGRESSION: a colour change puts back a member the profile page unassigned or moved');
    assert.deepEqual(sends({ ...UKG_TEAM, territory: 'NAM' }), [], 'nor sends them the team\'s territory');
    assert.deepEqual(sends({ ...UKG_TEAM, repIds: withoutMember(UKG_TEAM.repIds, moved[1]) }), [],
        'REGRESSION: taking off the list a member now on another team clears their team there');
    assert.deepEqual(sends({ ...UKG_TEAM, repIds: [...UKG_TEAM.repIds, 'usr_a'] }),
        [['usr_a', { id: 'usr_a', team: 'UKG', teamId: 'team_ukg', territory: '', vertical: '' }]], 'ticked on by app id, they join');
    assert.deepEqual(sends({ ...UKG_TEAM, repIds: ['user_a'] }, { ...UKG_TEAM, repIds: [] }),
        [['usr_a', { id: 'usr_a', team: 'UKG', teamId: 'team_ukg', territory: '', vertical: '' }]], 'a list that did not hold them when it opened: added in this window, they join');
});

test('C2 teamNameRefused (the review, 2 Nov): a long name stored before stays on its own team — a swap or a delete-and-rename moving it onto another is refused', () => {
    const N = 'x'.repeat(300);
    const stored = [{ id: 't1', name: N }, { id: 't2', name: 'b' }];
    assert.equal(teamNameRefused([{ id: 't1', name: 'a' }, { id: 't2', name: N }], stored)?.error, TEAM_NAME_LONG, 'REGRESSION: a swap carries the long name onto a team with members — the save fails as a 500');
    assert.equal(teamNameRefused([{ id: 't2', name: N }], stored)?.error, TEAM_NAME_LONG, 'a delete and a rename');
    assert.equal(teamNameRefused(stored, stored), null, 'kept on its own team');
    assert.equal(teamNameRefused([N, { id: 't2', name: 'b' }], [N]), null, 'an old plain-string entry the stored list holds');
    assert.equal(teamNameRefused([N], [])?.error, TEAM_NAME_LONG, 'a new one refused');
});

test('C4 handleSave, run as written: a member PUT refused leaves that member as stored, the others as answered, says so and stays open; a settings refusal sends nothing else', async () => {
    const ask = { users: (b) => (b.id === 'usr_b' ? { ok: false, status: 404, error: 'That member is not in your organization — they may have been removed. Reload and try again.' }
        : { ok: true, status: 200, data: { user: { ...UKG_USERS.find((u) => u.id === b.id), ...b, answered: true } } }) };
    const r = await runTeamSave({ team: UKG_TEAM, form: { repIds: [...withoutMember(UKG_TEAM.repIds, UKG_USERS[1]), 'usr_d'] }, teams: [UKG_TEAM], users: UKG_USERS, answers: ask });
    assert.deepEqual(r.said, ['Team saved, but 1 member record(s) did not update: B: That member is not in your organization — they may have been removed. Reload and try again.']);
    assert.notEqual(r.state.closed, true, 'stays open so the message is read');
    assert.notEqual(r.state.saved, true);
    const roster = r.state.settings.users;
    assert.equal(roster.find((u) => u.id === 'usr_b'), UKG_USERS[1], 'REGRESSION: a member whose save failed shows as saved');
    assert.equal(roster.find((u) => u.id === 'usr_d').answered, true);
    assert.deepEqual(r.state.settings.teams[0].repIds, [...withoutMember(UKG_TEAM.repIds, UKG_USERS[1]), 'usr_d'], 'the team as saved');

    const refused = await runTeamSave({ team: UKG_TEAM, form: { repIds: [...UKG_TEAM.repIds, 'usr_d'] }, teams: [UKG_TEAM], users: UKG_USERS,
        answers: { settings: () => ({ ok: false, status: 404, data: { error: 'That member is not in your organization — pick one from the list.' } }) } });
    assert.deepEqual(refused.calls.map((c) => c.to), ['settings'], 'no member PUT after a refused list');
    assert.deepEqual(refused.said, ['That member is not in your organization — pick one from the list.']);
    assert.equal(refused.state.settings.users, UKG_USERS, 'the roster untouched');
    assert.notEqual(refused.state.closed, true);
});

// ── §0.225 — the window's save names the token its list was read with (batch 4b-3, step B-2; Jeff, 2 Nov: every
// Recommended — STEP-B.md §4a, J-B8). handleSave run as written, as above. ─────────────────────────────────────────────

// What a take-latest reads: another tab recoloured UKG's team and made a team since this window opened.
const LATEST_TEAMS = [{ ...UKG_TEAM, color: '#3a5a7a' }, { id: 'team_other', name: 'Other', territory: '', vertical: '', managerId: '', repIds: [], color: '#2a2622' }];
const LATEST = { teams: LATEST_TEAMS, revs: { teams: 'T_LATEST', territories: 'TERR' } };
const STALE = () => ({ ok: false, status: 409, error: STALE_ERROR, stale: ['teams'] });

test('C5 handleSave, run as written: the list goes with the token the window opened with — not the copy\'s newer one — and a save that lands merges the answered token and holds the list it landed', async () => {
    const r = await runTeamSave({ team: UKG_TEAM, form: { color: '#4d6b3d' }, teams: [UKG_TEAM], users: UKG_USERS });
    assert.deepEqual(r.calls[0].body.ifRevs, { teams: 'OPENED' }, 'REGRESSION: the window sends the copy\'s token, or none — another tab\'s save is overwritten');
    assert.deepEqual(r.state.settings.revs, { teams: 'T2', territories: 'TERR' }, 'REGRESSION: the answered token is dropped — the next save is refused as stale');
    assert.deepEqual(r.state.base, { list: r.calls[0].body.teams, rev: 'T2' }, 'the window holds the list it landed, with its token');
    assert.equal(r.state.took, 0, 'nothing read again');
    // A member PUT that fails after the list landed: the token merged and the window re-based all the same, so Save
    // again sends the landed list with its own token.
    const f = await runTeamSave({ team: UKG_TEAM, form: { repIds: [...UKG_TEAM.repIds, 'usr_d'] }, teams: [UKG_TEAM], users: UKG_USERS,
        answers: { users: () => ({ ok: false, status: 500, error: 'TEST' }) } });
    assert.deepEqual(f.said, ['Team saved, but 1 member record(s) did not update: D: TEST']);
    assert.equal(f.state.settings.revs.teams, 'T2');
    assert.deepEqual(f.state.base, { list: f.calls[0].body.teams, rev: 'T2' });
});

test('C5 handleSave, run as written: an edit refused as stale takes the latest once, closes with the words on the page, and sends no member anything', async () => {
    const run = (latest) => runTeamSave({ team: UKG_TEAM, form: { repIds: [...UKG_TEAM.repIds, 'usr_d'] }, teams: [UKG_TEAM], users: UKG_USERS,
        answers: { settings: STALE }, latest });
    const r = await run(LATEST);
    assert.deepEqual(r.calls.map((c) => c.to), ['settings'], 'REGRESSION: a refused list goes on to the member PUTs');
    assert.equal(r.state.took, 1, 'REGRESSION: the page keeps the copy that was refused');
    assert.equal(r.state.stale, listChanged('team'), 'REGRESSION: the refusal is not said on the page');
    assert.equal(r.state.stale, 'The team list changed since this page loaded — it now shows the latest. Make your change again.');
    assert.equal(r.state.closed, true, 'REGRESSION: an edit refused as stale stays open on a list it cannot save');
    assert.notEqual(r.state.saved, true);
    assert.deepEqual(r.said, [], 'the words are the page\'s, the window closed');
    assert.equal(r.state.settings.teams, LATEST_TEAMS, 'the latest on screen');
    assert.equal(r.state.settings.users, UKG_USERS, 'the roster as it was');
    const unread = await run(null);
    assert.equal(unread.state.took, 1);
    assert.equal(unread.state.stale, STALE_ERROR, 'the latest unread: the refusal\'s own words');
    assert.equal(unread.state.closed, true);
    assert.deepEqual(unread.calls.map((c) => c.to), ['settings']);
});

test('C5 handleSave, run as written: a new team refused as stale stays open on the latest list and its token, says so, and Save again lands it there', async () => {
    const form = { name: 'North', repIds: ['usr_d'] };
    const r = await runTeamSave({ team: null, form, teams: [UKG_TEAM], users: UKG_USERS, answers: { settings: STALE }, latest: LATEST });
    assert.deepEqual(r.calls.map((c) => c.to), ['settings'], 'no member PUT');
    assert.equal(r.state.took, 1);
    assert.deepEqual(r.said, [listChanged('team')], 'the words in the window');
    assert.notEqual(r.state.closed, true, 'REGRESSION: a new team refused as stale closes — what was typed is lost');
    assert.equal(r.state.stale, undefined, 'no page note');
    assert.deepEqual(r.state.base, { list: LATEST_TEAMS, rev: 'T_LATEST' }, 'REGRESSION: the window keeps the refused list and token — Save again is refused again');
    const again = await runTeamSave({ team: null, form, teams: [UKG_TEAM], users: UKG_USERS, base: r.state.base });
    assert.deepEqual(again.calls.map((c) => c.to), ['settings', 'users']);
    assert.deepEqual(again.calls[0].body.ifRevs, { teams: 'T_LATEST' }, 'with the latest list\'s token');
    assert.deepEqual(again.calls[0].body.teams.map((t) => t.name), ['UKG', 'Other', 'North'], 'the other tab\'s team kept, the new one added');
    assert.equal(again.calls[0].body.teams[0].color, '#3a5a7a', 'and its colour');
    assert.equal(again.state.closed, true);
});
