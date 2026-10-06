// tests/roster-provision.test.mjs
//
// State §0.108. The production workspace had no roster rows at all: nothing
// created one until an Admin pressed Sync in Settings, so its Admin's
// integration request recorded no name, and everything they created was
// unowned (an unresolvable caller stamps null — §18b20). Now the self-profile
// GET provisions the caller's row from Clerk when nothing matches, and the
// request function does the same for an unrostered requester. The helper is
// exercised against the real test database in
// tests/integration/integration-requests.itest.mjs; these scans pin the wiring
// and the one rule that matters: a new row is a rep — never Clerk's user-level
// role (one value for every org) — except a fresh org's first Admin (§0.163).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

test('ensureRosterRow: our id, the Clerk id in its column, a rep\'s role but for a fresh org\'s first Admin, the sync\'s profile shape, idempotent by Clerk id then email, never throws', () => {
    const s = code(read('netlify/functions/_lib.mjs'));
    assert.ok(s.includes('export async function ensureRosterRow({ clerkUserId, orgId, clerkUser, orgRole } = {}) {'));
    assert.ok(s.includes('        if (byId) return byId;'), 'an existing row by Clerk id is returned untouched');
    assert.ok(s.includes('            if (byEmail) return byEmail.clerkUserId ? null : byEmail;'), 'an invited (unlinked) row by email is returned, not duplicated, not linked here — one linked to another identity is never handed over (§0.173)');
    const fn = s.slice(s.indexOf('export async function ensureRosterRow('), s.indexOf("console.warn('_lib.ensureRosterRow:', e.message);"));
    assert.ok(!/publicMetadata/.test(fn), 'REGRESSION (§0.163): a new row takes Clerk\'s user-level role again — an Admin of one org carried into the next');
    assert.ok(s.includes("        let role = 'User';"), 'a new row is a rep');
    assert.ok(s.includes("        if (orgRole === 'org:admin') {"), 'the one bootstrap: the org\'s Clerk admin, from the verified token');
    assert.ok(s.includes(".where(and(eq(users.orgId, orgId), eq(users.role, 'Admin'))).limit(1);"), 'and only while the org has no Admin row at all');
    assert.ok(s.includes("            if (!anAdmin) role = 'Admin';"));
    assert.ok(s.includes("            id: 'usr_' + randomUUID(), clerkUserId, orgId, name, email: email || `${clerkUserId}@no-email.invalid`, role,"), 'our usr_ id; the Clerk id in its own column');
    assert.ok(s.includes("            active: true, profile: { status: 'Active', userType: role }, updatedAt: new Date(),"), 'the shape users-sync.mjs creates');
    assert.ok(s.includes('        }).onConflictDoNothing().returning();'), 'a race on the per-org unique index is not an error');
    assert.ok(s.includes('        invalidateRoster(orgId);'), 'the 30 s "no roster row" answer in the caller cache is dropped');
    assert.ok(s.includes("        console.warn('_lib.ensureRosterRow:', e.message);"), 'never throws');
});

test('the self-profile GET provisions when nothing matched; the request function provisions an unrostered requester', () => {
    const u = code(read('netlify/functions/users.mjs'));
    assert.match(u, /import \{ [^}]*ensureRosterRow[^}]* \} from '\.\/_lib\.mjs';/);
    const line = '                if (!row) row = await ensureRosterRow({ clerkUserId: userId, orgId, clerkUser, orgRole: auth.orgRole });';
    assert.ok(u.includes(line), 'REGRESSION (§0.108): a member with no roster row gets one on their first load');
    const linkEnd = u.indexOf("console.warn('users.mjs: link update failed:'");
    const ret = u.indexOf("return { statusCode: 200, headers, body: JSON.stringify({ user: row ? flatten(row) : null }) };");
    assert.ok(linkEnd > 0 && u.indexOf(line) > linkEnd && u.indexOf(line) < ret, 'after the link attempt, before the answer — the Clerk user already fetched is handed in');
    const r = code(read('netlify/functions/integration-requests.mjs'));
    assert.match(r, /import \{ [^}]*ensureRosterRow[^}]* \} from '\.\/_lib\.mjs';/);
    assert.ok(r.includes('        const made = await ensureRosterRow({ clerkUserId, orgId, orgRole });'), 'REGRESSION: a request from an unrostered user provisions the row, so the mail and the record carry a name');
    assert.ok(r.includes('        const requester = await requesterOf(orgId, userId, auth.orgRole);'), 'with the org role from the token, so the first-Admin rule is the same everywhere');
    assert.ok(r.includes('        return made ? { name: made.name, email: made.email } : null;'));
});
