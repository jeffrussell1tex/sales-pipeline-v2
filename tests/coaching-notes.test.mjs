// tests/coaching-notes.test.mjs
//
// Coaching notes addressed to a person, several people, or a team (state §0.82,
// handoff item 17). The two decisions Jeff took on 2 Sep are pinned here as
// behaviour of the pure visibility module the function reads:
//   (a) a rep who joins a team later sees team notes only from their FIRST DAY
//       (team_joined_at, else created_at) — resolved at read time;
//   (b) managers cannot see each other's private notes — a note to people is
//       visible to its author, its recipients and Admins, not a recipient's
//       own manager unless they wrote it.
// The client helpers (payloads, the "for you" tests) and the wiring scans
// follow. The one-time legacy import ran on dev and prod on 3 Sep 2026 and its
// code is gone (§0.83).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { noteVisibleTo, firstDayOf, canDeleteNote, audienceOf, isReadBy as srvIsReadBy } from '../netlify/functions/_coaching.mjs';
import { newNotePayload, audienceLabel, isAddressedTo, isReadBy, unreadFor, sortNotes } from '../src/utils/coachingNotes.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const ADMIN = { id: 'usr_admin', role: 'Admin' };
const MGR   = { id: 'usr_mgr',   role: 'Manager' };                   // manages team t1
const MGR2  = { id: 'usr_mgr2',  role: 'Manager' };                   // manages nothing
const REP1  = { id: 'usr_rep1',  role: 'User', profile: { teamId: 't1' }, createdAt: new Date(2026, 0, 15), teamJoinedAt: new Date(2026, 8, 1, 9) };
const REP2  = { id: 'usr_rep2',  role: 'User', profile: { teamId: 't1' }, createdAt: new Date(2026, 0, 15), teamJoinedAt: new Date(2026, 8, 10, 9) };
const OLD   = { id: 'usr_old',   role: 'User', profile: { teamId: 't1' }, createdAt: new Date(2026, 2, 3) };   // no stamp yet: created_at is the floor
const REP3  = { id: 'usr_rep3',  role: 'User', profile: { teamId: 't2' } };
const TEAMS = [{ id: 't1', name: 'West', managerId: 'usr_mgr' }, { id: 't2', name: 'East', managerId: null }];

const people = { id: 'n1', authorId: 'usr_mgr', recipientIds: ['usr_rep1'], teamId: null, date: '2026-09-03' };
const teamNote = (date) => ({ id: 'n_' + date, authorId: 'usr_mgr', recipientIds: [], teamId: 't1', date });

// ── (b) private notes ─────────────────────────────────────────────────────────

test('a note to people: author, recipient and Admin see it; another manager, a bystander and an unresolvable caller do not', () => {
    assert.equal(noteVisibleTo(people, MGR, TEAMS), true, 'author');
    assert.equal(noteVisibleTo(people, REP1, TEAMS), true, 'recipient');
    assert.equal(noteVisibleTo(people, ADMIN, TEAMS), true, 'Admin');
    assert.equal(noteVisibleTo(people, MGR2, TEAMS), false, 'REGRESSION (b): another manager');
    assert.equal(noteVisibleTo(people, REP2, TEAMS), false, 'a teammate who was not addressed');
    assert.equal(noteVisibleTo(people, REP3, TEAMS), false);
    assert.equal(noteVisibleTo(people, { id: null, role: 'Manager' }, TEAMS), false, 'no roster row: nothing (18b22)');
    assert.equal(noteVisibleTo(people, { id: null, role: 'Admin' }, TEAMS), false, 'an unresolvable caller sees nothing even with an Admin role — the id check comes first');
});

test("a recipient's own manager does not see a note about them unless they wrote it", () => {
    const byAdmin = { ...people, authorId: 'usr_admin' };
    assert.equal(noteVisibleTo(byAdmin, MGR, TEAMS), false, 'MGR manages REP1\'s team and still may not see it');
    assert.equal(noteVisibleTo(byAdmin, REP1, TEAMS), true);
});

