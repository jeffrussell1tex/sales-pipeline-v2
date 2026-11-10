// tests/integration/close-date-history.itest.mjs
// A deal's close-date history, and the stage history's two gaps (state §0.239; docs/design/close-date-history, Jeff's
// Q1-Q4; guide §18b122) — against the real test database. Proves:
//   MOVE       a save that moves the date appends { from, to, date, timestamp, author, authorId, source } to the history
//              as stored, and one audit row "from → to"; the same date makes none; a date set where there was none and a
//              date cleared are moves (Q1); a save naming no date keeps it as stored and makes none (Q2)
//   RACE       four saves at once each record the date they replaced — every entry's "from" is the one before's "to"
//   REFUSED    a single save or an import row naming the list is a 400, nothing written; a create writes none of a body's
//   IMPORT     an Overwrite appends a close-date move per row it moves (source import), none for a row it leaves; its
//              stage moves appended to the history as stored, dated the clock it derives, an untouched row's kept;
//              one audit row for the batch
//   STAGE      a single save's stage entry carries the member's id and its source (Q4)
//   ISOLATION  org A's save or import naming org B's deal is refused, B's deal and history untouched
//
// The auth mock fakes the SIGN-IN only and re-exports the REAL gate and predicates; the mailers, webhooks and
// automations are stubbed (no outbound calls).
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST; db/apply-close-date-history.mjs --test --apply first)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || 'sk_test_itest_cdh';

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const roles = await import('../../src/utils/roles.js');
const gate  = await import('../../netlify/functions/_roleGate.mjs');

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            return { userId: event.headers?.['x-test-user'] || 'clerk_itest_cdh_nobody', orgId, userRole: event.headers?.['x-test-role'] || 'Admin', managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: gate.requireWrite, requireRole: gate.requireRole,
    },
});
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: {
        sendEmail: async () => {},
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
const { HISTORY_WORDS, isCloseDateEntry, isStageEntry } = await import('../../src/utils/dealHistory.js');

// ORG NAMESPACE: this file owns 'itest_cdh_*', and only this file writes to it.
const A = 'itest_cdh_A', B = 'itest_cdh_B';
const KAREN = { id: 'usr_itest-cdh-karen', clerk: 'clerk_itest_cdh_karen', name: 'Itest CDH Karen' };
const BOB   = { id: 'usr_itest-cdh-bob',   clerk: 'clerk_itest_cdh_bob',   name: 'Itest CDH Bob' };
const GUS   = { id: 'usr_itest-cdh-gus',   clerk: 'clerk_itest_cdh_gus',   name: 'Itest CDH Gus' };   // org B
const D = (n) => `opp_itest_cdh_${n}`;
const DB_B = 'opp_itest_cdh_b';
const TODAY = new Date().toISOString().slice(0, 10);

const ev = (org, who, method, body, role = 'Admin') => ({
    httpMethod: method,
    headers: { 'x-test-org': org, 'x-test-user': who.clerk, 'x-test-role': role, 'content-type': 'application/json' },
    body: JSON.stringify(body),
});
const put = (org, who, body, role) => dealsFn(ev(org, who, 'PUT', body, role));
const dealOf = async (id, org = A) => (await db.select().from(opportunities).where(and(eq(opportunities.id, id), eq(opportunities.orgId, org))))[0];
const auditsOf = async (action, org = A) => db.select().from(auditLog).where(and(eq(auditLog.orgId, org), eq(auditLog.action, action)));

const cleanup = async () => {
    for (const o of [A, B]) {
        await db.delete(opportunities).where(eq(opportunities.orgId, o));
        await db.delete(auditLog).where(eq(auditLog.orgId, o));
        await db.delete(settings).where(eq(settings.orgId, o));
        await db.delete(users).where(eq(users.orgId, o));
    }
};

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    await db.insert(users).values([
        { id: KAREN.id, clerkUserId: KAREN.clerk, orgId: A, name: KAREN.name, email: 'karen@cdh.itest', role: 'User' },
        { id: BOB.id,   clerkUserId: BOB.clerk,   orgId: A, name: BOB.name,   email: 'bob@cdh.itest',   role: 'Admin' },
        { id: GUS.id,   clerkUserId: GUS.clerk,   orgId: B, name: GUS.name,   email: 'gus@cdh.itest',   role: 'Admin' },
    ]);
    invalidateRoster();
    const deal = (id, org, extra = {}) => ({ id, orgId: org, ownerId: org === A ? KAREN.id : GUS.id, salesRep: org === A ? KAREN.name : GUS.name, opportunityName: id, account: 'Itest CDH Co', pipelineId: 'default', stage: 'Proposal', arr: '1000.00', forecastedCloseDate: '2026-12-31', comments: [], stageHistory: [], ...extra });
    await db.insert(opportunities).values([
        deal(D('move'), A), deal(D('same'), A), deal(D('none'), A, { forecastedCloseDate: null }), deal(D('keep'), A), deal(D('race'), A),
        deal(D('refused'), A), deal(D('stage'), A),
        deal(D('i1'), A), deal(D('i2'), A, { stageHistory: [{ prevStage: 'Qualification', stage: 'Proposal', date: '2026-10-01', source: 'import' }] }), deal(D('i3'), A, { stageHistory: [{ prevStage: 'Discovery', stage: 'Proposal', date: '2026-09-01', source: 'import' }] }),
        deal(DB_B, B, { closeDateHistory: [{ from: '2026-11-30', to: '2026-12-31', date: '2026-10-01', timestamp: '2026-10-01T12:00:00.000Z', author: GUS.name, authorId: GUS.id, source: 'deal' }] }),
    ]);
});
after(cleanup);

