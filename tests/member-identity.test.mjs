// A member's save changes a member this org holds, never takes the login link or
// the status, and a Manager's reaches only a Sales Rep's row (state §0.202, guide
// §18b95). Read in code, 15 Oct (batch 4b-2's map, then its review): the users
// PUT checked no target role — though delete and deactivate did (§0.164, §0.165)
// — and wrote the clerkUserId and status its body sent, so a Manager could unlink
// an Admin (who then reads as a rep), re-address a not-yet-joined Manager's row
// and invite the new address into that role, or switch a deactivated member back
// on; a Manager's re-invitation did that last for an Admin's row too; a PUT of an
// id this org does not hold inserted a member; a create stored any link; the
// member's own save re-inserted a removed member; and an Admin's profile page
// re-sent `active` as loaded. The behaviour runs against the real test database
// in tests/integration/member-identity.itest.mjs; these scans pin it where the
// mutation harness can reach it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const code = (src) => src.split(/\r?\n/).filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
const between = (s, from, to) => {
    const a = s.indexOf(from);
    assert.ok(a > -1, `missing: ${from}`);
    const b = s.indexOf(to, a + from.length);
    assert.ok(b > -1, `missing after it: ${to}`);
    return s.slice(a, b);
};
const order = (s, ...parts) => {
    let at = -1;
    for (const p of parts) {
        const i = s.indexOf(p, at + 1);
        assert.ok(i > at, `out of order or missing: ${p}`);
        at = i;
    }
};

const U = () => code(read('netlify/functions/users.mjs'));

test('the merge keeps the stored login link, status and access, whatever the body says — every PUT (an Admin\'s, a Manager\'s, the member\'s own) builds its row through it; access changes only by the Deactivate / Reactivate request', () => {
    const u = U();
    assert.ok(u.includes("    const isAccessChange = (data) => 'active' in data && Object.keys(data).every((k) => k === 'id' || k === 'active');"));
    const merge = between(u, '    const mergeForUpdate = async (data) => {', '\n    };');
    order(merge,
        '.where(and(eq(users.id, data.id), eq(users.orgId, orgId)));',
        '        if (!existing) return { ...data, clerkUserId: null, status: null };',
        '            ...flatten(existing), ...data,',
        '            clerkUserId: existing.clerkUserId || null,',
        '            status:      existing.profile?.status || null,',
        '            active:      isAccessChange(data) ? data.active : existing.active,');
});

test('a create stores no login link, status or access — a member starts on; a sign-in by its email, or an Admin\'s sync, links it', () => {
    assert.ok(U().includes('                const clean = withRole(sanitize({ ...data, status: null, active: true, id: newUserId(), clerkUserId: null }), createRole);'),
        'REGRESSION: a create stores the login link, the status or the access it is sent');
});

test('every sanitize() in users.mjs is one of the four known — each says where its login link comes from', () => {
    const u = U();
    // Every mention outside a comment — a call however it is spelled or broken, or the
    // function handed on as a value (rows.map(sanitize), sanitize.call): the line each is on.
    const calls = u.split('\n').filter((l) => /\bsanitize\b/.test(l)).map((l) => l.trim());
    assert.deepEqual(calls, [
        'const sanitize = (data) => ({',                                                                             // the definition
        'const clean = withRole(sanitize({ ...(await mergeForUpdate(own)), userType: storedRole }), storedRole);',   // the self PUT: the merge's, then the caller's pinned
        'const row = await upsertUser(withRole(sanitize({',                                                          // an invitation: no body spread, no link
        'const clean = withRole(sanitize({ ...data, status: null, active: true, id: newUserId(), clerkUserId: null }), createRole);',   // a create: none
        'const clean  = withRole(sanitize({ ...merged, userType: storedRole }), storedRole);',                       // the PUT: the merge's
    ], 'a new sanitize() — decide its clerkUserId (the stored one, the caller\'s, or null), then list it here');
    const invite = between(u, '                            const row = await upsertUser(withRole(sanitize({', '}), invite.role || \'User\'));');
    assert.ok(!/\.\.\.|clerkUserId/.test(invite), 'the invitation\'s row is built field by field — no body spread, no link');
});

