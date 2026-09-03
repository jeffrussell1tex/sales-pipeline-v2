// tests/integration/coaching-notes.itest.mjs
// Coaching notes addressed to people or a team (state §0.82). These prove the
// endpoint's identity and visibility rules against the real database: author
// stamped from the caller, reps cannot write, a note to people is invisible to
// another manager, a team note obeys the member's first day, read stamps need
// visibility, delete is author-or-Admin, a legacy-flagged payload is an
// ordinary note (the import branch is gone, §0.83), and org B sees nothing of
// org A.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST — and the coaching_notes
// table + users.team_joined_at from db/apply-coaching-notes.mjs --test)

if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            const userRole = event.headers?.['x-test-role'] || 'Admin';
            const userId = event.headers?.['x-test-user'] || 'u_' + orgId;
            return { userId, orgId, userRole, managedReps: [], error: null };
        },
        canSeeAll:    (role) => role === 'Admin' || role === 'Manager',
        isReadOnly:   (role) => role === 'ReadOnly',
        isTechnician: (role) => role === 'Technician',
        requireRole: (auth, allowedRoles, headers) => (
            allowedRoles.includes(auth?.userRole)
                ? null
                : { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: insufficient role' }) }
        ),
        requireWrite: (auth, event, headers) => {
            if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(event?.httpMethod)) return null;
            if (auth?.userRole === 'ReadOnly') return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: read-only access' }) };
            return null;
        },
    },
});

const { handler } = await import('../../netlify/functions/coaching-notes.mjs');
const { db } = await import('../../db/index.js');
const { coachingNotes, users, settings } = await import('../../db/schema.js');
const { eq } = await import('drizzle-orm');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');
const { assertTestSchema } = await import('./_schema-guard.mjs');

// ORG NAMESPACE: this file owns 'itest_cnote_*' (§18b25).
const A = 'itest_cnote_A', B = 'itest_cnote_B';
const ADMIN = 'usr_itest-cnote-admin';   // clerk 'u_' + A
const MGR   = 'usr_itest-cnote-mgr';     // clerk 'u_mgr'  — manages team T1
const MGR2  = 'usr_itest-cnote-mgr2';    // clerk 'u_mgr2' — manages nothing
const REP1  = 'usr_itest-cnote-rep1';    // clerk 'u_rep1' — T1, joined 1 Sep
const REP2  = 'usr_itest-cnote-rep2';    // clerk 'u_rep2' — T1, joined 10 Sep
const REP3  = 'usr_itest-cnote-rep3';    // clerk 'u_rep3' — no team
const T1 = 'itest_cnote_team1';

const ev = (org, method, body, qs, extra) => ({
    httpMethod: method,
    headers: { 'x-test-org': org, 'content-type': 'application/json', ...(extra || {}) },
    body: body ? JSON.stringify(body) : undefined,
    queryStringParameters: qs || {},
});
const as = (role, clerk) => (e) => ({ ...e, headers: { ...e.headers, 'x-test-role': role, 'x-test-user': clerk } });
const asMgr = as('Manager', 'u_mgr'), asMgr2 = as('Manager', 'u_mgr2');
const asRep1 = as('User', 'u_rep1'), asRep2 = as('User', 'u_rep2'), asRep3 = as('User', 'u_rep3');
const idsSeen = async (wrap, org = A) => JSON.parse((await handler(wrap ? wrap(ev(org, 'GET')) : ev(org, 'GET'))).body).coachingNotes.map(n => n.id).sort();
const row = async (id) => (await db.select().from(coachingNotes).where(eq(coachingNotes.id, id)))[0];

