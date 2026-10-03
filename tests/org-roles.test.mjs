// A role is PER ORG (state §0.163, guide §18b56): the role on a person's row in
// that org's roster, never Clerk's user-level publicMetadata.role — one value
// for every org a person belongs to, which made an Admin anywhere an Admin
// everywhere they were a member. The behaviour runs against the real test
// database in tests/integration/org-roles.itest.mjs (the real verifyAuth, users,
// user-role and users-sync); these scans pin it where the mutation harness can
// reach it, with one guard over the whole tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const code = (src) => src.split(/\r?\n/).filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

// ── THE GUARD ───────────────────────────────────────────────────────────────
// No function file and no client file reads a role (or a Manager's reps) from
// Clerk's user-level metadata. A read like `user.publicMetadata?.role`,
// `meta.role` off a Clerk user, or `publicMetadata.managedReps` is the global
// value this batch retired.
const CLERK_ROLE_READ = /publicMetadata\s*\?*\.\s*(role|managedReps)\b|publicMetadata\s*(\?\.)?\s*\[\s*['"](role|managedReps)['"]\s*\]/;

const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(m?js|jsx)$/.test(name)) out.push(p);
    }
    return out;
};

test('the guard recognises a Clerk role read in every spelling it has had', () => {
    for (const bad of ['const role = user.publicMetadata?.role || "User";', 'meta = cu.publicMetadata.role', 'x.publicMetadata?.managedReps', "u.publicMetadata['role']"]) {
        assert.ok(CLERK_ROLE_READ.test(bad), bad);
    }
    for (const fine of ['publicMetadata: { team: invite.team || null }', 'cu.publicMetadata?.team', 'const roleIn = new Map()']) {
        assert.ok(!CLERK_ROLE_READ.test(fine), fine);
    }
});

test('THE GUARD — no function or client file reads a role from Clerk\'s user-level metadata', () => {
    const files = [...walk(fileURLToPath(new URL('netlify/functions/', ROOT))), ...walk(fileURLToPath(new URL('src/', ROOT)))];
    assert.ok(files.length > 100, `the walk found the tree (${files.length} files)`);
    const offenders = files.filter((f) => CLERK_ROLE_READ.test(code(readFileSync(f, 'utf8'))));
    assert.deepEqual(offenders, [], `these read a role from Clerk's user-level metadata — one value for every org:\n  ${offenders.join('\n  ')}`);
});

// ── the server ─────────────────────────────────────────────────────────────