test('the PUT asks for its member first: none in this org is a 404, and a Manager reaches only a Sales Rep\'s row (403) — before anything is merged or written', () => {
    const put = between(U(), "        if (event.httpMethod === 'PUT') {", "        if (event.httpMethod === 'DELETE') {");
    order(put,
        "            if (!data.id || typeof data.id !== 'string') {",
        "                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };",
        "            if ('active' in data && typeof data.active !== 'boolean') {",
        "                return { statusCode: 400, headers, body: JSON.stringify({ error: 'active must be true or false.' }) };",
        '            const [target] = await db.select({ role: users.role }).from(users)',
        '                .where(and(eq(users.id, data.id), eq(users.orgId, orgId)));',
        '            if (!target) {',
        "                return { statusCode: 404, headers, body: JSON.stringify({ error: 'That member is not in your organization — they may have been removed. Reload and try again.' }) };",
        "            if (userRole !== 'Admin' && target.role !== 'User') {",
        "                return { statusCode: 403, headers, body: JSON.stringify({ error: 'Only an Admin can change a member who is not a Sales Rep.' }) };",
        '                const merged = await mergeForUpdate(data);',
        '                const result = await upsertUser(clean, { updateOnly: true });',
        '                if (!result) {',
        "                    return { statusCode: 404, headers, body: JSON.stringify({ error: 'That member is not in your organization — they may have been removed. Reload and try again.' }) };");
});

test('upsertUser\'s update-only mode is an update of this org\'s row — never an insert; a create still inserts; a taken email is EMAIL_DUPLICATE', () => {
    const up = between(U(), '        const upsertUser = async (clean, { updateOnly = false } = {}) => {', "        if (event.httpMethod === 'POST') {");
    order(up,
        '                const [row] = updateOnly',
        '                    ? await db.update(users).set({ ...updateData, updatedAt: new Date() })',
        '                        .where(and(eq(users.id, id), eq(users.orgId, orgId))).returning()',
        '                    : await db',
        '                    .insert(users)',
        '                        target: users.id, setWhere: eq(users.orgId, orgId),',
        '                if (isEmailTaken(err)) {',
        '                    const dupErr = new Error(EMAIL_TAKEN);',
        "                    dupErr.code = 'EMAIL_DUPLICATE';");
    assert.equal((U().match(/upsertUser\(clean, \{ updateOnly: true \}\)/g) || []).length, 1, 'the PUT is the one update-only caller');
});

test('a taken email is one test, said one way: the driver\'s 23505, on the email — never the wrapper\'s SQL text', () => {
    const u = U();
    order(between(u, '    const isEmailTaken = (err) => {', '    };'),
        '        const pg = err?.cause || err;',
        "        const unique = err?.code === '23505' || pg?.code === '23505' || /duplicate key value violates unique constraint/i.test(pg?.message || '');",
        "        return unique && /email/i.test([pg?.constraint, pg?.detail, pg?.message].filter(Boolean).join(' '));");
    assert.ok(u.includes("    const EMAIL_TAKEN = 'A user with that email address already exists in this organization. Please use a different email.';"));
    assert.equal((u.match(/isEmailTaken\(err\)/g) || []).length, 2, 'upsertUser and the self-save');
});

test('the member\'s own save is update-only: a row removed since the caller cache read it is a 404, never inserted again; a taken email is the 409', () => {
    const self = between(U(), "    if (event.httpMethod === 'PUT' && event.queryStringParameters?.me === 'true') {", '    const wholeOrgReader = ');
    assert.ok(!self.includes('.insert(users)'), 'REGRESSION: the self-save inserts a row');
    order(self,
        '            let saved;',
        '                [saved] = await db',
        '                    .update(users)',
        '                    .set({ ...updateData, clerkUserId: userId, updatedAt: new Date() })',
        '                    .where(and(eq(users.id, data.id), eq(users.orgId, orgId)))',
        "                if (isEmailTaken(err)) return { statusCode: 409, headers, body: JSON.stringify({ error: EMAIL_TAKEN, field: 'email' }) };",
        '                throw err;',
        '            invalidateRoster(orgId);',
        '            if (!saved) {',
        "                return { statusCode: 404, headers, body: JSON.stringify({ error: 'You are no longer a member of this organization\\'s roster. Reload the page.' }) };",
        '            return { statusCode: 200, headers, body: JSON.stringify({ user: flatten(saved) }) };');
});

