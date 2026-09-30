// tests/role-vocabulary.test.mjs
//
// One vocabulary, one list, and a write gate that ALLOWS rather than DENIES.
//
// Every assertion here is written to fail if the code under test is removed —
// 18b22: `assert.equal(requireWrite({userRole:'Admin'}), null)` passes with or
// without an allowlist, because 'Admin' was permitted under both. The outcome
// that DIVERGES is what an unrecognised role gets:
//
//     blocklist (before)   'readonly' is not 'ReadOnly'  ->  null, WRITE ALLOWED
//     allowlist  (after)   'readonly' is not a role      ->  403
//
// so the unrecognised cases carry the weight and the recognised ones only prove
// the gate did not close over everybody.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APP_ROLES, isAppRole, requireWrite, canSeeAll, isAdmin } from '../netlify/functions/auth.mjs';

const H = { 'Content-Type': 'application/json' };
const ev = (httpMethod = 'PUT') => ({ httpMethod });
const write = (userRole, opts) => requireWrite({ userRole, userId: 'user_test' }, ev(), H, opts);
const errorOf = (res) => JSON.parse(res.body).error;

// ── The list ────────────────────────────────────────────────────────────────

test('APP_ROLES is the six roles auth.mjs actually checks, and is frozen', () => {
    assert.deepEqual([...APP_ROLES], ['Admin', 'Manager', 'User', 'ReadOnly', 'Technician', 'Dispatcher']);
    assert.ok(Object.isFrozen(APP_ROLES));
});

test('isAppRole accepts the six and refuses everything else', () => {
    for (const r of APP_ROLES) assert.equal(isAppRole(r), true, r);
    // Each of these has been in this codebase, in a role field, in the last week:
    //   'member'/'admin'  Clerk ORG membership roles, via users-sync's old fallback
    //   'Sales Rep'       the display LABEL, seeded into the invite rows as a value
    for (const r of ['member', 'admin', 'Admin ', 'ADMIN', 'Sales Rep', 'readonly', 'Read Only',
                     'technician', 'user', 'dispatcher', 'Dispatch', '', null, undefined, 0, {}]) {
        assert.equal(isAppRole(r), false, JSON.stringify(r));
    }
});

// ── The gate ────────────────────────────────────────────────────────────────

test('the three write roles may write', () => {
    for (const r of ['Admin', 'Manager', 'User']) assert.equal(write(r), null, r);
});

test('ReadOnly is refused, and still says so', () => {
    const res = write('ReadOnly');
    assert.equal(res.statusCode, 403);
    assert.match(errorOf(res), /read-only/i);
});

test('Technician is refused by default and allowed only by explicit opt-in', () => {
    const res = write('Technician');
    assert.equal(res.statusCode, 403);
    assert.match(errorOf(res), /technician/i);
    assert.equal(write('Technician', { allowTechnician: true }), null);
});

// THE DIVERGING CASE. Under the old blocklist every one of these returned null
// and carried full write access to every endpoint that calls requireWrite.
test('an UNRECOGNISED role is refused — this is what the blocklist allowed', () => {
    for (const r of ['member', 'admin', 'Sales Rep', 'readonly', 'Read Only', 'technician',
                     'Superuser', '', null, undefined]) {
        const res = write(r);
        assert.ok(res, `expected a 403 for ${JSON.stringify(r)}, got null (write allowed)`);
        assert.equal(res.statusCode, 403, JSON.stringify(r));
    }
});

test('the four refusals stay distinguishable', () => {
    // §0.38 verified the rep path by checking an ownership 403 could be told apart
    // from a role 403. Same requirement one layer up: "read-only", "technician",
    // "dispatcher" and "unrecognised" are four different problems with four
    // different fixes, and a single generic message would make them one
    // unactionable report.
    const msgs = [write('ReadOnly'), write('Technician'), write('Dispatcher'), write('member')].map(errorOf);
    assert.equal(new Set(msgs).size, 4, msgs.join(' | '));
    assert.match(errorOf(write('member')), /unrecognised/i);
    assert.match(errorOf(write('Dispatcher')), /dispatcher/i);
});

test('a Dispatcher writes no CRM record — there is no opt-in for them (§0.151)', () => {
    // They read the whole CRM (crmReadScope) and run Dispatch, whose endpoints
    // gate on their own. The Technician's opt-in must not open the gate for them.
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        const res = requireWrite({ userRole: 'Dispatcher', userId: 'user_test' }, ev(m), H);
        assert.equal(res?.statusCode, 403, m);
    }
    assert.equal(write('Dispatcher', { allowTechnician: true })?.statusCode, 403, 'the technician opt-in is not a dispatcher opt-in');
    assert.equal(requireWrite({ userRole: 'Dispatcher' }, ev('GET'), H), null, 'reads pass the write gate');
});

test('a non-mutating method passes through whatever the role says', () => {
    for (const r of ['ReadOnly', 'member', 'Technician', undefined]) {
        assert.equal(requireWrite({ userRole: r }, ev('GET'), H), null, String(r));
    }
});

