// A team member's CSV becomes invitations (state §0.167 — Jeff: "why cant we
// replace it with the csv importer that is used for leads, contacts, accounts",
// then "go with your recomendation"). The Users page's Import CSV was a mockup:
// it read no file, and its "Import users" closed the page. The shared CSV
// importer reads the file now, src/utils/userImport.js decides what each row
// means for a person, and the invite path sends it.
//
// Run here: the REAL rules — the role a cell names, who is already on the team,
// the invitation a row becomes, and how a team member's file maps. Scanned: the
// importer, the handler, the page and the server, for the wiring that
// tests/integration/invitations.itest.mjs proves end to end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { USER_IMPORT_FIELDS, roleValueOf, roleLabelOf, inviteFrom, userConflicts } from '../src/utils/userImport.js';
import { autoMapHeaders } from '../src/utils/csvAutoMap.js';
import { mapCsvRows } from '../src/utils/csvMapping.js';
import { describeReceipt, emptyReceipt } from '../src/utils/importReceipt.js';

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
const reasons = (conflicts) => conflicts.map((c) => [c.incomingIndex, c.matchReason]);

test('the role a cell names: a label or a stored value, in any case — blank is the default, anything else kept as written', () => {
    assert.equal(roleValueOf('Sales Rep'), 'User');
    assert.equal(roleValueOf('sales rep'), 'User');
    assert.equal(roleValueOf('USER'), 'User');
    assert.equal(roleValueOf(' Admin '), 'Admin');
    assert.equal(roleValueOf('read only'), 'ReadOnly');
    assert.equal(roleValueOf('readonly'), 'ReadOnly');
    assert.equal(roleValueOf('Dispatcher'), 'Dispatcher');
    assert.equal(roleValueOf(''), undefined);
    assert.equal(roleValueOf('   '), undefined);
    assert.equal(roleValueOf(undefined), undefined);
    assert.equal(roleValueOf('Boss'), 'Boss', 'REGRESSION: an unknown role is guessed into one');
    assert.equal(roleLabelOf(undefined), 'Sales Rep', 'blank is the server\'s default, a rep');
    assert.equal(roleLabelOf('User'), 'Sales Rep');
    assert.equal(roleLabelOf('ReadOnly'), 'Read only');
});

test('inviteFrom: the address lowercased, the name given or the address before the @, the workspace\'s spelling of a team and territory', () => {
    const teams = [{ id: 't1', name: 'East Coast' }, 'Legacy Team'];
    const territories = [{ id: 'r1', name: 'Northeast' }];
    assert.deepEqual(
        inviteFrom({ email: ' Ann.Lee@X.test ', memberName: ' Ann Lee ', role: 'manager', team: 'east coast', territory: 'NORTHEAST' }, { teams, territories }),
        { email: 'ann.lee@x.test', name: 'Ann Lee', role: 'Manager', team: 'East Coast', territory: 'Northeast' });
    assert.deepEqual(
        inviteFrom({ email: 'bo@x.test' }, { teams, territories }),
        { email: 'bo@x.test', name: 'bo', role: undefined, team: null, territory: null },
        'no name in the file: the part of the address before the @, sent and shown — the server\'s own default');
    assert.equal(inviteFrom({ email: 'c@x.test', team: 'legacy team' }, { teams }).team, 'Legacy Team', 'a team stored as a plain string is a name too');
});

test('a person already on the team is not invited — a member, an invitation not yet accepted, a deactivated member — matched by address in any case', () => {
    const roster = [
        { id: 'u1', name: 'Mia Member', email: 'Mia@x.test', active: true, status: 'Active', clerkUserId: 'user_1' },
        { id: 'u2', name: 'ivy', email: 'ivy@x.test', active: false, status: 'Invited', clerkUserId: null },
        { id: 'u3', name: 'Dan Off', email: 'dan@x.test', active: false, status: 'Deactivated', clerkUserId: 'user_3' },
    ];
    const c = userConflicts([
        { email: 'mia@X.test', memberName: 'Someone Else' },
        { email: 'IVY@x.test' },
        { email: 'dan@x.test' },
        { email: 'new@x.test', memberName: 'New Person' },
    ], { roster });
    assert.deepEqual(reasons(c), [[0, 'already a member'], [1, 'already invited'], [2, 'a deactivated member']],
        'REGRESSION: someone on the team is invited again — a second email, and a revoked first invitation');
    assert.ok(c.every((x) => x.action === 'skip'), 'skipped, never overwritten');
    assert.equal(c[0].existing.id, 'u1');
});