const cleanup = async () => {
    for (const o of [A, B]) {
        await db.delete(coachingNotes).where(eq(coachingNotes.orgId, o));
        await db.delete(settings).where(eq(settings.orgId, o));
        await db.delete(users).where(eq(users.orgId, o));
    }
};

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    await db.insert(users).values([
        { id: ADMIN, clerkUserId: 'u_' + A, name: 'Itest Cnote Admin', email: 'cnote-admin@itest.local', role: 'Admin',   orgId: A },
        { id: MGR,   clerkUserId: 'u_mgr',  name: 'Itest Cnote Mgr',   email: 'cnote-mgr@itest.local',   role: 'Manager', orgId: A },
        { id: MGR2,  clerkUserId: 'u_mgr2', name: 'Itest Cnote Mgr2',  email: 'cnote-mgr2@itest.local',  role: 'Manager', orgId: A },
        { id: REP1,  clerkUserId: 'u_rep1', name: 'Itest Cnote Rep1',  email: 'cnote-rep1@itest.local',  role: 'User',    orgId: A, team: 'West', profile: { teamId: T1 }, teamJoinedAt: new Date(2026, 8, 1, 9) },
        { id: REP2,  clerkUserId: 'u_rep2', name: 'Itest Cnote Rep2',  email: 'cnote-rep2@itest.local',  role: 'User',    orgId: A, team: 'West', profile: { teamId: T1 }, teamJoinedAt: new Date(2026, 8, 10, 9) },
        { id: REP3,  clerkUserId: 'u_rep3', name: 'Itest Cnote Rep3',  email: 'cnote-rep3@itest.local',  role: 'User',    orgId: A },
    ]);
    await db.insert(settings).values({ id: 'itest_cnote_settings_A', orgId: A, extra: { teams: [{ id: T1, name: 'West', managerId: MGR, repIds: [REP1, REP2] }] } });
    invalidateRoster();
});
after(cleanup);

test('a Manager writes a note to one rep — 201, author stamped from the CALLER, payload ids ignored', async () => {
    const res = await handler(asMgr(ev(A, 'POST', { id: 'cn_p1', text: 'nice close', date: '2026-09-03', recipientIds: [REP1], authorId: ADMIN })));
    assert.equal(res.statusCode, 201, res.body);
    const r = await row('cn_p1');
    assert.equal(r.authorId, MGR, 'authorId must come from the caller');
    assert.equal(r.authorName, 'Itest Cnote Mgr');
    assert.deepEqual(r.recipientIds, [REP1]);
    assert.equal(r.teamId, null);
    assert.equal(r.legacy, false);
});

test('a rep cannot write; a note needs an audience and a day; an unknown recipient or team is refused', async () => {
    assert.equal((await handler(asRep1(ev(A, 'POST', { id: 'cn_x', text: 'x', date: '2026-09-03', recipientIds: [REP2] })))).statusCode, 403);
    assert.equal((await handler(asMgr(ev(A, 'POST', { id: 'cn_x', text: 'x', date: '2026-09-03' })))).statusCode, 400, 'no audience');
    assert.equal((await handler(asMgr(ev(A, 'POST', { id: 'cn_x', text: 'x', date: '9/3/2026', recipientIds: [REP1] })))).statusCode, 400, 'not a yyyy-mm-dd day');
    assert.equal((await handler(asMgr(ev(A, 'POST', { id: 'cn_x', text: 'x', date: '2026-09-03', recipientIds: ['usr_nobody'] })))).statusCode, 400, 'unknown recipient');
    assert.equal((await handler(asMgr(ev(A, 'POST', { id: 'cn_x', text: 'x', date: '2026-09-03', teamId: 'no_such_team' })))).statusCode, 400, 'unknown team');
    assert.equal((await handler(asMgr(ev(A, 'POST', { id: 'cn_x', text: 'x', date: '2026-09-03', recipientIds: [REP1], teamId: T1 })))).statusCode, 400, 'both');
    assert.equal(await row('cn_x'), undefined);
});

test('a note to people: recipient, author and Admin see it; another manager and a bystander do not', async () => {
    assert.deepEqual(await idsSeen(asRep1), ['cn_p1']);
    assert.deepEqual(await idsSeen(asMgr), ['cn_p1']);
    assert.deepEqual(await idsSeen(null), ['cn_p1'], 'Admin');
    assert.deepEqual(await idsSeen(asMgr2), [], 'REGRESSION (b): another manager sees nothing');
    assert.deepEqual(await idsSeen(asRep2), []);
    assert.deepEqual(await idsSeen(asRep3), []);
});

