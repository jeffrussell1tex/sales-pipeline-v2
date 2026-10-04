// A member's status, and the way back from Deactivated (state §0.164 — Jeff:
// "Deactivated means no access"). Deactivating became real in this batch and the
// Users screen had no way to undo it: the row menu had no Reactivate (and offered
// Deactivate on every row — it read `active` off a display row that has none),
// and the profile's button read "Deactivated" and deactivated again. Both
// confirms were the red "Delete" one and said the person loses Accelerep — all
// of it, though access is per org since §0.163. Found in the pane check, before
// anyone was deactivated.
//
// The same screen read every inactive row as Deactivated, and an invitation not
// yet accepted is stored inactive — so each pending invitation was listed as
// deactivated, and would have been offered Reactivate. The profile header said
// "● Active" for everyone, and the export's Status column wrote "Active" for
// everyone. memberStatus() is the one rule, run here; the screen is scanned for
// using it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { memberStatus } from '../src/Tabs/settings/people/memberStatus.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const code = (src) => src.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');

test('memberStatus: an invitation not yet accepted is Invited, not Deactivated; a linked inactive row is Deactivated whatever its status says', () => {
    assert.equal(memberStatus({ active: true, status: 'Active', clerkUserId: 'user_1' }), 'Active');
    assert.equal(memberStatus({ active: true }), 'Active', 'no stored status reads as Active');
    // The invite path stores the row OFF, with status 'Invited' and no Clerk link.
    assert.equal(memberStatus({ active: false, status: 'Invited', clerkUserId: null }), 'Invited',
        'REGRESSION: a pending invitation is listed as deactivated again');
    assert.equal(memberStatus({ active: false, status: 'invited' }), 'Invited', 'the legacy lower-case status too');
    assert.equal(memberStatus({ active: false, status: 'Deactivated', clerkUserId: 'user_1' }), 'Deactivated');
    assert.equal(memberStatus({ active: false, status: 'Deactivated', clerkUserId: null }), 'Deactivated',
        'deactivated before the invitation was accepted');
    // Linked and off: the server refuses this person, so the screen says so.
    assert.equal(memberStatus({ active: false, status: 'Invited', clerkUserId: 'user_1' }), 'Deactivated',
        'REGRESSION: a linked member the server refuses is shown as a pending invitation');
    // Deactivated before §0.164 gave the row a status: still off.
    assert.equal(memberStatus({ active: false, status: 'Active', clerkUserId: 'user_1' }), 'Deactivated');
    assert.equal(memberStatus({ active: false }), 'Deactivated');
    // An existing row invited again keeps its active flag and takes status 'Invited'.
    assert.equal(memberStatus({ active: true, status: 'Invited', clerkUserId: null }), 'Invited');
});

const screen = code(read('src/Tabs/settings/people/UsersDetail.jsx'));

test('the Users list, the profile header and the export all read memberStatus — none keeps its own rule', () => {
    assert.match(screen, /import \{ [^}]*\bmemberStatus\b[^}]* \} from '\.\/memberStatus\.js';/);
    assert.ok(screen.includes('        const status = memberStatus(u);'), 'the list');
    assert.ok(!/status\s*=\s*'Deactivated'/.test(screen), 'REGRESSION: the list derives its own status again');
    assert.ok(screen.includes('    const status = memberStatus(user);'), 'the profile');
    assert.ok(screen.includes('<StatusPill status={status}/>'), 'the profile header shows the status');
    assert.ok(!screen.includes('● Active</span>'), 'REGRESSION: the profile header says Active for everyone again');
    assert.ok(screen.includes("if (f === 'Status') return `\"${memberStatus(u)}\"`;"), 'the export');
    assert.ok(!screen.includes(`if (f === 'Status') return '"Active"';`), 'REGRESSION: the export writes Active for everyone again');
});

