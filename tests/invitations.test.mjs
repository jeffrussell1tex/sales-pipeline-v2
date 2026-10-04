// Invitations are real (state §0.165 — Jeff: "All of it"). The invitation feature
// was mostly a mockup: the Pending invites page read rows with a lower-case
// 'invited' status (the invite path stores 'Invited', so it listed none), printed
// made-up figures ("Opened email", "Sent Recently", "in 7d"), and its Revoke only
// hid the row on screen; Delete user removed an invitation's row and left the
// Clerk invitation live; the invite page's expiry, note and MFA switch were never
// sent, and its email preview was invented. Any Manager could also remove any
// member — an Admin's row included, which since §0.163 demotes them.
//
// invitationEntries() is the REAL helper, run here; the screen and the server are
// scanned for the rules tests/integration/invitations.itest.mjs proves end to end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { invitationEntries } from '../src/Tabs/settings/people/memberStatus.js';
import { INVITE_EXPIRY_DAYS, DEFAULT_INVITE_EXPIRY_DAYS } from '../src/utils/inviteExpiry.js';

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

test('invitationEntries: the roster\'s invitations and Clerk\'s pending ones, one entry per address, the newest invitation kept', () => {
    const users = [
        { id: 'u1', email: 'Ann@x.test', active: false, status: 'Invited', clerkUserId: null },     // invited, has a live invitation
        { id: 'u2', email: 'bob@x.test', active: false, status: 'Invited', clerkUserId: null },     // invited, no live invitation
        { id: 'u3', email: 'cat@x.test', active: true, status: 'Active', clerkUserId: 'user_c' },   // a member — never listed
        { id: 'u4', email: 'dee@x.test', active: false, status: 'Deactivated', clerkUserId: 'user_d' },
        { id: 'u5', email: '', active: false, status: 'Invited', clerkUserId: null },               // no address — cannot be matched
    ];
    const invites = [
        { id: 'i1', email: 'ann@x.test', createdAt: 100 },
        { id: 'i2', email: 'ann@x.test', createdAt: 200 },     // Clerk holds two: the newer wins
        { id: 'i3', email: 'eve@x.test', createdAt: 300 },     // made in Clerk's dashboard — no row
    ];
    const e = invitationEntries(users, invites);
    assert.deepEqual(e.map((x) => x.email), ['ann@x.test', 'bob@x.test', 'eve@x.test']);
    assert.equal(e[0].row.id, 'u1');
    assert.equal(e[0].invite.id, 'i2', 'the newest invitation');
    assert.equal(e[1].invite, null, 'a row with no live invitation still shows — to resend or revoke');
    assert.equal(e[2].row, null, 'an invitation with no row shows too');
    assert.ok(!e.some((x) => x.row && ['u3', 'u4'].includes(x.row.id)), 'REGRESSION: a member or a deactivated row is listed as an invitation');
    assert.deepEqual(invitationEntries([], []), []);
});

test('one list of expiry choices, shared by the screen and the server', () => {
    assert.deepEqual(INVITE_EXPIRY_DAYS, [3, 7, 14, 30]);
    assert.equal(DEFAULT_INVITE_EXPIRY_DAYS, 7);
    const u = code(read('netlify/functions/users.mjs'));
    const s = code(read('src/Tabs/settings/people/UsersDetail.jsx'));
    assert.ok(u.includes("import { INVITE_EXPIRY_DAYS, DEFAULT_INVITE_EXPIRY_DAYS } from '../../src/utils/inviteExpiry.js';"));
    assert.ok(s.includes("import { INVITE_EXPIRY_DAYS } from '../../../utils/inviteExpiry.js';"));
    assert.ok(!/\[\s*3,\s*7,\s*14,\s*30\s*\]/.test(u + s), 'REGRESSION: a second copy of the list');
});

const screen = code(read('src/Tabs/settings/people/UsersDetail.jsx'));

test('the Pending invites page lists the real invitations, with Clerk\'s dates, and nothing invented', () => {
    const page = between(screen, 'const UsersPendingPage = ', '\nconst UsersSeatPage = ');
    assert.ok(page.includes("const res = await dbFetch('/.netlify/functions/users?invitations=pending');"), 'Clerk\'s pending invitations, from the server');
    assert.ok(page.includes('const entries = invitationEntries(settings.users || [], clerkInvites || []);'));
    assert.ok(!page.includes("u.status === 'invited'"), 'REGRESSION: the lower-case status that listed no invitation');
    assert.ok(page.includes('Sent {fmtDate(e.invite?.createdAt)}') && page.includes('`Expires ${fmtDate(e.invite.expiresAt)}`'), 'Clerk\'s sent and expiry dates');
    for (const fake of ['Opened email', 'Expiring soon', 'Reminder cadence', 'accelerep.com/invite', 'Resend all', "sent:'Recently'", "expires:'in 7d'", 'localPending', 'handleCopyLink', 'Edit role']) {
        assert.ok(!page.includes(fake), `REGRESSION: the invented "${fake}" is back`);
    }
});