test('a repeated address, a cell that is not an address, and a role, team or territory this workspace does not have are not invited', () => {
    const c = userConflicts([
        { email: 'a@x.test' },                                                   // invited
        { email: 'A@x.test' },                                                   // the same address again
        { email: 'not-an-address' },
        { email: 'b@x.test', role: 'Boss' },
        { email: 'c@x.test', team: 'West' },
        { email: 'd@x.test', territory: 'South' },
        { email: 'e@x.test', role: 'sales rep', team: 'east', territory: 'north' },   // invited
    ], { roster: [], teams: [{ name: 'East' }], territories: [{ name: 'North' }] });
    assert.deepEqual(reasons(c), [
        [1, 'repeated in this file'],
        [2, 'not an email address'],
        [3, '"Boss" is not a role'],
        [4, 'no team named "West"'],
        [5, 'no territory named "South"'],
    ]);
});

test('a name already on the team, or earlier in the file, is not invited — owners are resolved by name, and two of one name are a 409', () => {
    const roster = [{ id: 'u1', name: 'Pat Smith', email: 'pat@x.test', active: true, status: 'Active', clerkUserId: 'user_1' }];
    const c = userConflicts([
        { email: 'pat2@y.test', memberName: '  pat smith ' },   // the roster's name, in another case
        { email: 'lee@x.test', memberName: 'Lee' },             // invited
        { email: 'lee2@x.test', memberName: 'LEE' },            // an earlier row's name
        { email: 'jo@x.test' },                                 // invited, as "jo"
        { email: 'jo@y.test' },                                 // "jo" again — from the address
    ], { roster });
    assert.deepEqual(reasons(c), [
        [0, 'a member is already named "pat smith"'],
        [2, 'an earlier row is also named "LEE"'],
        [4, 'an earlier row is also named "jo"'],
    ]);
});

test('a row that is not invited claims neither its address nor its name — a later row is judged on its own', () => {
    const c = userConflicts([
        { email: 'kim@x.test', memberName: 'Kim', team: 'Nowhere' },
        { email: 'kim@x.test', memberName: 'Kim' },
    ], { roster: [], teams: [] });
    assert.deepEqual(reasons(c), [[0, 'no team named "Nowhere"']]);
});

test('a team member\'s file maps itself — and a first name, a last name or a team name never takes the Name slot', () => {
    const { mapping } = autoMapHeaders(['Full Name', 'Email Address', 'User Role', 'Team Name', 'Territory'], USER_IMPORT_FIELDS);
    assert.deepEqual(mapping, { memberName: 0, email: 1, role: 2, team: 3, territory: 4 });
    const split = autoMapHeaders(['First Name', 'Last Name', 'Email', 'Team'], USER_IMPORT_FIELDS).mapping;
    assert.equal(split.memberName, undefined, 'REGRESSION: "First Name" is taken for the whole name');
    assert.equal(split.email, 2);
    assert.equal(split.team, 3);
    assert.equal(autoMapHeaders(['Name', 'Email'], USER_IMPORT_FIELDS).mapping.memberName, 0);
    // The one required column: a row with no address is not sent.
    const { records, dropped } = mapCsvRows([['Ann', 'ann@x.test'], ['Bo', '']], USER_IMPORT_FIELDS, { memberName: 0, email: 1 });
    assert.equal(records.length, 1);
    assert.equal(dropped.length, 1);
});

test('the receipt says invitations were SENT, and calls skipped rows skipped — every other import reads as it did', () => {
    const words = { created: 'sent', failed: 'not sent', skipped: 'skipped', none: 'No invitation was sent' };
    assert.equal(describeReceipt({ ...emptyReceipt(), created: 3, failed: 1, skipped: 2, attempted: 4 }, 'invitation', words),
        '3 invitations sent. 1 not sent. 2 skipped.');
    assert.equal(describeReceipt({ ...emptyReceipt(), failed: 2, attempted: 2 }, 'invitation', words), 'No invitation was sent. 2 not sent.');
    assert.equal(describeReceipt({ ...emptyReceipt(), created: 2, skipped: 1, attempted: 2 }, 'contact'), '2 contacts created. 1 skipped as duplicates.');
    assert.equal(describeReceipt({ ...emptyReceipt(), failed: 1, attempted: 1 }), 'Nothing was saved. 1 did not save.');
});

test('the importer: a team import always stops at Review, sends through onImportUsers, and its button says Send', () => {
    const m = code(read('src/components/modals/CsvImportModal.jsx'));
    assert.ok(m.includes("import { USER_IMPORT_FIELDS, userConflicts, inviteFrom, roleLabelOf } from '../../utils/userImport.js';"));
    const check = between(m, 'const handleCheckDuplicates = () => {', 'const found = detectDuplicates(');
    assert.ok(/if \(importType === 'users'\) \{\s*setConflicts\(userConflicts\(data, \{ roster: users \|\| \[\], teams, territories \}\)\);\s*setConflictPage\(0\);\s*setStep\('conflicts'\);\s*return;\s*\}/.test(check),
        'REGRESSION: a team import with nothing to skip goes straight to sending');
    assert.ok(!check.includes('runImport('), 'nothing is sent from Preview');
    assert.ok(m.includes('const sent = await onImportUsers(newRecords.map(r => inviteFrom(r, { teams, territories })));'));
    assert.ok(m.includes('<>Send {toInvite.length} invitation{toInvite.length === 1 ? \'\' : \'s\'} →</>'));
    assert.ok(m.includes('disabled={importing || none}'), 'Send is off with no one to invite');
    assert.ok(m.includes("{step === 'conflicts' && !isUsers && ("), 'the Skip / Overwrite table is not the team import\'s');
});