test('a Manager\'s invitation to an address a member holds only resends a Sales Rep\'s open invitation — asked before Clerk is called', () => {
    const inv = between(U(), "            if (data.action === 'invite') {", "            const createRole = data.userType || data.role || 'User';");
    order(inv,
        '                    if (newRow && !rowName) {',
        "                    if (userRole !== 'Admin') {",
        '                        const [held] = await db.select({ role: users.role, clerkUserId: users.clerkUserId, profile: users.profile }).from(users)',
        '                            .where(and(eq(users.email, email), eq(users.orgId, orgId)));',
        "                        if (held && !(isOpenInvitationRow(held) && held.role === 'User')) {",
        "                            errors.push({ email, error: 'Only an Admin can invite an address a member of this organization already holds. A Manager can only resend a Sales Rep\\'s open invitation.' });",
        '                            continue;',
        '                    try {',
        '                        await clerk.organizations.createOrganizationInvitation({',
        "                            const mergedProfile = { ...(existingRow.profile || {}), status: 'Invited' };");
});

test('the member form sends what it edits — not what it only shows (team, territory, vertical), nor the member\'s pins or login', () => {
    const h = code(read('src/hooks/useUserHandlers.js'));
    const edit = between(h, '        if (editingUser) {', "                const res = await dbFetch('/.netlify/functions/users', {");
    order(edit,
        '            const { team: _t, teamId: _ti, territory: _tr, vertical: _v, pinnedReports: _p, clerkUserId: _c, ...fields } = userData;',
        "            const payload = { ...fields, id: editingUser.id, email: userData.email || editingUser.email || '' };");
});

test('the member profile page (Settings → Users) sends what it edits — never access (active, status) or the login as loaded', () => {
    const s = code(read('src/Tabs/settings/people/UsersDetail.jsx'));
    const profile = between(s, 'const UserProfilePage = ', 'export const UsersDetail = ');
    order(between(profile, '    const handleSave = async () => {', "body:JSON.stringify(toSave) });"),
        '            const { active: _active, status: _status, clerkUserId: _login, ...edited } = form;',
        '            const toSave = { ...edited, teamId: teamIdNamed(settings.teams, form.team) };');
    assert.ok(!/JSON\.stringify\(\{?\s*\.\.\.form/.test(profile), 'the form as loaded is never what is sent');
});

test('the Sales Manager tab: the Annual / Quarterly switch is an Admin\'s, and a refused save shows the server\'s words, naming the member', () => {
    const m = code(read('src/Tabs/SalesManagerTab.jsx'));
    order(between(m, 'function AdminTab(', 'export default function SalesManagerTab() {'),
        '                    {!isAdmin && (',
        "<span style={{ fontSize:10, fontWeight:700, color:T.inkMid, fontFamily:T.sans }}>{quotaMode==='annual'?'Annual quotas':'Quarterly quotas'}</span>",
        "                    {isAdmin && <div style={{ display:'flex', background:T.surface2, borderRadius:T.r, padding:2, gap:2 }}>",
        '<button key={t} onClick={()=>setAllQuotaMode(t)}',
        '                    </div>}');
    order(between(m, '    const setAllQuotaMode = async (mode) => {', '    };'),
        '        if (!isAdmin) return;',
        '        const askedOrg = requestOrg();');
    order(between(m, '    const saveUser = async (user, label) => {', '    };'),
        '            if (!res.ok) {',
        '                const d = await res.json().catch(() => ({}));',
        "                setSaveState({ status: 'error', msg: d.error",
        "                    ? `Not saved \\u2014 ${user.name || 'a member'}: ${d.error}`");
});