test('Revoke and Resend are real calls — Revoke withdraws the invitation in Clerk, Resend sends a fresh one', () => {
    const revoke = between(screen, 'const revokeInvite = async (email) => {', '\n};');
    assert.ok(revoke.includes("body:JSON.stringify({ action:'revoke-invite', email }),"), 'REGRESSION: Revoke calls nothing again');
    assert.ok(revoke.includes("if (!res.ok) throw new Error(d.error || ('HTTP ' + res.status));"), 'a refusal is shown');
    const resend = between(screen, 'const resendInvite = async (row) => {', '\n};');
    assert.ok(resend.includes("invites:[{ email: row.email, role: row.role || 'User', team: row.team || null, territory: row.territory || null }]"), 'the row\'s role travels with the resend');
    assert.ok(resend.includes("if (refused) throw new Error(refused.error || 'Clerk refused the invitation');"), 'a per-invite refusal is shown — the server answers it in `errors`');
    const page = between(screen, 'const UsersPendingPage = ', '\nconst UsersSeatPage = ');
    assert.ok(page.includes('const r = await revokeInvite(e.email);'));
    assert.ok(page.includes('if (r.removedRowId) setSettings(prev => ({ ...prev, users: (prev.users || []).filter(u => u.id !== r.removedRowId) }));'), 'the roster on screen loses the row the server removed');
    assert.ok(page.includes('try { await resendInvite(e.row); await loadInvites(); }'), 'Resend, then Clerk\'s new dates');
    assert.ok(page.includes('{e.row && <PeopleSecBtn onClick={() => doResend(e)}>'), 'Resend only for a roster row — an invitation made in Clerk carries no app role');
});

test('an invited member is revoked, not deleted — on the row menu and the profile', () => {
    assert.ok(screen.includes("u.status === 'Invited' && { label:'Revoke invite', action: () => {"), 'REGRESSION: the row menu offers Delete user for an invitation');
    assert.ok(screen.includes("u.status !== 'Invited' && { label:'Delete user', danger: true, action: () => {"));
    const menu = between(screen, "{ label:'Revoke invite', action: () => {", '}},');
    assert.ok(menu.includes('const r = await revokeInvite(u.email);'));
    assert.ok(menu.includes('}, false);'), 'the plain confirm — revoking deletes no member');
    assert.ok(screen.includes("{status === 'Invited' ? ("), 'the profile branches on the status');
    assert.ok(screen.includes('<PeopleSecBtn onClick={handleRevokeInvite}>Revoke invite</PeopleSecBtn>'));
    const handler = between(screen, 'const handleRevokeInvite = () => {', '\n    };');
    assert.ok(handler.includes('const r = await revokeInvite(user.email);'));
    assert.ok(handler.includes('}, false);'));
});

test('the invite page sends the expiry it shows, reports refusals, and carries nothing that is never sent', () => {
    // The page after it is the Export page since the mockup Import page went (§0.167).
    const invitePage = between(screen, 'const UsersInvitePage = ', '\nconst UsersExportPage = ');
    assert.ok(invitePage.includes('expiresInDays: expiry }));'), 'REGRESSION: the chosen expiry is not sent');
    assert.ok(invitePage.includes('<select style={sel} value={expiry} onChange={e=>setExpiry(Number(e.target.value))}>'));
    assert.ok(invitePage.includes('{INVITE_EXPIRY_DAYS.map(n=><option key={n} value={n}>{n} days</option>)}'));
    assert.ok(invitePage.includes('a link that lasts ${expiry} days.'), 'the subtitle says the expiry chosen — it promised 7 and Clerk gave 30');
    for (const dead of ['requireMfa', 'setNote', 'Personal note', 'Email preview', 'noreply@accelerep.com', '7-day']) {
        assert.ok(!invitePage.includes(dead), `REGRESSION: "${dead}" is back — it was never sent`);
    }
    assert.ok(invitePage.includes('const failed = Array.isArray(d.errors) ? d.errors : [];') && invitePage.includes('if (failed.length) throw new Error('), 'REGRESSION: a refused address is dropped and the screen says "Sent!"');
    assert.ok(invitePage.includes('const sent = Array.isArray(d.invited) ? d.invited : [];') && invitePage.includes('if (sent.length) setSettings(prev => {'), 'the new invitations join the roster on screen');
    assert.ok(invitePage.includes("const pendingToday = (settings.users || []).filter(u => u.name && memberStatus(u) === 'Invited').length;"));
    assert.ok(invitePage.includes("{ label:'Pending today', value:pendingToday },"), 'REGRESSION: "Pending today" is a literal again');
    assert.ok(!screen.includes("sub:'expires in 7d'"), 'REGRESSION: the seat card promises a 7-day expiry');
});

