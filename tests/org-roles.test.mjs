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
    assert.ok(c.includes("    return { role: row.role, managedReps: Array.isArray(reps) ? reps : [], active: row.active !== false };"), 'a Manager\'s reps come from the same row');
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

// ── §0.164 — deactivated means no access; the modal's role; the Clerk cleanup ──

test('a deactivated row has no access in its org: verifyAuth refuses it with a code, uncached; the roster endpoint passes the code on', () => {
    const a = code(read('netlify/functions/auth.mjs'));
    const at = a.indexOf('        if (row && row.active === false) {');
    assert.ok(at > 0, 'REGRESSION: a deactivated member is let in');
    assert.ok(a.slice(at, at + 260).includes("status: 403, code: 'deactivated' };"), 'refused with the code the app reads');
    assert.ok(at < a.indexOf('            authCache.set(token, { result, ts: Date.now() });'), 'before the cache — a refusal is never cached');
    const c = code(read('netlify/functions/_callerRole.mjs'));
    assert.ok(c.includes('    const [row] = await db.select({ role: users.role, profile: users.profile, active: users.active })'));
    assert.ok(c.includes("    return { role: row.role, managedReps: Array.isArray(reps) ? reps : [], active: row.active !== false };"));
    const u = code(read('netlify/functions/users.mjs'));
    assert.ok(u.includes("        return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error, ...(auth.code ? { code: auth.code } : {}) }) };"));
});

test('only an Admin deactivates or reactivates, never themselves; the status says why a row is off; the first-load link keeps a deactivated row off', () => {
    const u = code(read('netlify/functions/users.mjs'));
    assert.ok(u.includes('                if (before && wasActive !== nowActive) {'));
    assert.ok(u.includes("                    if (userRole !== 'Admin') {"), 'REGRESSION: a Manager takes access away');
    assert.ok(u.includes('                    if (!nowActive && before.clerkUserId && before.clerkUserId === userId) {'), 'REGRESSION: an Admin deactivates themselves — a lockout');
    assert.ok(u.includes("                    clean.profile = { ...clean.profile, status: nowActive ? (before.clerkUserId ? 'Active' : 'Invited') : 'Deactivated' };"));
    assert.ok(u.includes("                    const stillOff = row.profile?.status === 'Deactivated';"));
    assert.ok(u.includes('                                active:      !stillOff,'), 'REGRESSION: linking switches a deactivated row back on');
    assert.ok(u.includes("                if (row && row.active === false && row.profile?.status === 'Deactivated') {"));
});

test('App.jsx shows a deactivated member its no-access page for that org, and nothing else', () => {
    const s = code(read('src/App.jsx'));
    assert.ok(s.includes('    const [accessRevokedOrg, setAccessRevokedOrg] = React.useState(null);'));
    assert.ok(s.includes("        return body?.code === 'deactivated' ? { deactivated: true } : null;"));
    assert.ok(s.includes('        setAccessRevokedOrg(data?.deactivated ? meOrgId : null);'), 'set for the org that answered, cleared by an answer that is not a refusal');
    assert.ok(s.includes('    if (accessRevokedOrg && accessRevokedOrg === activeOrgId) {'), 'only while that org is the active one');
    assert.ok(s.includes('No access to {organization.name}'));
});

test('the two login-card pages put light text on the card — it is dark in every color scheme, and a T.ink title on it could not be read', () => {
    // index.css: .login-card is rgba(28,25,23,0.85) with no light variant. The
    // no-access page (§0.164) copied the no-organization page, title and all;
    // the pane check found a title nobody could read on both.
    assert.ok(read('src/index.css').includes('background: rgba(28, 25, 23, 0.85);'), 'the card is still the dark one — if it is light now, this test is moot');
    const s = code(read('src/App.jsx'));
    for (const [page, start] of [['no organization', '    if (!organization) {'], ['no access', '    if (accessRevokedOrg && accessRevokedOrg === activeOrgId) {']]) {
        const at = s.indexOf(start);
        assert.ok(at > 0, page);
        const block = s.slice(at, s.indexOf('\n    }\n', at));
        assert.ok(block.includes('className="login-card"'), `${page}: on the dark card`);
        assert.ok(block.includes("<h2 style={{ color: T.surface, fontSize: '1.25rem'"), `REGRESSION: the ${page} title is dark on the dark card again`);
        assert.ok(block.includes("<p style={{ color: T.surfaceInkFg, fontSize: '0.875rem'"), `${page}: the text is the dark-surface foreground`);
        assert.ok(!/color: T\.ink(Mid)?, fontSize: '(1\.25|0\.875)rem'/.test(block), `REGRESSION: dark text on the ${page} card`);
    }
    // Clerk's switcher trigger is dark text by default; the header's dark band
    // (AppHeader.jsx) already dresses it for a dark background.
    const access = s.slice(s.indexOf('    if (accessRevokedOrg && accessRevokedOrg === activeOrgId) {'));
    const switcher = access.slice(access.indexOf('<OrganizationSwitcher'), access.indexOf('/>', access.indexOf('<OrganizationSwitcher')));
    assert.ok(switcher.includes("organizationSwitcherTrigger: {") && switcher.includes('color: T.surface,'),
        "REGRESSION: the no-access switcher is Clerk's dark default on the dark card again");
});

test('the Opportunity modal takes the caller\'s role from context — never a guess by display name, never Admin for an empty roster', () => {
    const m = code(read('src/components/modals/OpportunityModal.jsx'));
    assert.ok(m.includes("    const { userRole: modalUserRole = 'User' } = useApp();"));
    assert.ok(!m.includes('modalUserRecord'), 'REGRESSION: the role is found by display name again');
    assert.ok(!/length === 0 \? 'Admin'/.test(m), 'REGRESSION: an empty roster reads as Admin again');
});

test('the Clerk cleanup removes only role and managedReps, reads first, and needs --live for a live key', () => {
    const s = read('scripts/clear-clerk-roles.mjs');
    assert.ok(s.includes("const KEYS = ['role', 'managedReps'];"), 'nothing else is touched — team, territory and name stay');
    assert.ok(s.includes("            await clerk.users.updateUserMetadata(h.id, { publicMetadata: Object.fromEntries(Object.keys(h.values).map((k) => [k, null])) });"), 'deep merge, null removes — only the keys present');
    assert.ok(s.includes("if (APPLY && instance.startsWith('LIVE') && !LIVE_OK) {"), 'a live key needs --live as well');
    assert.ok(s.includes("const APPLY = process.argv.includes('--apply');"), 'read-only unless --apply');
});

test('a create never overwrites a row: an id already in the org answers 409 — sanitize() builds a FULL row, and an overwrite wiped the Clerk link (§0.164)', () => {
    const u = code(read('netlify/functions/users.mjs'));
    const guard = u.indexOf('                if (taken) {');
    assert.ok(guard > 0, 'REGRESSION: a create naming an existing id overwrites the row again');
    assert.ok(u.slice(guard, guard + 220).includes("return { statusCode: 409, headers, body: JSON.stringify({ error: 'That member already exists — edit them instead.' }) };"));
    assert.ok(guard < u.indexOf('const result = await upsertUser(withRole(sanitize({ ...data, id: data.id || newUserId() }), createRole));'), 'before the upsert');
});
