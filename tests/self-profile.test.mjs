// tests/self-profile.test.mjs
//
// The self-profile save takes an allowlist of what a member may change about
// themselves (state §0.109, guide §18b34). Before it, `PUT /users?me=true`
// merged the WHOLE body: the role column was already pinned to the stored
// value, but quota, team, territory, the quarterly quotas and `active` were
// rewritten from the caller's body on every preference toggle — and could be
// set by a body written by hand. The profile blob's `userType` copy was taken
// from the body too.
//
// The pure module is exercised directly. The endpoint is behind Clerk, so its
// use of the module is pinned by source scan (§18b23) and proven against the
// real test database in tests/integration/users-self.itest.mjs. The last test
// reads the profile panel: every key it sends must be on the list, or a save
// there would be dropped silently on the server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SELF_EDITABLE_KEYS, pickSelfEditable } from '../netlify/functions/_selfProfile.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

// Every administrative key sanitize() builds, plus the identity columns. None
// may ever be self-editable; a mutant that adds one to the list fails here.
const ADMIN_ONLY = [
    'id', 'orgId', 'clerkUserId', 'name',
    'role', 'userType', 'active', 'status',
    'team', 'teamId', 'territory', 'vertical', 'manager', 'teamJoinedAt',
    'quota', 'annualQuota', 'q1Quota', 'q2Quota', 'q3Quota', 'q4Quota', 'quotaType',
    'forecastCalls',
];

test('the allowlist is frozen, carries the personal fields, and none of the administrative ones', () => {
    assert.ok(Object.isFrozen(SELF_EDITABLE_KEYS));
    for (const k of ['firstName', 'lastName', 'email', 'phone', 'mobile', 'title', 'emailSignature',
                     'notificationPrefs', 'digestTime', 'smsNotifications', 'timezone']) {
        assert.ok(SELF_EDITABLE_KEYS.includes(k), `${k} must be self-editable — the profile panel sends it`);
    }
    for (const k of ADMIN_ONLY) {
        assert.ok(!SELF_EDITABLE_KEYS.includes(k), `${k} must NOT be self-editable`);
    }
});

test('pickSelfEditable keeps only listed keys that are PRESENT — an explicit empty or null included — and drops the rest', () => {
    const body = {
        id: 'usr_1', firstName: 'A', phone: '', timezone: null,
        role: 'Admin', userType: 'Admin', quota: 1, annualQuota: 1, team: 'West', teamId: 't9',
        territory: 'S', active: false, status: 'Inactive', clerkUserId: 'clerk_x', forecastCalls: { '2026-Q4': { commit: 9 } },
    };
    assert.deepEqual(pickSelfEditable(body), { firstName: 'A', phone: '', timezone: null });
    // A key that is absent stays absent: no `undefined` reaches the merge to
    // overwrite a stored value.
    assert.deepEqual(Object.keys(pickSelfEditable({ role: 'Admin' })), []);
    assert.deepEqual(pickSelfEditable({}), {});
});

test('users.mjs: the me branch merges only the allowlisted keys and pins the blob role copy; the Admin PUT pins it too', () => {
    const s = code(read('netlify/functions/users.mjs'));
    assert.ok(s.includes("import { pickSelfEditable } from './_selfProfile.mjs';"), 'imports the allowlist');
    assert.ok(s.includes('const own  = { id: data.id, ...pickSelfEditable(data) };'),
        'the me branch builds the merge input from the allowlist, keeping only the id from the raw body');
    assert.ok(s.includes('const clean = withRole(sanitize({ ...(await mergeForUpdate(own)), userType: storedRole }), storedRole);'),
        'the me branch pins profile.userType to the stored role — flatten() used to read the role from that blob');
    assert.ok(!s.includes('sanitize(await mergeForUpdate(data))'), 'the raw body must not reach the self-profile merge');
    assert.ok(s.includes('const clean  = withRole(sanitize({ ...merged, userType: storedRole }), storedRole);'),
        'the Admin PUT pins the blob copy as well');
});

// Top-level keys of every object literal passed to saveProfile({ ... }) in the
// profile panel, by brace depth — the literals nest (notificationPrefs: { ... }).
const saveProfileKeys = (src) => {
    const keys = new Set();
    let i = 0;
    for (;;) {
        const at = src.indexOf('saveProfile({', i);
        if (at < 0) break;
        let depth = 0, j = at + 'saveProfile('.length, start = j;
        for (; j < src.length; j++) {
            const ch = src[j];
            if (ch === '{') depth++;
            else if (ch === '}') { depth--; if (depth === 0) break; }
        }
        const body = src.slice(start + 1, j);
        // Top-level `key:` or shorthand `key,` — strip nested braces first.
        let flat = '', d = 0;
        for (const ch of body) {
            if (ch === '{') d++;
            else if (ch === '}') d--;
            else if (d === 0) flat += ch;
        }
        for (const part of flat.split(',')) {
            const m = part.trim().match(/^([A-Za-z_$][\w$]*)\s*(?::|$)/);
            if (m) keys.add(m[1]);
        }
        i = j;
    }
    return keys;
};

test('every key the profile panel sends through saveProfile is self-editable — nothing it saves is dropped on the server', () => {
    const keys = saveProfileKeys(read('src/components/layout/AppHeader.jsx'));
    assert.ok(keys.size >= 8, `expected the panel's saves to be found — got ${[...keys].join(', ')}`);
    for (const k of keys) {
        assert.ok(SELF_EDITABLE_KEYS.includes(k), `AppHeader saves "${k}" but the server would drop it`);
    }
});