const server = code(read('netlify/functions/users.mjs'));

test('the server: the pending list and the revoke are an Admin\'s, scoped to the caller\'s org, and the revoke fails closed', () => {
    assert.ok(server.includes("const list = await clerk.organizations.getOrganizationInvitationList({ organizationId: orgId, status: ['pending'], limit: 500 });"), 'the CALLER\'s org, never one from the request');
    const get = between(server, "if (event.httpMethod === 'GET' && event.queryStringParameters?.invitations === 'pending') {", "return { statusCode: 502");
    assert.ok(get.includes("if (userRole !== 'Admin') {"), 'REGRESSION: a Manager reads the invitations');
    const rev = between(server, "if (data.action === 'revoke-invite') {", "if (data.action === 'invite') {");
    assert.ok(rev.includes("if (userRole !== 'Admin') {\n                    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Only an Admin can revoke an invitation.' }) };"), 'REGRESSION: a Manager revokes');
    assert.ok(rev.includes("const email = String(data.email || '').trim().toLowerCase();"), 'REGRESSION: an address in another case revokes nothing');
    assert.ok(rev.includes(".where(and(eq(users.orgId, orgId), sql`lower(${users.email}) = ${email}`)).limit(1);"), 'this org\'s row, the address in any case');
    assert.ok(rev.includes('if (row && row.clerkUserId) {'), 'REGRESSION: a member who has joined is "revoked"');
    assert.ok(rev.includes("await clerk.organizations.revokeOrganizationInvitation({ organizationId: orgId, invitationId: inv.id, requestingUserId: userId });"));
    assert.ok(rev.includes("return { statusCode: 502, headers, body: JSON.stringify({ error: 'Clerk did not revoke the invitation, so it may still be live. Try again.' }) };"), 'REGRESSION: a refused revoke goes on to remove the row');
    assert.ok(rev.includes('const removeRow = isOpenInvitationRow(row);'));
    assert.ok(rev.includes('await db.delete(users).where(and(eq(users.id, row.id), eq(users.orgId, orgId)));'), 'the invitation\'s row goes');
    assert.ok(rev.includes("await writeAudit(orgId, 'user.invite_revoked',"), 'audited');
});

test('the server: removing a member is an Admin\'s and never one\'s own; an invitation not yet accepted is revoked, not deleted', () => {
    const del = between(server, "const id = event.queryStringParameters?.id;", "await db.delete(users).where(and(eq(users.id, id), eq(users.orgId, orgId)));");
    assert.ok(del.includes("if (userRole !== 'Admin') {\n                return { statusCode: 403, headers, body: JSON.stringify({ error: 'Only an Admin can remove a member.' }) };"), 'REGRESSION: a Manager removes a member — an Admin\'s row demotes them');
    assert.ok(del.includes('if (deletedRow && deletedRow.clerkUserId && deletedRow.clerkUserId === userId) {'), 'REGRESSION: an Admin removes themselves');
    assert.ok(del.includes('if (isOpenInvitationRow(deletedRow)) {'), 'REGRESSION: deleting an invitation\'s row leaves its invitation live');
});

test('the server: an invitation\'s expiry is one of the screen\'s choices and reaches Clerk', () => {
    assert.ok(server.includes('const days = invite.expiresInDays ?? DEFAULT_INVITE_EXPIRY_DAYS;'));
    assert.ok(server.includes('if (!INVITE_EXPIRY_DAYS.includes(days)) {'), 'REGRESSION: any expiry reaches Clerk');
    assert.ok(server.includes('expiresInDays:  days,'), 'REGRESSION: the expiry is not sent — every link lasts Clerk\'s 30 days');
    assert.ok(server.includes("await writeAudit(orgId, 'user.invited', results[results.length - 1]?.id || email,"), 'REGRESSION: an invitation — access and a role — is not audited');
});

test('an invitation not yet accepted: one predicate, and the sync does not call it drift', () => {
    const lib = read('netlify/functions/_lib.mjs');
    assert.ok(lib.includes("    return !!row && !row.clerkUserId && /^invited$/i.test(row.profile?.status || '');"));
    const sync = code(read('netlify/functions/users-sync.mjs'));
    assert.ok(sync.includes('.filter((r) => !isOpenInvitationRow(r))'), 'REGRESSION: a pending invitation is reported as "in Accelerep, not in Clerk"');
});
