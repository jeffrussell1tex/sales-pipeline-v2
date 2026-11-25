// tests/integration/five-findings.itest.mjs
// Today's five findings (state §0.240; docs/design/five-findings; Jeff's answers 10 Nov) — the two the server holds,
// against the real test database. Proves:
//   EMAILS   a deal email names who acted by their member name — never the Clerk id — "Someone" for no member row;
//            a rep is not emailed about their own stage move, close or edit, by owner id (Jeff: "Skip own moves");
//            another member's are
//   CREATED  a deal's created date is the server's once the deal exists: a save naming one, single or import row,
//            keeps the stored one; a create keeps a real day it names, else the server's day (Jeff: "Server-owned")
//   WON      a move to Closed Won naming no won date is dated by the move; one named is kept
//   MAKER    who made a deal is the server's (state §0.250): a create, single or import, stores the caller's member
//            name whatever the body names — none for a caller with no member row here, never another org's name; a
//            save, single or import row, naming a maker keeps the stored one
//
// The auth mock fakes the SIGN-IN only and re-exports the REAL gate and predicates; the mailer is captured (no
// outbound calls), webhooks and automations stubbed.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || 'sk_test_itest_ff';

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const roles = await import('../../src/utils/roles.js');
const gate  = await import('../../netlify/functions/_roleGate.mjs');

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            return { userId: event.headers?.['x-test-user'] || 'clerk_itest_ff_nobody', orgId, userRole: event.headers?.['x-test-role'] || 'Admin', managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: gate.requireWrite, requireRole: gate.requireRole,
    },
});
const mailed = [];
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: {
        sendEmail: async (m) => { mailed.push(m); },
        emailTemplates: new Proxy({}, { get: (_, k) => (args) => ({ subject: String(k), html: JSON.stringify(args) }) }),
    },
});
mock.module(new URL('../../netlify/functions/webhooks.mjs', import.meta.url).href, { namedExports: { dispatchWebhook: async () => {} } });
mock.module(new URL('../../netlify/functions/dispatch-automations.mjs', import.meta.url).href, { namedExports: { dispatchAutomations: async () => {} } });

const { handler: dealsFn } = await import('../../netlify/functions/opportunities.mjs');
const { db } = await import('../../db/index.js');
const { users, opportunities, auditLog, settings } = await import('../../db/schema.js');
const { eq, and } = await import('drizzle-orm');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');
const { assertTestSchema } = await import('./_schema-guard.mjs');

// ORG NAMESPACE: this file owns 'itest_ff_*', and only this file writes to it.
const A = 'itest_ff_A';
const B = 'itest_ff_B';   // another org, where the GHOST's Clerk id IS a member (the maker is read in the caller's org only)
const KAREN = { id: 'usr_itest-ff-karen', clerk: 'clerk_itest_ff_karen', name: 'Itest FF Karen', email: 'karen@ff.itest' };
const BOB   = { id: 'usr_itest-ff-bob',   clerk: 'clerk_itest_ff_bob',   name: 'Itest FF Bob',   email: 'bob@ff.itest' };
const GHOST = { clerk: 'clerk_itest_ff_ghost' };   // signed in, no member row in this org
const D = (n) => `opp_itest_ff_${n}`;
const SERVER_DAY = () => new Date().toISOString().slice(0, 10);

const ev = (who, method, body, role = 'Admin') => ({
    httpMethod: method,
    headers: { 'x-test-org': A, 'x-test-user': who.clerk, 'x-test-role': role, 'content-type': 'application/json' },
    body: JSON.stringify(body),
});
const put = (who, body, role) => dealsFn(ev(who, 'PUT', body, role));
const dealOf = async (id) => (await db.select().from(opportunities).where(and(eq(opportunities.id, id), eq(opportunities.orgId, A))))[0];
const sentTo = (email, subject) => mailed.filter((m) => [].concat(m.to).includes(email) && m.subject === subject).map((m) => JSON.parse(m.html));