// ── (a) team notes and the first-day floor ────────────────────────────────────

test('a team note is seen by the team\'s manager and by members from their first day', () => {
    const n = teamNote('2026-09-05');
    assert.equal(noteVisibleTo(n, MGR, TEAMS), true, 'the team\'s manager');
    assert.equal(noteVisibleTo(n, REP1, TEAMS), true, 'joined 1 Sep, note 5 Sep');
    assert.equal(noteVisibleTo(n, REP2, TEAMS), false, 'REGRESSION (a): joined 10 Sep, note 5 Sep');
    assert.equal(noteVisibleTo(teamNote('2026-09-10'), REP2, TEAMS), true, 'the first day itself counts');
    assert.equal(noteVisibleTo(teamNote('2026-09-12'), REP2, TEAMS), true);
    assert.equal(noteVisibleTo(n, REP3, TEAMS), false, 'another team');
    assert.equal(noteVisibleTo(n, MGR2, TEAMS), false, 'a manager of nothing');
    assert.equal(noteVisibleTo(n, ADMIN, TEAMS), true);
});

test('a member with no team_joined_at falls back to created_at; no dates at all means no floor', () => {
    assert.equal(firstDayOf(OLD), '2026-03-03');
    assert.equal(firstDayOf(REP1), '2026-09-01', 'the stamp wins over created_at');
    assert.equal(firstDayOf({}), '');
    assert.equal(noteVisibleTo(teamNote('2026-03-02'), OLD, TEAMS), false, 'the day before they were created');
    assert.equal(noteVisibleTo(teamNote('2026-03-03'), OLD, TEAMS), true);
    assert.equal(noteVisibleTo(teamNote('2020-01-01'), { id: 'usr_x', role: 'User', profile: { teamId: 't1' } }, TEAMS), true, 'nothing known: no floor applied');
});

test('the team floor uses the LOCAL day of the join instant (18b26), not a UTC slice', () => {
    const late = { id: 'usr_late', role: 'User', profile: { teamId: 't1' }, teamJoinedAt: new Date(2026, 8, 9, 23, 30) }; // 9 Sep 23:30 local
    assert.equal(firstDayOf(late), '2026-09-09');
    assert.equal(noteVisibleTo(teamNote('2026-09-09'), late, TEAMS), true);
});

// ── delete, read, audience ────────────────────────────────────────────────────

test('delete: the author or an Admin; read stamps are per user', () => {
    assert.equal(canDeleteNote(people, MGR), true);
    assert.equal(canDeleteNote(people, ADMIN), true);
    assert.equal(canDeleteNote(people, REP1), false, 'a recipient cannot delete');
    assert.equal(canDeleteNote(people, MGR2), false);
    const n = { ...people, readBy: { usr_rep1: '2026-09-03T15:00:00Z' } };
    assert.equal(srvIsReadBy(n, 'usr_rep1'), true);
    assert.equal(srvIsReadBy(n, 'usr_mgr'), false);
    assert.equal(srvIsReadBy({ ...people, readBy: null }, 'usr_rep1'), false);
});

test('audienceOf: people OR a team, never both, never neither', () => {
    assert.deepEqual(audienceOf({ recipientIds: ['a', 'a', 'b'] }), { ok: true, recipientIds: ['a', 'b'], teamId: null });
    assert.deepEqual(audienceOf({ teamId: 't1' }), { ok: true, recipientIds: [], teamId: 't1' });
    assert.equal(audienceOf({ recipientIds: ['a'], teamId: 't1' }).ok, false);
    assert.equal(audienceOf({}).ok, false);
    assert.equal(audienceOf({ recipientIds: [3, null, ''] }).ok, false, 'non-string ids are not recipients');
    assert.equal(audienceOf({}, { legacy: true }).ok, false, 'the legacy escape hatch is gone (§0.83)');
});