test('verifyAuth takes the role from the caller\'s row in THIS org, hands on the token\'s org role, and never caches "no row"', () => {
    const a = code(read('netlify/functions/auth.mjs'));
    assert.ok(a.includes("import { verifyToken } from '@clerk/backend';"), 'no Clerk client: the role is not read from Clerk');
    assert.ok(!/getUser\(/.test(a), 'REGRESSION: verifyAuth reads the Clerk user again');
    assert.ok(a.includes("            const { rosterRoleOf } = await import('./_callerRole.mjs');"), 'loaded lazily — the unit suites that import auth.mjs never load the database');
    assert.ok(a.includes('            row = await rosterRoleOf(userId, orgId);'), 'the caller, in the org the token names');
    assert.ok(a.includes("            return { error: 'The service is unavailable — try again shortly.', status: 503 };"), 'a roster that cannot be read assumes no role');
    assert.ok(a.includes("        const userRole    = rawRole || 'User';"), 'no row is a rep');
    assert.ok(a.includes("        const orgRole     = payload.o?.rol ? 'org:' + payload.o.rol : (payload.org_role || null);"), 'v2 o.rol and v1 org_role');
    assert.ok(a.includes('        const result = { userId, orgId, userRole, managedReps, orgRole, error: null };'));
    const cacheAt = a.indexOf('            authCache.set(token, { result, ts: Date.now() });');
    assert.ok(cacheAt > 0 && a.slice(cacheAt - 40, cacheAt).includes('if (row) {'), 'REGRESSION: "no row" is cached — the caller stays a rep for 30 s after their row is linked');
    const c = code(read('netlify/functions/_callerRole.mjs'));
    assert.ok(c.includes('        .where(and(eq(users.clerkUserId, clerkUserId), eq(users.orgId, orgId)))'), 'REGRESSION: the role lookup must be scoped to the org — one row per (org, Clerk id)');
    assert.ok(c.includes("    return { role: row.role, managedReps: Array.isArray(reps) ? reps : [] };"), 'a Manager\'s reps come from the same row');
});

test('a new row is a rep, but for a fresh org\'s first Admin (the org\'s Clerk admin, while it has no Admin)', () => {
    const l = code(read('netlify/functions/_lib.mjs'));
    assert.ok(l.includes("        let role = 'User';"));
    assert.ok(l.includes("        if (orgRole === 'org:admin') {"));
    assert.ok(l.includes(".where(and(eq(users.orgId, orgId), eq(users.role, 'Admin'))).limit(1);"));
    assert.ok(l.includes("            if (!anAdmin) role = 'Admin';"), 'REGRESSION: once — only while the org has no Admin row at all');
});

test('the first-load link carries an invited row\'s role by EMAIL only; Admin-only role grants; an existing row\'s role is never overwritten by a create', () => {
    const u = code(read('netlify/functions/users.mjs'));
    assert.ok(u.includes('                const matchedByEmail = !!row;'), 'the email match is remembered');
    assert.ok(u.includes("                    const linkRole = matchedByEmail && isAppRole(row.role) ? row.role : 'User';"), 'REGRESSION: a row found by display name alone hands over its role');
    assert.ok(u.includes('                                role:        linkRole,'), 'the link writes linkRole');
    assert.ok(!u.includes('realRole'), 'the old link role, from Clerk, is gone');
    assert.ok(u.includes("                if (userRole !== 'Admin' && invites.some((i) => (i.role || 'User') !== 'User')) {"), 'REGRESSION: a Manager invites an Admin — the row\'s role is the role now');
    assert.ok(u.includes("            if (createRole !== 'User' && userRole !== 'Admin') {"), 'a Manager adds reps only');
    assert.ok(u.includes('            const { id, role: _keepStoredRole, ...updateData } = clean;'), 'REGRESSION: a create naming an existing id rewrites its role');
    assert.ok(!/publicMetadata:\s*\{\s*role:/.test(u), 'the Clerk invitation carries no role — the row is the one place it lives');
});

test('user-role changes one org\'s row, writes nothing to Clerk, and lets an invited row\'s role be set', () => {
    const r = code(read('netlify/functions/user-role.mjs'));
    assert.ok(!/updateUser\(|updateUserMetadata\(/.test(r), 'REGRESSION: the role is written to Clerk\'s user-level metadata again — every org at once');
    assert.ok(r.includes('            .where(and(eq(users.id, targetUserId), eq(users.orgId, orgId)))\n            .returning({ id: users.id });'), 'this org\'s row');
    assert.ok(r.includes("            return { statusCode: 500, headers, body: JSON.stringify({ error: 'The role was not saved. Try again.' }) };"), 'the write is the change itself — a miss is an error, not a warning');
    assert.ok(!r.includes('has not accepted their invitation yet'), 'an invited row\'s role may be set before they accept');
    assert.ok(r.includes("        const priorRole = target.role || 'User';"));
});

test('the MFA panel labels people by their role in this org', () => {
    const m = code(read('netlify/functions/clerk-mfa-status.mjs'));
    assert.ok(m.includes("            const role    = roleIn.get(user.id) || 'User';"));
    assert.ok(!/member\.role/.test(m), 'never the Clerk org membership role');
});

test('invite-user.mjs is gone — it set a role on Clerk\'s user record, unvalidated, and nothing called it', () => {
    assert.equal(existsSync(new URL('netlify/functions/invite-user.mjs', ROOT)), false);
});

// ── the client ─────────────────────────────────────────────────────────────

test('App.jsx: the role is the profile\'s, only while the profile is this org\'s; a late answer for another org is dropped', () => {
    const s = code(read('src/App.jsx'));
    assert.ok(s.includes('    const [myProfileOrgId, setMyProfileOrgId] = React.useState(null);'));
    assert.ok(s.includes('    const roleKnown = !!myProfile && !!activeOrgId && myProfileOrgId === activeOrgId;'), 'REGRESSION: the last org\'s role on screen in the next org after a switch');
    assert.ok(s.includes("    const userRole  = (roleKnown && myProfile.role) || 'User';"));
    assert.ok(s.includes('        if (prevOrgIdRef.current !== meOrgId) return;'), 'an answer for an org the user has left is dropped');
    assert.ok(s.includes('            setMyProfileOrgId(meOrgId);'));
    assert.ok(s.includes('    const managedReps = new Set((roleKnown && myProfile.managedReps) || []);'));
    assert.ok(!/clerkUser\??\.publicMetadata/.test(s), 'REGRESSION: the client reads Clerk\'s user-level metadata for a role again');
});