test('the handler sends through the invite path, ten to a request, and counts what the server answered', () => {
    const l = code(read('src/components/layout/ModalLayer.jsx'));
    const h = between(l, 'onImportUsers={async (invites) => {', 'return { receipt, refusals };');
    assert.ok(h.includes('const INVITES_PER_REQUEST = 10;'));
    assert.ok(h.includes("body: JSON.stringify({ action: 'invite', invites: chunk }),"));
    assert.ok(h.includes('receipt.created += sent.length;'));
    assert.ok(h.includes('receipt.failed += chunk.length - sent.length;'));
    assert.ok(/if \(!answered\) \{\s*receipt\.failed \+= invites\.length - i;/.test(h), 'a request answered any other way stops the run, the rest counted as not sent');
    assert.ok(/receipt\.error = [^\n]*;\s*break;\s*\}/.test(h), 'and stops — the next request would only meet the same failure');
    assert.ok(l.includes('users={settings.users || []}'));
});

test('the Users page: Import CSV opens the importer; the mockup, its route and the dead Reset password are gone; the row menu is portaled', () => {
    const s = code(read('src/Tabs/settings/people/UsersDetail.jsx'));
    assert.ok(!s.includes('UsersImportPage'), 'REGRESSION: the mockup Import page is back');
    assert.ok(!s.includes("peopleView === 'import'"));
    assert.ok(s.includes("const openCsvImport = () => { setCsvImportType('users'); setShowCsvImportModal(true); };"));
    assert.ok(s.includes('<button onClick={openCsvImport}'));
    assert.ok(!/>\s*Reset password\s*</.test(s), 'REGRESSION: a Reset password control is back');
    // The profile page's controls. (The Seat usage page's "Add seats" and "Manage
    // plan" are a billing mockup — recorded in state §9, Jeff's call.)
    const profile = between(s, 'const UserProfilePage = ', 'export const UsersDetail = ');
    assert.ok(!/<\w+ onClick=\{\(\) => \{\}\}/.test(profile), 'REGRESSION: a profile control wired to nothing');
    const menu = between(s, '{openUserKebab === u.id && kebabPos && createPortal(', 'document.body,');
    assert.ok(menu.includes("position:'fixed'"));
    assert.ok(menu.includes('onClick={e => e.stopPropagation()}'), 'a portal\'s click still reaches the row through React');
    assert.ok(!s.includes("position:'absolute', right:0, bottom:'100%'"), 'REGRESSION: the row menu is absolute inside the table again');
});

test('MFA status: loading is not failure — the card and the Security page say which', () => {
    const s = code(read('src/Tabs/settings/people/UsersDetail.jsx'));
    assert.ok(s.includes('if (!res.ok) { if (!cancelled) setMfaFailed(true); return; }'));
    assert.ok(s.includes('} catch (e) { if (!cancelled) setMfaFailed(true); }'));
    assert.ok(s.includes("sub:   !mfaByEmail ? (mfaFailed ? 'unknown — could not read Clerk' : 'loading…')"),
        'REGRESSION: the card says Clerk is not reachable while the fetch is on its way');
    assert.ok(s.includes('const loading     = mfaData === null && !mfaFailed;'), 'REGRESSION: the Security page says Loading… after the fetch failed');
    assert.ok(s.includes('mfaData={mfaData} mfaFailed={mfaFailed}'));
});

test('the server: an invitation\'s row takes the name it was sent, cut to the column — and Clear revokes the pending invitations before a row goes', () => {
    const u = code(read('netlify/functions/users.mjs'));
    assert.ok(u.includes("const givenName = typeof invite.name === 'string' ? invite.name.trim().slice(0, 255) : '';"));
    assert.ok(u.includes("name:      givenName || email.split('@')[0],"));
    const clear = between(u, "if (event.queryStringParameters?.clear === 'true') {", 'cleared: true');
    const revokeAt = clear.indexOf('revokeOrganizationInvitation');
    const deleteAt = clear.indexOf('db.delete(users)');
    assert.ok(revokeAt > 0 && deleteAt > revokeAt, 'REGRESSION: the rows go before the invitations are revoked');
});