const cleanup = async () => {
    await db.delete(opportunities).where(eq(opportunities.orgId, A));
    await db.delete(auditLog).where(eq(auditLog.orgId, A));
    await db.delete(settings).where(eq(settings.orgId, A));
    await db.delete(users).where(eq(users.orgId, A));
    await db.delete(opportunities).where(eq(opportunities.orgId, B));
    await db.delete(users).where(eq(users.orgId, B));
};

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    await db.insert(users).values([
        // Karen hears of edits too, to prove her own are skipped (the update email is off by default).
        { id: KAREN.id, clerkUserId: KAREN.clerk, orgId: A, name: KAREN.name, email: KAREN.email, role: 'User', profile: { notificationPrefs: { opportunityUpdated: { enabled: true, mode: 'instant' } } } },
        { id: BOB.id,   clerkUserId: BOB.clerk,   orgId: A, name: BOB.name,   email: BOB.email,   role: 'Admin' },
        // The GHOST is a member of org B only: their name there must never be org A's maker.
        { id: 'usr_itest-ff-ghost-b', clerkUserId: GHOST.clerk, orgId: B, name: 'Itest FF Other Org', email: 'ghost@ff.itest', role: 'Admin' },
    ]);
    invalidateRoster();
    const deal = (id, extra = {}) => ({ id, orgId: A, ownerId: KAREN.id, salesRep: KAREN.name, opportunityName: id, account: 'Itest FF Co', pipelineId: 'default', stage: 'Proposal', arr: '1000.00', forecastedCloseDate: '2026-12-31', createdDate: '2026-09-01', comments: [], stageHistory: [], ...extra });
    await db.insert(opportunities).values([
        deal(D('bobmoves')), deal(D('karenmoves')), deal(D('ghost')), deal(D('created')), deal(D('bulk')), deal(D('won')), deal(D('wonnamed')),
        deal(D('maker'), { createdBy: 'Seeded maker' }), deal(D('makerbulk'), { createdBy: 'Seeded maker' }), deal(D('makernone'), { createdBy: null }),
    ]);
});
after(cleanup);

// ── EMAILS ───────────────────────────────────────────────────────────────────

test('EMAILS: another member\'s stage move, close and edit name them by member name — never the Clerk id', async () => {
    mailed.length = 0;
    assert.equal((await put(BOB, { id: D('bobmoves'), stage: 'Negotiation/Review' })).statusCode, 200);
    const [moved] = sentTo(KAREN.email, 'stageChanged');
    assert.equal(moved?.changedBy, BOB.name, 'REGRESSION (§0.240): "user_… updated the stage"');
    assert.equal((await put(BOB, { id: D('bobmoves'), nextSteps: 'call' })).statusCode, 200);
    assert.equal(sentTo(KAREN.email, 'opportunityUpdated')[0]?.updatedBy, BOB.name);
    assert.equal((await put(BOB, { id: D('bobmoves'), stage: 'Closed Won' })).statusCode, 200);
    assert.equal(sentTo(KAREN.email, 'dealClosed')[0]?.closedBy, BOB.name);
    const all = JSON.stringify(mailed);
    assert.ok(!all.includes(BOB.clerk), 'no Clerk id in any email');
});

test('EMAILS: a rep is not emailed about their own stage move, close or edit (Jeff: "Skip own moves") — by owner id', async () => {
    mailed.length = 0;
    assert.equal((await put(KAREN, { id: D('karenmoves'), stage: 'Negotiation/Review' }, 'User')).statusCode, 200);
    assert.equal((await put(KAREN, { id: D('karenmoves'), nextSteps: 'mine' }, 'User')).statusCode, 200);
    assert.equal((await put(KAREN, { id: D('karenmoves'), stage: 'Closed Lost', lostReason: 'x' }, 'User')).statusCode, 200);
    assert.deepEqual(mailed.filter((m) => [].concat(m.to).includes(KAREN.email)).map((m) => m.subject), [], 'REGRESSION (§0.176 (c)): a rep emailed about their own edits');
});

test('EMAILS: a caller with no member row is "Someone"', async () => {
    mailed.length = 0;
    const r = await put(GHOST, { id: D('ghost'), stage: 'Negotiation/Review' });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(sentTo(KAREN.email, 'stageChanged')[0]?.changedBy, 'Someone');
    assert.ok(!JSON.stringify(mailed).includes(GHOST.clerk));
});