test('canSeeAll and isAdmin do not widen for a lookalike', () => {
    assert.equal(canSeeAll('Admin'), true);
    assert.equal(canSeeAll('Manager'), true);
    for (const r of ['admin', 'ADMIN', 'manager', 'member', 'User']) {
        assert.equal(canSeeAll(r), false, r);
        assert.equal(isAdmin(r), false, r);
    }
    // The Dispatcher reads the whole org through crmReadScope, NOT through
    // canSeeAll — canSeeAll is the write authority over other people's records.
    assert.equal(canSeeAll('Dispatcher'), false, 'a whole-org READER is not a whole-org WRITER (§18b45)');
});

// ── Source guards: the SHAPE, not the four instances that were found ─────────
//
// 18b23.2. Each of these describes a class that produced a live defect, so the
// guard has to outlive the instance. Read as text for the reason given
// throughout: these files import db/index.js (TypeScript) and cannot be imported
// by `npm test`.

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('no second role list — only src/utils/roles.js enumerates the roles', () => {
    // A copy that agrees today is edited by someone else tomorrow. user-role.mjs
    // carried VALID_ROLES; UsersDetail, UserModal, FlsDetail and the Clerk check
    // script each carried their own — five copies, and a role added to one went
    // missing from the next (§0.151).
    for (const f of ['netlify/functions/user-role.mjs', 'netlify/functions/users.mjs',
                     'netlify/functions/users-sync.mjs']) {
        assert.ok(!/VALID_ROLES|ROLE_VALUES/.test(read(f)), `${f} declares its own role list`);
        assert.match(read(f), /from '\.\/auth\.mjs'/, `${f} must take the vocabulary from auth.mjs`);
    }
    const roleList = /\[\s*['"]Admin['"]\s*,\s*['"]Manager['"]/;
    assert.match(read('src/utils/roles.js'), /export const APP_ROLES = Object\.freeze\(\[/, 'the one list lives in roles.js');
    const auth = read('netlify/functions/auth.mjs');
    assert.ok(!roleList.test(auth) && !/APP_ROLES\s*=/.test(auth), 'auth.mjs declares a role list again — it re-exports roles.js');
    assert.match(auth, /from '\.\.\/\.\.\/src\/utils\/roles\.js'/);
    for (const [f, from] of [
        ['src/Tabs/settings/people/UsersDetail.jsx', "'../../../utils/roles.js'"],
        ['src/components/modals/UserModal.jsx', "'../../utils/roles.js'"],
        ['src/Tabs/settings/security/FlsDetail.jsx', "'../../../utils/roles.js'"],
        ['scripts/check-clerk-roles.mjs', "'../src/utils/roles.js'"],
    ]) {
        const src = read(f);
        assert.ok(!roleList.test(src), `${f} declares its own role list again`);
        assert.ok(!/value:\s*'Technician'/.test(src), `${f} declares its own role options again`);
        assert.ok(src.includes(`from ${from}`), `${f} must take the roles from src/utils/roles.js`);
    }
});

test("Clerk's ORG membership role is not a source for the app role", () => {
    // `member.role.replace('org:', '')` is where `admin` and `member` entered the
    // roster. org:admin governs the Clerk organization, not this application.
    const sync = read('netlify/functions/users-sync.mjs');
    assert.ok(!/member\.role\s*\?\.\s*replace|member\.role\.replace/.test(sync),
        'users-sync is deriving an app role from the Clerk org membership role again');
    assert.match(sync, /isAppRole\(rawRole\)/, 'users-sync must validate the role it mirrors');
});

test('flatten() lets the column win over the profile blob', () => {
    // profile.userType is a copy of the role frozen at row creation. Spread AFTER
    // the scalars it silently overrides users.role on every response, which is the
    // field the entire Users UI was reading.
    const src = read('netlify/functions/users.mjs');
    const block = src.slice(src.indexOf('const flatten = (row) => ({'));
    const spread = block.indexOf('...(row.profile');
    const column = block.indexOf('role:          row.role');
    assert.ok(spread > -1 && column > -1, 'flatten() no longer looks the way this guard expects');
    assert.ok(spread < column,
        'the profile blob is spread after the role column and will override it again');
});

test('the role SELECTs cannot silently present an unmatched value as the first option', () => {
    // A <select> whose value matches no <option> renders the first one. A user
    // stored as `member` therefore displayed as "Admin", and one click on the
    // dropdown submitted that as a deliberate choice.
    const detail = read('src/Tabs/settings/people/UsersDetail.jsx');
    assert.match(detail, /const RoleSelect = /, 'UsersDetail must route role selects through RoleSelect');
    assert.ok(!/<select[^>]*value=\{(form|r)\.role/.test(detail),
        'a raw <select> is bound to a role again — use RoleSelect');
    assert.match(read('src/components/modals/UserModal.jsx'), /KNOWN_ROLES\.includes/,
        'UserModal must render an unrecognised stored role as itself');
});

test('the invite rows are seeded with a role VALUE, never a display label', () => {
    // Scoped to the two SEEDS. 'Sales Rep' remains correct as a label elsewhere in
    // this file (the ROLE_OPTIONS label, the seat-breakdown row), so a blanket
    // search for the string would fail on legitimate uses and get deleted.
    const detail = read('src/Tabs/settings/people/UsersDetail.jsx');
    assert.ok(!/useState\('Sales Rep'\)/.test(detail),
        "defaultRole is seeded with the label 'Sales Rep' again — the value is 'User'");
    assert.match(detail, /\{ id:1, email:'', role:'User'/,
        'the first invite row must be seeded with a role value from APP_ROLES');
});
