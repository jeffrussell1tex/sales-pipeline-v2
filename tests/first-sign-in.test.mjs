// tests/first-sign-in.test.mjs (state §0.295; OPEN_ITEMS §4.2, "Left by §0.294" (c))
// A member's first sign-in: users?me=true links the row their invitation made, or makes one — while the app's lists, asked
// beside it, are answered for a caller with no row here: short, or empty, and read as read. The answer says it happened
// (`joined`), the app reads each list again (tests/list-loads.test.mjs), and a caller with no row is never cached, so the
// second read is answered for the member they now are. The real handlers on the gate matrix's engine, no database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOT, ask, load } from './gates/engine.mjs';

const G = globalThis.__gates;
const lib = await import(new URL('netlify/functions/_lib.mjs', ROOT).href);
const ROW = { id: 'usr_me', clerkUserId: 'user_me', orgId: 'org_a', name: 'New Member', email: 'new@test.local', role: 'User', active: true, profile: { status: 'Active' } };
const INVITED = { ...ROW, clerkUserId: null, active: false, profile: { status: 'Invited' } };
const CLERK = { id: 'user_me', firstName: 'New', lastName: 'Member', emailAddresses: [{ emailAddress: 'new@test.local' }] };

// users?me=true, the users table's selects answered in turn (the last for every one after), its writes as given.
const signIn = async (selects, writes = () => [ROW]) => {
    let n = 0, res;
    const users = await load('users');
    G.clerkUser = CLERK;
    const rows = (op) => {
        if (op.table !== 'users') return [];
        if (op.kind !== 'select') return writes(op);
        return selects[Math.min(n++, selects.length - 1)];
    };
    try { await ask(async (e, c) => (res = await users(e, c)), 'users', { method: 'GET', qs: { me: 'true' }, rows }, 'User'); } finally { delete G.clerkUser; }
    return { status: res.statusCode, body: JSON.parse(res.body) };
};

test('users?me=true says a first sign-in: an invited row linked, a row made, one a racing request made — and nothing for a member already here', async () => {
    for (const updatedAt of [undefined, null, 'not a day', new Date('2026-01-05T12:00:00Z'), new Date(Date.now() - 3 * 60 * 1000), new Date(Date.now() + 3 * 60 * 1000)]) {
        const here = await signIn([[{ ...ROW, updatedAt }]]);
        assert.deepEqual([here.status, here.body.user.id, 'joined' in here.body], [200, 'usr_me', false], `a member already here (${updatedAt}): the lists are theirs as answered`);
    }
    // The answer that said so was lost, or overtaken, and the request asked again; or another tab's asked first.
    const again = await signIn([[{ ...ROW, updatedAt: new Date(Date.now() - 30 * 1000) }]]);
    assert.deepEqual([again.status, again.body.joined], [200, true], 'REGRESSION: a join whose answer was lost leaves the lists as answered to no one');
    const linked = await signIn([[], [INVITED]]);
    assert.deepEqual([linked.status, linked.body.user.id, linked.body.joined], [200, 'usr_me', true], 'REGRESSION: an invited member keeps the lists they were answered as no one');
    const made = await signIn([[], [], []]);
    assert.deepEqual([made.status, made.body.user?.id, made.body.joined], [200, 'usr_me', true], 'a row made');
    const raced = await signIn([[], [INVITED], [ROW]], () => { throw new Error('duplicate key'); });
    assert.deepEqual([raced.status, raced.body.user.id, raced.body.joined], [200, 'usr_me', true], 'their row, made meanwhile: the lists were asked before it');
});

test('no row, no joining: none could be made — the lists stand as answered; a row turned off is refused, not joined', async () => {
    const THEIRS = [{ ...ROW, id: 'usr_other', clerkUserId: 'user_other' }];
    const none = await signIn([[], THEIRS, [], THEIRS], () => []);   // by Clerk id, by address; then again as a row would be made
    assert.deepEqual([none.status, none.body.user, 'joined' in none.body], [200, null, false], 'another identity holds the address');
    const off = await signIn([[], [{ ...INVITED, profile: { status: 'Deactivated' } }]], () => [{ ...ROW, active: false, profile: { status: 'Deactivated' } }]);
    assert.deepEqual([off.status, off.body.code, 'joined' in off.body], [403, 'deactivated', false]);
});

test('a caller with no row here is never cached: the next request is answered for the row linked or made since; a row that is there is, for the 30 seconds', async () => {
    lib.invalidateRoster();
    let reads = 0, rows = [];
    G.rows = (op) => { if (op.table === 'users' && op.kind === 'select') { reads += 1; return rows; } return []; };
    const caller = () => lib.resolveCaller('user_joining', 'org_a');
    assert.deepEqual([await caller(), await caller(), reads], [{ id: null, name: null }, { id: null, name: null }, 2], 'REGRESSION: a miss is kept — the lists read again after the link are still nobody\'s');
    rows = [{ ...ROW, clerkUserId: 'user_joining' }];
    assert.deepEqual([await caller(), reads], [{ id: 'usr_me', name: 'New Member' }, 3]);
    rows = [];
    assert.deepEqual([await caller(), reads], [{ id: 'usr_me', name: 'New Member' }, 3], 'a row found is kept');
    assert.deepEqual(await lib.resolveCaller('user_joining', 'org_b'), { id: null, name: null }, 'in its own org alone');
    lib.invalidateRoster('org_a');
    assert.deepEqual([await caller(), reads], [{ id: null, name: null }, 5]);
    lib.invalidateRoster();
});