test('a team note obeys the member\'s first day; the team\'s manager sees every team note', async () => {
    assert.equal((await handler(asMgr(ev(A, 'POST', { id: 'cn_t5', text: 'team, 5 Sep', date: '2026-09-05', teamId: T1 })))).statusCode, 201);
    assert.equal((await handler(asMgr(ev(A, 'POST', { id: 'cn_t12', text: 'team, 12 Sep', date: '2026-09-12', teamId: T1 })))).statusCode, 201);
    assert.deepEqual(await idsSeen(asRep1), ['cn_p1', 'cn_t12', 'cn_t5'], 'joined 1 Sep: both team notes');
    assert.deepEqual(await idsSeen(asRep2), ['cn_t12'], 'REGRESSION (a): joined 10 Sep, not the 5 Sep note');
    assert.deepEqual(await idsSeen(asMgr), ['cn_p1', 'cn_t12', 'cn_t5']);
    assert.deepEqual(await idsSeen(asMgr2), [], 'manages nothing');
    assert.deepEqual(await idsSeen(asRep3), [], 'no team');
});

test('marking read needs visibility (404, not 403); the stamp is per user', async () => {
    assert.equal((await handler(asRep2(ev(A, 'PUT', { id: 'cn_t5', action: 'read' })))).statusCode, 404, 'not visible to REP2 — and not confirmed to exist');
    const ok = await handler(asRep1(ev(A, 'PUT', { id: 'cn_t5', action: 'read' })));
    assert.equal(ok.statusCode, 200);
    const r = await row('cn_t5');
    assert.ok(r.readBy[REP1], 'REP1 stamped');
    assert.equal(r.readBy[MGR], undefined);
    assert.equal((await handler(asRep1(ev(A, 'PUT', { id: 'cn_t5', action: 'archive' })))).statusCode, 400);
});

test('delete: a recipient and another manager are refused; the author succeeds; Admin may delete anyone\'s', async () => {
    assert.equal((await handler(asRep1(ev(A, 'DELETE', null, { id: 'cn_p1' })))).statusCode, 403);
    assert.equal((await handler(asMgr2(ev(A, 'DELETE', null, { id: 'cn_p1' })))).statusCode, 403);
    assert.ok(await row('cn_p1'), 'still there');
    assert.equal((await handler(asMgr(ev(A, 'DELETE', null, { id: 'cn_p1' })))).statusCode, 200);
    assert.equal(await row('cn_p1'), undefined);
    assert.equal((await handler(ev(A, 'DELETE', null, { id: 'cn_t12' }))).statusCode, 200, 'Admin');
    assert.equal(await row('cn_t12'), undefined);
});

test('a payload that still says legacy:true is an ordinary note: it needs an audience, and the flag and authorName are ignored', async () => {
    const noAudience = { id: 'cn_legacy_cn_1', text: 'old note', date: '2026-09-02', recipientIds: [], legacy: true, authorName: 'Jeff Russell' };
    assert.equal((await handler(ev(A, 'POST', noAudience))).statusCode, 400, 'the legacy escape hatch is gone (§0.83)');
    assert.equal(await row('cn_legacy_cn_1'), undefined);
    const res = await handler(ev(A, 'POST', { ...noAudience, id: 'cn_flagged', recipientIds: [REP1] }));
    assert.equal(res.statusCode, 201);
    const r = await row('cn_flagged');
    assert.deepEqual([r.legacy, r.authorName, r.authorId], [false, 'Itest Cnote Admin', ADMIN], 'the column stays false and the author is the caller');
});

test('org B sees nothing of org A, and cannot read or delete A\'s rows by id', async () => {
    assert.deepEqual(await idsSeen(null, B), []);
    assert.equal((await handler(ev(B, 'PUT', { id: 'cn_t5', action: 'read' }))).statusCode, 403, 'no roster row in B: refused before lookup');
    assert.equal((await handler(ev(B, 'DELETE', null, { id: 'cn_t5' }))).statusCode, 403);
    assert.ok(await row('cn_t5'), 'A\'s row untouched');
});