test('deactivate and reactivate — from the row menu and the profile — send only `active`, keep the server answer, and confirm with the plain dialog', () => {
    // The helper: a PUT of the id and the flag, refused loudly.
    const at = screen.indexOf('const setMemberActive = async (id, active) => {');
    assert.ok(at > 0, 'setMemberActive is gone');
    const helper = screen.slice(at, screen.indexOf('\n};', at) + 3);
    assert.ok(helper.includes("method:'PUT'"));
    assert.ok(helper.includes('body:JSON.stringify({ id, active }),'), 'REGRESSION: a whole row is sent with the flag again');
    assert.ok(helper.includes("    if (!res.ok) throw new Error(d.error || ('HTTP ' + res.status));"), 'a refusal is shown, not swallowed');
    assert.ok(helper.includes('    return d.user || { id, active };'), "the server's row is what the screen keeps");
    // Deactivate sent the whole profile form, saving any unsaved edit with it.
    assert.ok(!screen.includes('id: user.id, active: false })') && !screen.includes('id: u.id, active: false })'),
        'REGRESSION: a deactivate builds its own PUT again');

    // Every path: its call, the server's row kept, and the plain confirm — the
    // shared dialog's default is a red "Delete" button, and nothing is deleted.
    const paths = [
        ['the row menu deactivates', "{ label:'Deactivate', action: () => {", '}},', 'const row = await setMemberActive(u.id, false);', 'su.id === u.id ? { ...su, ...row } : su'],
        ['the row menu reactivates', "{ label:'Reactivate', action: () => {", '}},', 'const row = await setMemberActive(u.id, true);', 'su.id === u.id ? { ...su, ...row } : su'],
        ['the profile deactivates', 'const handleDeactivate = () => {', '\n    };', 'const row = await setMemberActive(user.id, false);', 'u.id === user.id ? { ...u, ...row } : u'],
        ['the profile reactivates', 'const handleReactivate = () => {', '\n    };', 'const row = await setMemberActive(user.id, true);', 'u.id === user.id ? { ...u, ...row } : u'],
    ];
    for (const [what, start, end, call, keep] of paths) {
        const s = screen.indexOf(start);
        assert.ok(s > 0, `${what}: gone`);
        const block = screen.slice(s, screen.indexOf(end, s));
        assert.ok(block.includes(call), `${what}: ${call}`);
        assert.ok(block.includes(keep), `${what}: the server's row is kept`);
        assert.ok(block.includes('}, false);'), `REGRESSION: ${what} behind the red "Delete" confirm again`);
    }
    // Per org since §0.163: the person keeps every other org they belong to.
    assert.equal(screen.split('lose access to this organization until an Admin reactivates them.').length - 1, 2);
    assert.ok(!screen.includes('lose access to Accelerep'), 'REGRESSION: the confirm says they lose all of Accelerep');

    // The row menu: Deactivate for a row that is on, read off the ROSTER row —
    // the display row has no `active`, so u.active offered it on every row.
    assert.ok(screen.includes("(u._raw || u).active !== false && { label:'Deactivate', action: () => {"),
        'REGRESSION: the menu reads `active` off the display row and offers Deactivate on every row');
    assert.ok(screen.includes("u.status === 'Deactivated' && { label:'Reactivate', action: () => {"),
        'REGRESSION: the row menu offers no way back from Deactivated');

    // The profile: Reactivate replaces Deactivate for a deactivated member.
    assert.ok(screen.includes("{status === 'Deactivated' ? ("), 'the profile branches on the status');
    assert.ok(screen.includes('<PeopleSecBtn onClick={handleReactivate}>Reactivate</PeopleSecBtn>'));
    assert.ok(screen.includes(') : user.active !== false && ('), 'Deactivate only for a row that is on');
    assert.ok(!screen.includes("{form.active === false ? 'Deactivated' : 'Deactivate'}"),
        'REGRESSION: the profile button reads "Deactivated" and deactivates again');
});

test('the Users list no longer promises a bulk select it does not have', () => {
    assert.ok(!screen.includes('Use bulk select'), 'REGRESSION: the list promises bulk select again');
    assert.ok(screen.includes("Deactivate or reactivate from a row's ⋯ menu."));
});