// ── CREATED ──────────────────────────────────────────────────────────────────

test('CREATED: a save naming a created date keeps the stored one — single and import row', async () => {
    assert.equal((await put(BOB, { id: D('created'), createdDate: '2001-01-01', nextSteps: 'n' })).statusCode, 200);
    assert.equal((await dealOf(D('created'))).createdDate, '2026-09-01', 'REGRESSION (§0.240): a save moved the created date');
    const rb = await put(BOB, [{ id: D('bulk'), createdDate: '2001-01-01', nextSteps: 'b' }]);
    assert.equal(rb.statusCode, 200, rb.body);
    const b = await dealOf(D('bulk'));
    assert.equal(b.createdDate, '2026-09-01');
    assert.equal(b.nextSteps, 'b', 'the rest of the row landed');
});

test('CREATED: a create keeps a real day it names, else the server\'s day', async () => {
    const make = async (id, extra) => {
        const r = await dealsFn(ev(BOB, 'POST', { id, opportunityName: id, account: 'Itest FF Co', stage: 'Proposal', salesRep: KAREN.name, forecastedCloseDate: '2027-01-01', ...extra }));
        assert.equal(r.statusCode, 201, r.body);
        return (await dealOf(id)).createdDate;
    };
    assert.equal(await make(D('c-named'), { createdDate: '2025-05-05' }), '2025-05-05', 'an import\'s own Created Date kept');
    assert.equal(await make(D('c-none'), {}), SERVER_DAY(), 'none: the server\'s day');
    assert.equal(await make(D('c-junk'), { createdDate: 'yesterday' }), SERVER_DAY(), 'no day: the server\'s day');
    const rb = await dealsFn(ev(BOB, 'POST', [{ id: D('c-bulk'), opportunityName: 'b', account: 'Itest FF Co', stage: 'Proposal', salesRep: KAREN.name }]));
    assert.equal(rb.statusCode, 201, rb.body);
    assert.equal((await dealOf(D('c-bulk'))).createdDate, SERVER_DAY(), 'an import\'s new row with none');
});

// ── MAKER ────────────────────────────────────────────────────────────────────

test('MAKER: a save naming who made a deal keeps the stored one — single and import row, a stored none included', async () => {
    const r1 = await put(BOB, { id: D('maker'), createdBy: 'Mallory', nextSteps: 'm' });
    assert.equal(r1.statusCode, 200, r1.body);
    assert.equal((await dealOf(D('maker'))).createdBy, 'Seeded maker', 'REGRESSION (§0.250): a save wrote the body\'s maker');
    assert.equal((await dealOf(D('maker'))).nextSteps, 'm', 'the rest of the save landed');
    assert.equal((await put(BOB, { id: D('maker'), createdBy: null, nextSteps: 'm2' })).statusCode, 200);
    assert.equal((await dealOf(D('maker'))).createdBy, 'Seeded maker', 'a save naming none never clears it');
    assert.equal((await put(BOB, { id: D('makernone'), createdBy: 'Mallory', nextSteps: 'n' })).statusCode, 200);
    assert.equal((await dealOf(D('makernone'))).createdBy, null, 'a stored none is never filled from a body');
    const rb = await put(BOB, [{ id: D('makerbulk'), createdBy: 'Mallory', nextSteps: 'b' }, { id: D('makernone'), createdBy: 'Mallory', nextSteps: 'nb' }]);
    assert.equal(rb.statusCode, 200, rb.body);
    const b = await dealOf(D('makerbulk'));
    assert.equal(b.createdBy, 'Seeded maker', 'REGRESSION (§0.250): an import\'s Overwrite wrote the row\'s maker');
    assert.equal(b.nextSteps, 'b', 'the rest of the row landed');
    assert.equal((await dealOf(D('makernone'))).createdBy, null);
});