// ── MOVE ─────────────────────────────────────────────────────────────────────

test('MOVE: a save that moves the date appends the entry to the history as stored — from the stored date, who, when, where — and one audit row', async () => {
    const before = Date.now();
    const r = await put(A, KAREN, { id: D('move'), forecastedCloseDate: '2027-01-15', closeDateMovedOn: TODAY }, 'User');
    assert.equal(r.statusCode, 200, r.body);
    const d = await dealOf(D('move'));
    assert.equal(d.forecastedCloseDate, '2027-01-15');
    assert.equal(d.closeDateHistory.length, 1);
    const [e] = d.closeDateHistory;
    assert.deepEqual({ from: e.from, to: e.to, date: e.date, author: e.author, authorId: e.authorId, source: e.source },
        { from: '2026-12-31', to: '2027-01-15', date: TODAY, author: KAREN.name, authorId: KAREN.id, source: 'deal' });
    assert.ok(Date.parse(e.timestamp) >= before - 5000, 'the server\'s time');
    assert.ok(isCloseDateEntry(e), 'an entry the restore would keep');
    const rows = (await auditsOf('opportunity.close_date_moved')).filter(x => x.entityId === D('move'));
    assert.equal(rows.length, 1, 'one audit row');
    assert.equal(rows[0].detail, '2026-12-31 → 2027-01-15');
    assert.equal(rows[0].userName, KAREN.name, 'through auditAs: the member named');
    // a second move appends, the first kept
    await put(A, KAREN, { id: D('move'), forecastedCloseDate: '2027-02-01', closeDateMovedOn: TODAY }, 'User');
    const d2 = await dealOf(D('move'));
    assert.deepEqual(d2.closeDateHistory.map(x => [x.from, x.to]), [['2026-12-31', '2027-01-15'], ['2027-01-15', '2027-02-01']]);
});