// ── client helpers ────────────────────────────────────────────────────────────

test('newNotePayload: local day, one audience, trimmed text; nothing without an audience or text', () => {
    assert.deepEqual(newNotePayload({ text: '  hi  ', recipientIds: ['a', 'a'], today: '2026-09-03', id: 'cn_x' }), { id: 'cn_x', text: 'hi', date: '2026-09-03', recipientIds: ['a'], teamId: null });
    assert.deepEqual(newNotePayload({ text: 'team', teamId: 't1', recipientIds: ['a'], today: '2026-09-03', id: 'cn_y' }), { id: 'cn_y', text: 'team', date: '2026-09-03', teamId: 't1', recipientIds: [] }, 'a team note carries no people');
    assert.equal(newNotePayload({ text: '', recipientIds: ['a'] }), null);
    assert.equal(newNotePayload({ text: 'x', recipientIds: [] }), null);
    assert.ok(read('src/utils/coachingNotes.js').includes('today = todayLocal()') && !read('src/utils/coachingNotes.js').includes('toISOString'), 'the day is local (18b26)');
});

test('audienceLabel, isAddressedTo, isReadBy, unreadFor, sortNotes', () => {
    const roster = [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Cy' }];
    const teams = [{ id: 't1', name: 'West' }];
    assert.equal(audienceLabel({ recipientIds: ['a'] }, roster, teams), 'Ann');
    assert.equal(audienceLabel({ recipientIds: ['a', 'b'] }, roster, teams), 'Ann & Bob');
    assert.equal(audienceLabel({ recipientIds: ['a', 'b', 'c'] }, roster, teams), 'Ann & 2 others');
    assert.equal(audienceLabel({ teamId: 't1' }, roster, teams), 'Team West');
    assert.equal(audienceLabel({ recipientIds: [], legacy: true }, roster, teams), 'Imported · no recipient');
    assert.equal(isAddressedTo({ recipientIds: ['a'] }, 'a'), true);
    assert.equal(isAddressedTo({ teamId: 't1' }, 'a', 't1'), true);
    assert.equal(isAddressedTo({ teamId: 't1' }, 'a', 't2'), false);
    assert.equal(isAddressedTo({ recipientIds: ['b'] }, 'a', 't1'), false);
    const notes = [
        { id: '1', recipientIds: ['a'], date: '2026-09-01', readBy: {} },
        { id: '2', teamId: 't1', date: '2026-09-03', readBy: { a: 'x' } },
        { id: '3', teamId: 't1', date: '2026-09-02', readBy: {} },
        { id: '4', recipientIds: ['b'], date: '2026-09-04', readBy: {} },
    ];
    assert.deepEqual(unreadFor(notes, 'a', 't1').map(n => n.id), ['3', '1'], 'unread, addressed to a, newest first');
    assert.equal(isReadBy(notes[1], 'a'), true);
    assert.deepEqual(sortNotes(notes).map(n => n.id), ['4', '2', '3', '1']);
});

// ── wiring ────────────────────────────────────────────────────────────────────

test('the function stamps the author from the caller, filters through the pure module, and never trusts the payload\'s ids', () => {
    const fn = read('netlify/functions/coaching-notes.mjs');
    assert.ok(fn.includes("import { noteVisibleTo, canDeleteNote, audienceOf, isDay } from './_coaching.mjs';"));
    assert.ok(fn.includes('authorId:     me.id,'), 'author is the caller');
    assert.doesNotMatch(fn, /authorId:\s*data\.authorId/, 'never the payload');
    assert.ok(fn.includes('rows.filter(n => noteVisibleTo(n, me, teams))'), 'GET filters on the server');
    assert.ok(fn.includes("if (!me) return reply(200, { coachingNotes: [] });"), 'an unresolvable caller gets nothing, not everything');
    assert.ok(fn.includes("requireRole(auth, ['Admin', 'Manager'], headers)"), 'reps cannot write');
    assert.doesNotMatch(fn, /data\.legacy|onConflictDoNothing|coaching_note\.imported/, 'the legacy import branch is gone (§0.83)');
    assert.ok(fn.includes("if (!noteVisibleTo(note, me, teams)) return reply(404"), 'marking read needs visibility, and does not confirm existence');
    assert.ok(fn.includes('if (!canDeleteNote(note, me)) return reply(403'));
    assert.ok(read('db/schema.ts').includes("export const coachingNotes = pgTable('coaching_notes'"), 'the table is in the schema');
    assert.ok(read('db/schema.ts').includes("teamJoinedAt:  timestamp('team_joined_at'),"), 'users carry the first-day stamp');
});

test('users.mjs stamps team_joined_at when a rep\'s team changes, and the settings blob is no longer Manager-writable', () => {
    const u = read('netlify/functions/users.mjs');
    assert.ok(u.includes("if (before && prevTeam !== nextTeam) clean.teamJoinedAt = nextTeam ? new Date() : null;"), 'the stamp');
    assert.ok(u.includes('teamJoinedAt:  row.teamJoinedAt || null,'), 'flatten exposes it');
    const s = read('netlify/functions/settings.mjs');
    assert.doesNotMatch(s, /managerNote/, 'the §0.79 carve-out is retired');
    assert.ok(s.includes("const forbidden = requireRole(auth, ['Admin'], headers);"));
    assert.doesNotMatch(s, /coachingNotes:/, 'the key is out of both halves (§0.83)');
});

test('the client: a house dialog with a picker, the Team tab reads the table, Home shows notes addressed to me, the bell counts unread', () => {
    const sm = read('src/Tabs/SalesManagerTab.jsx');
    assert.ok(sm.includes('onClick={showCoachingNote}'), 'the button opens the dialog');
    assert.doesNotMatch(sm, /showPrompt\(\{\s*title: 'Add coaching note'/, 'the typed "rep: text" prompt is gone');
    assert.doesNotMatch(sm, /settings\.coachingNotes \|\| \[\]\)\s*\.sort/, 'the card no longer reads the blob');
    assert.ok(sm.includes('const recentNotes = sortNotes(coachingNotes)'), 'the card reads the table');
    assert.doesNotMatch(sm, /legacyNotePayload|legacyNotes|settings\.coachingNotes/, 'the import button and every read of the blob are gone (§0.83)');
    assert.doesNotMatch(read('src/utils/coachingNotes.js'), /legacyNotePayload|parseCoachingNote/, 'the import helpers are gone');
    assert.doesNotMatch(read('src/hooks/useSettings.js'), /coachingNotes/, 'no client default for the key');
    assert.doesNotMatch(sm, />See all →</, 'the inert button is gone');
    const home = read('src/Tabs/HomeTab.jsx');
    assert.ok(home.includes('isAddressedTo(n, currentUserId, myTeamId)'), 'Home shows what is addressed to me');
    assert.ok(home.includes('markCoachingNoteRead(n.id)'));
    const app = read('src/App.jsx');
    assert.ok(app.includes('useCoachingNotes({ waitForToken })'));
    assert.ok(app.includes('unreadFor(coachingNotes, currentUserId, myProfile?.teamId || null)'), 'unread notes reach the bell');
    assert.ok(app.includes('coachingNoteModal, setCoachingNoteModal'));
    const ml = read('src/components/layout/ModalLayer.jsx');
    assert.ok(ml.includes('<CoachingNoteDialogHost />'));
    const dlg = read('src/components/modals/CoachingNoteDialog.jsx');
    assert.ok(dlg.includes("userRole === 'Admin' || (u.teamId && teamIds.has(u.teamId))"), 'a Manager may address only their teams\' reps');
});