test('MAKER: a create stores the caller\'s member name, never the body\'s — single and import; none for a caller with no member row here, never another org\'s name', async () => {
    const body = (id) => ({ id, opportunityName: id, account: 'Itest FF Co', stage: 'Proposal', salesRep: KAREN.name, createdBy: 'Mallory' });
    const r1 = await dealsFn(ev(BOB, 'POST', body(D('m-single'))));
    assert.equal(r1.statusCode, 201, r1.body);
    assert.equal((await dealOf(D('m-single'))).createdBy, BOB.name, 'REGRESSION (§0.250): a create stored the body\'s maker');
    assert.equal(JSON.parse(r1.body).opportunity.createdBy, BOB.name, 'the answer names the maker stored');
    const rb = await dealsFn(ev(BOB, 'POST', [body(D('m-bulk1')), { ...body(D('m-bulk2')), createdBy: '' }, (({ createdBy: _c, ...rest }) => rest)(body(D('m-bulk3')))]));
    assert.equal(rb.statusCode, 201, rb.body);
    for (const n of [1, 2, 3]) assert.equal((await dealOf(D(`m-bulk${n}`))).createdBy, BOB.name, `REGRESSION (§0.250): import row ${n} — the importer's member name on every new deal`);
    // The GHOST is signed in to org A with no member row there (a member of org B): none, never B's name, never the body's.
    const rg = await dealsFn(ev(GHOST, 'POST', body(D('m-ghost'))));
    assert.equal(rg.statusCode, 201, rg.body);
    assert.equal((await dealOf(D('m-ghost'))).createdBy, null, 'no member here: none');
    const rgb = await dealsFn(ev(GHOST, 'POST', [body(D('m-ghostbulk'))]));
    assert.equal(rgb.statusCode, 201, rgb.body);
    assert.equal((await dealOf(D('m-ghostbulk'))).createdBy, null, 'an import by no member here: none');
    const all = await db.select().from(opportunities).where(eq(opportunities.orgId, A));
    assert.ok(!all.some((o) => o.createdBy === 'Itest FF Other Org' || o.createdBy === 'Mallory'), 'never another org\'s member, never a body\'s maker');
    assert.deepEqual(await db.select().from(opportunities).where(eq(opportunities.orgId, B)), [], 'nothing written in org B');
});

// ── WON ──────────────────────────────────────────────────────────────────────

test('WON: a move to Closed Won naming no won date is dated by the move; one named is kept', async () => {
    assert.equal((await put(BOB, { id: D('won'), stage: 'Closed Won' })).statusCode, 200);
    const w = await dealOf(D('won'));
    assert.equal(w.wonDate, w.stageChangedDate, 'dated by the move');
    assert.ok(w.wonDate, 'a won date');
    assert.equal((await put(BOB, { id: D('wonnamed'), stage: 'Closed Won', wonDate: '2026-11-01' })).statusCode, 200);
    assert.equal((await dealOf(D('wonnamed'))).wonDate, '2026-11-01');
});

test('WON (the review): a deal reopened on the board loses its won date, and won again is dated by the new win — never its first', async () => {
    await db.update(opportunities).set({ stage: 'Closed Won', wonDate: '2026-10-01' }).where(and(eq(opportunities.id, D('won')), eq(opportunities.orgId, A)));
    // the board's drag sends { id, stage, stageChangedDate } only
    assert.equal((await put(BOB, { id: D('won'), stage: 'Proposal', stageChangedDate: SERVER_DAY() })).statusCode, 200);
    assert.equal((await dealOf(D('won'))).wonDate, null, 'reopened: no won date');
    assert.equal((await put(BOB, { id: D('won'), stage: 'Closed Won', stageChangedDate: SERVER_DAY() })).statusCode, 200);
    const w = await dealOf(D('won'));
    assert.notEqual(w.wonDate, '2026-10-01', 'REGRESSION (the review): dated by the first win');
    assert.equal(w.wonDate, w.stageChangedDate, 'dated by this move');
    // a window's copy of the stored date is not a date it names
    await db.update(opportunities).set({ stage: 'Proposal', wonDate: '2026-10-01' }).where(and(eq(opportunities.id, D('won')), eq(opportunities.orgId, A)));
    assert.equal((await put(BOB, { id: D('won'), stage: 'Closed Won', wonDate: '2026-10-01', stageChangedDate: SERVER_DAY() })).statusCode, 200);
    assert.notEqual((await dealOf(D('won'))).wonDate, '2026-10-01', 'the stored date sent back is no date of this win');
});