test('MOVE: the same date makes no entry and no audit row; a save naming no date keeps the date as stored and makes none (Q2)', async () => {
    await put(A, KAREN, { id: D('same'), forecastedCloseDate: '2026-12-31', notes: 'n' }, 'User');
    const s = await dealOf(D('same'));
    assert.equal(s.closeDateHistory, null, 'none — no move, no list');
    assert.equal(s.notes, 'n', 'the rest of the save landed');
    // the date moved elsewhere since this "window" read it: a save that does not name it keeps the stored one
    await db.update(opportunities).set({ forecastedCloseDate: '2027-03-03' }).where(and(eq(opportunities.id, D('keep')), eq(opportunities.orgId, A)));
    const r = await put(A, KAREN, { id: D('keep'), nextSteps: 'call' }, 'User');
    assert.equal(r.statusCode, 200, r.body);
    const k = await dealOf(D('keep'));
    assert.equal(k.forecastedCloseDate, '2027-03-03', 'kept as stored');
    assert.equal(k.closeDateHistory, null);
    assert.equal(k.nextSteps, 'call');
    assert.equal((await auditsOf('opportunity.close_date_moved')).filter(x => [D('same'), D('keep')].includes(x.entityId)).length, 0);
});

test('MOVE: a date set where there was none and a date cleared are moves (Q1)', async () => {
    await put(A, KAREN, { id: D('none'), forecastedCloseDate: '2027-04-01', closeDateMovedOn: TODAY }, 'User');
    await put(A, KAREN, { id: D('none'), forecastedCloseDate: '', closeDateMovedOn: TODAY }, 'User');
    const d = await dealOf(D('none'));
    assert.equal(d.forecastedCloseDate, null);
    assert.deepEqual(d.closeDateHistory.map(x => [x.from, x.to]), [[null, '2027-04-01'], ['2027-04-01', null]]);
    const details = (await auditsOf('opportunity.close_date_moved')).filter(x => x.entityId === D('none')).map(x => x.detail).sort();
    assert.deepEqual(details, ['2027-04-01 → none', 'none → 2027-04-01']);
});

// ── RACE ─────────────────────────────────────────────────────────────────────

test('RACE: four saves at once each record the date they replaced — every entry\'s from is the one before\'s to', async () => {
    const dates = ['2027-05-01', '2027-05-02', '2027-05-03', '2027-05-04'];
    const rs = await Promise.all(dates.map(day => put(A, KAREN, { id: D('race'), forecastedCloseDate: day, closeDateMovedOn: TODAY }, 'User')));
    for (const r of rs) assert.equal(r.statusCode, 200, r.body);
    const d = await dealOf(D('race'));
    assert.equal(d.closeDateHistory.length, 4, 'each move recorded');
    assert.equal(d.closeDateHistory[0].from, '2026-12-31', 'the first from the date as stored');
    for (let i = 1; i < 4; i++) assert.equal(d.closeDateHistory[i].from, d.closeDateHistory[i - 1].to, `REGRESSION: entry ${i}'s from is a date read before the write`);
    assert.equal(d.closeDateHistory[3].to, d.forecastedCloseDate, 'the last entry ends on the date stored');
    assert.deepEqual(d.closeDateHistory.map(x => x.to).sort(), dates);
});

// ── REFUSED ──────────────────────────────────────────────────────────────────

test('REFUSED: a save or an import row naming the list is a 400, nothing written; a create writes none of a body\'s', async () => {
    const forged = [{ from: '2026-01-01', to: '2026-12-31', date: '2026-01-01', timestamp: '2026-01-01T00:00:00.000Z', author: 'x', authorId: null, source: 'deal' }];
    const r = await put(A, BOB, { id: D('refused'), forecastedCloseDate: '2027-06-01', closeDateHistory: forged });
    assert.equal(r.statusCode, 400);
    assert.equal(JSON.parse(r.body).error, HISTORY_WORDS.wholeList);
    const d = await dealOf(D('refused'));
    assert.equal(d.forecastedCloseDate, '2026-12-31', 'nothing written');
    assert.equal(d.closeDateHistory, null);
    const rb = await put(A, BOB, [{ id: D('refused'), closeDateHistory: forged }]);
    assert.equal(rb.statusCode, 400, 'an import row');
    const c = await dealsFn(ev(A, BOB, 'POST', { id: D('created'), opportunityName: 'New', account: 'Itest CDH Co', stage: 'Proposal', forecastedCloseDate: '2027-01-01', closeDateHistory: forged }));
    assert.equal(c.statusCode, 201, c.body);
    assert.equal((await dealOf(D('created'))).closeDateHistory, null, 'R5: a create makes no entry, and writes none of the body\'s');
});

// ── IMPORT ───────────────────────────────────────────────────────────────────

test('IMPORT: an Overwrite appends a close-date move per row it moves (source import), none for a row it leaves; its stage moves appended to the history as stored; one audit row', async () => {
    const r = await put(A, BOB, [
        { id: D('i1'), forecastedCloseDate: '2027-07-07' },                  // the date moved
        { id: D('i2'), forecastedCloseDate: '2026-12-31', stage: 'Proposal' }, // nothing moved
        { id: D('i3'), stage: 'Negotiation', daysInStage: '3' },             // the stage moved
    ]);
    assert.equal(r.statusCode, 200, r.body);
    const [i1, i2, i3] = [await dealOf(D('i1')), await dealOf(D('i2')), await dealOf(D('i3'))];
    assert.equal(i1.closeDateHistory.length, 1);
    assert.deepEqual([i1.closeDateHistory[0].from, i1.closeDateHistory[0].to, i1.closeDateHistory[0].source, i1.closeDateHistory[0].authorId], ['2026-12-31', '2027-07-07', 'import', BOB.id]);
    assert.ok(isCloseDateEntry(i1.closeDateHistory[0]));
    assert.equal(i2.closeDateHistory, null, 'a row it leaves: none');
    assert.deepEqual(i2.stageHistory, [{ prevStage: 'Qualification', stage: 'Proposal', date: '2026-10-01', source: 'import' }], 'REGRESSION (Q4): an untouched row\'s stage history as stored');
    assert.equal(i3.closeDateHistory, null, 'the batch named the date, this row did not move it');
    assert.equal(i3.stage, 'Negotiation');
    assert.equal(i3.stageHistory.length, 2, 'appended, not replaced');
    assert.deepEqual(i3.stageHistory[0], { prevStage: 'Discovery', stage: 'Proposal', date: '2026-09-01', source: 'import' }, 'the earlier entry kept, first');
    const s = i3.stageHistory[1];
    assert.deepEqual([s.prevStage, s.stage, s.date, s.source, s.authorId, s.author], ['Proposal', 'Negotiation', i3.stageChangedDate, 'import', BOB.id, BOB.name], 'from the stage as stored, dated the clock derived');
    assert.ok(isStageEntry(s));
    const bulk = await auditsOf('opportunity.close_dates_moved_bulk');
    assert.equal(bulk.length, 1);
    assert.match(bulk[0].detail, /^CSV import moved the close date of 1 of 3 deals$/);
});

// ── STAGE ────────────────────────────────────────────────────────────────────

test('STAGE: a single save\'s stage entry carries the member\'s id and where it was made (Q4)', async () => {
    const r = await put(A, KAREN, { id: D('stage'), stage: 'Negotiation', stageChangedDate: TODAY }, 'User');
    assert.equal(r.statusCode, 200, r.body);
    const [e] = (await dealOf(D('stage'))).stageHistory;
    assert.deepEqual([e.prevStage, e.stage, e.author, e.authorId, e.source], ['Proposal', 'Negotiation', KAREN.name, KAREN.id, 'deal']);
    assert.ok(isStageEntry(e));
});

// ── ISOLATION ────────────────────────────────────────────────────────────────

test('ISOLATION: org A\'s save or import naming org B\'s deal is refused; B\'s deal and history untouched', async () => {
    const before = await dealOf(DB_B, B);
    const r = await put(A, BOB, { id: DB_B, forecastedCloseDate: '2028-01-01' });
    assert.equal(r.statusCode, 404);
    const rb = await put(A, BOB, [{ id: DB_B, forecastedCloseDate: '2028-01-01' }]);
    assert.equal(rb.statusCode, 200, rb.body);
    assert.deepEqual(JSON.parse(rb.body).notFound, [DB_B], 'not this org\'s');
    const after = await dealOf(DB_B, B);
    assert.equal(after.forecastedCloseDate, '2026-12-31');
    assert.deepEqual(after.closeDateHistory, before.closeDateHistory);
    assert.equal((await auditsOf('opportunity.close_dates_moved_bulk', B)).length, 0);
});
