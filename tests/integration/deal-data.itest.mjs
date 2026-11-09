// tests/integration/deal-data.itest.mjs
// A deal's notes and stage history are added to, never written back whole; a contact's Undo keeps its owner
// (state §0.236; guide §18b119; docs/design/deal-data) — against the real test database. Proves:
//   NOTES    a post stamped by the server (author name and member id, time, id); two posts at once both stored;
//            a stale save — a whole list, or a save without one — never erases a note; only the author edits or
//            deletes (an older note by its author name); a note deleted since is a 409 answering the notes stored
//   HISTORY  a stage move appended to the history as stored, a body's history and date never written; two moves at
//            once both recorded; a save that moves nothing keeps both
//   RESTORE  a contact's Undo keeps the stored owner by id — unassigned stays unassigned, another member's stays
//            theirs, an owner gone since is none — never the caller; a create still stamps the caller
//   ISOLATION org A's note on org B's deal is a 404, B's deal untouched
//
// The auth mock fakes the SIGN-IN only and re-exports the REAL gate and predicates; the mailers, webhooks and
// automations are stubbed (no outbound calls).
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || 'sk_test_itest_dealdata';

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const roles = await import('../../src/utils/roles.js');
const gate  = await import('../../netlify/functions/_roleGate.mjs');

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            return { userId: event.headers?.['x-test-user'] || 'clerk_itest_dd_nobody', orgId, userRole: event.headers?.['x-test-role'] || 'Admin', managedReps: [], error: null };
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

const { handler: dealsFn }    = await import('../../netlify/functions/opportunities.mjs');
const { handler: contactsFn } = await import('../../netlify/functions/contacts.mjs');
const { db } = await import('../../db/index.js');
const { users, opportunities, contacts, auditLog, settings } = await import('../../db/schema.js');
const { eq, and } = await import('drizzle-orm');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');
const { assertTestSchema } = await import('./_schema-guard.mjs');
const { NOTE_WORDS } = await import('../../src/utils/dealNotes.js');

// ORG NAMESPACE: this file owns 'itest_dealdata_*', and only this file writes to it.
const A = 'itest_dealdata_A', B = 'itest_dealdata_B';
const KAREN = { id: 'usr_itest-dd-karen', clerk: 'clerk_itest_dd_karen', name: 'Itest DD Karen' };
const BOB   = { id: 'usr_itest-dd-bob',   clerk: 'clerk_itest_dd_bob',   name: 'Itest DD Bob' };
const GUS   = { id: 'usr_itest-dd-gus',   clerk: 'clerk_itest_dd_gus',   name: 'Itest DD Gus' };   // org B
const D1 = 'opp_itest_dd_1', D2 = 'opp_itest_dd_2', DOLD = 'opp_itest_dd_old', DSTAGE = 'opp_itest_dd_stage', DRACE = 'opp_itest_dd_race', DB_B = 'opp_itest_dd_b';
const OLD_NOTE = { id: 'c_1700000000000', text: 'Written before §0.236', author: KAREN.name, timestamp: '2026-10-01T12:00:00.000Z', mentions: [] };
const H1 = { stage: 'Proposal', date: '2026-10-01', prevStage: 'Qualification', author: KAREN.name, timestamp: '2026-10-01T12:00:00.000Z' };

const ev = (org, who, method, body, role = 'Admin') => ({
    httpMethod: method,
    headers: { 'x-test-org': org, 'x-test-user': who.clerk, 'x-test-role': role, 'content-type': 'application/json' },
    body: JSON.stringify(body),
});
const put = (org, who, body, role) => dealsFn(ev(org, who, 'PUT', body, role));
const dealOf = async (id, org = A) => (await db.select().from(opportunities).where(and(eq(opportunities.id, id), eq(opportunities.orgId, org))))[0];
const json = (r) => JSON.parse(r.body);

const cleanup = async () => {
    for (const o of [A, B]) {
        await db.delete(opportunities).where(eq(opportunities.orgId, o));
        await db.delete(contacts).where(eq(contacts.orgId, o));
        await db.delete(auditLog).where(eq(auditLog.orgId, o));
        await db.delete(settings).where(eq(settings.orgId, o));
        await db.delete(users).where(eq(users.orgId, o));
    }
};

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    await db.insert(users).values([
        { id: KAREN.id, clerkUserId: KAREN.clerk, orgId: A, name: KAREN.name, email: 'karen@dd.itest', role: 'User' },
        { id: BOB.id,   clerkUserId: BOB.clerk,   orgId: A, name: BOB.name,   email: 'bob@dd.itest',   role: 'Admin' },
        { id: GUS.id,   clerkUserId: GUS.clerk,   orgId: B, name: GUS.name,   email: 'gus@dd.itest',   role: 'Admin' },
    ]);
    invalidateRoster();
    const deal = (id, org, extra = {}) => ({ id, orgId: org, ownerId: org === A ? KAREN.id : GUS.id, salesRep: org === A ? KAREN.name : GUS.name, opportunityName: id, account: 'Itest DD Co', pipelineId: 'default', stage: 'Proposal', arr: '1000.00', comments: [], stageHistory: [], ...extra });
    await db.insert(opportunities).values([
        deal(D1, A), deal(D2, A), deal(DOLD, A, { comments: [OLD_NOTE] }),
        deal(DSTAGE, A, { stageHistory: [H1], stageChangedDate: '2026-10-01' }), deal(DRACE, A, { stageHistory: [H1] }),
        deal(DB_B, B, { comments: [{ ...OLD_NOTE, author: GUS.name }] }),
    ]);
});
after(cleanup);

// ── NOTES ────────────────────────────────────────────────────────────────────

test('NOTES: a post is stamped by the server — author name and member id, time, id; the body names none of them', async () => {
    mailed.length = 0;
    const before = Date.now();
    const r = await put(A, BOB, { id: D1, note: { op: 'add', text: 'Hello @Itest DD Karen', author: 'Forged', authorId: KAREN.id, id: 'c_forged', timestamp: '2001-01-01T00:00:00Z' } });
    assert.equal(r.statusCode, 200, r.body);
    const [note] = (await dealOf(D1)).comments;
    assert.equal(note.author, BOB.name, 'REGRESSION (Q2): the body names the author');
    assert.equal(note.authorId, BOB.id);
    assert.match(note.id, /^note_[0-9a-f-]{36}$/, 'the server\'s id');
    assert.ok(Date.parse(note.timestamp) >= before - 5000, 'the server\'s time');
    assert.deepEqual(note.mentions, [KAREN.name], 'mentions read by the server');
    assert.deepEqual(json(r).note, note, 'the answer carries the note as stored');
    assert.equal(mailed.length, 1, 'the deal\'s rep hears of a note by someone else');
    const own = await put(A, KAREN, { id: D1, note: { op: 'add', text: 'My own' } }, 'User');
    assert.equal(own.statusCode, 200, own.body);
    assert.equal(mailed.length, 1, 'not of her own');
});

test('NOTES: two posts at once both stand — each applied to the list as stored, never one written over the other', async () => {
    const [a, b] = await Promise.all([
        put(A, KAREN, { id: D2, note: { op: 'add', text: 'From Karen' } }, 'User'),
        put(A, BOB,   { id: D2, note: { op: 'add', text: 'From Bob' } }),
    ]);
    assert.equal(a.statusCode, 200, a.body);
    assert.equal(b.statusCode, 200, b.body);
    const texts = (await dealOf(D2)).comments.map((n) => n.text).sort();
    assert.deepEqual(texts, ['From Bob', 'From Karen'], 'REGRESSION (Q1): a post at the same moment dropped');
});

test('NOTES: a stale save never erases a note — a whole list is refused, and a save without one keeps the notes as stored', async () => {
    const stored = (await dealOf(D2)).comments;
    const whole = await put(A, KAREN, { id: D2, comments: [], arr: 5 }, 'User');
    assert.equal(whole.statusCode, 400);
    assert.equal(json(whole).error, NOTE_WORDS.wholeList);
    assert.deepEqual((await dealOf(D2)).comments, stored, 'REGRESSION (§0.236): a tab\'s old list written back');
    const form = await put(A, KAREN, { id: D2, opportunityName: 'Renamed in a stale tab', arr: 2500 }, 'User');
    assert.equal(form.statusCode, 200, form.body);
    const after = await dealOf(D2);
    assert.equal(after.opportunityName, 'Renamed in a stale tab');
    assert.deepEqual(after.comments, stored, 'the notes as stored');
    const mixed = await put(A, KAREN, { id: D2, note: { op: 'add', text: 'x' }, arr: 1 }, 'User');
    assert.equal(mixed.statusCode, 400, 'a note is saved on its own');
    assert.equal(json(mixed).error, NOTE_WORDS.alone);
});

test('NOTES: only the author edits or deletes — another member refused with the notes as stored; an older note by its author name', async () => {
    const bobs = (await dealOf(D2)).comments.find((n) => n.text === 'From Bob');
    const theirs = await put(A, KAREN, { id: D2, note: { op: 'delete', id: bobs.id } }, 'User');
    assert.equal(theirs.statusCode, 403, 'REGRESSION (Q2): another member deletes a note');
    assert.equal(json(theirs).error, NOTE_WORDS.notAuthor);
    assert.equal(json(theirs).comments.length, 2, 'the answer carries the notes as stored');
    const mine = await put(A, BOB, { id: D2, note: { op: 'edit', id: bobs.id, text: 'From Bob, edited' } });
    assert.equal(mine.statusCode, 200, mine.body);
    const edited = (await dealOf(D2)).comments.find((n) => n.id === bobs.id);
    assert.equal(edited.text, 'From Bob, edited');
    assert.equal(edited.edited, true);
    assert.equal(edited.author, BOB.name, 'the author as stamped');
    // A note from before §0.236 holds a name, no id: its author by name.
    assert.equal((await put(A, BOB, { id: DOLD, note: { op: 'edit', id: OLD_NOTE.id, text: 'x' } })).statusCode, 403);
    const old = await put(A, KAREN, { id: DOLD, note: { op: 'edit', id: OLD_NOTE.id, text: 'Edited by its author' } }, 'User');
    assert.equal(old.statusCode, 200, old.body);
    assert.equal((await dealOf(DOLD)).comments[0].text, 'Edited by its author');
    const del = await put(A, KAREN, { id: DOLD, note: { op: 'delete', id: OLD_NOTE.id } }, 'User');
    assert.equal(del.statusCode, 200, del.body);
    assert.deepEqual((await dealOf(DOLD)).comments, []);
    const gone = await put(A, KAREN, { id: DOLD, note: { op: 'delete', id: OLD_NOTE.id } }, 'User');
    assert.equal(gone.statusCode, 409, 'a note deleted since');
    assert.equal(json(gone).error, NOTE_WORDS.gone);
    assert.deepEqual(json(gone).comments, []);
});

// ── HISTORY ──────────────────────────────────────────────────────────────────

test('HISTORY: a move appends to the history as stored — a body\'s history and date never written; a save that moves nothing keeps both', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const r = await put(A, KAREN, { id: DSTAGE, stage: 'Negotiation', stageChangedDate: today, stageHistory: [{ stage: 'Forged' }] }, 'User');
    assert.equal(r.statusCode, 200, r.body);
    const d = await dealOf(DSTAGE);
    assert.equal(d.stage, 'Negotiation');
    assert.equal(d.stageChangedDate, today);
    assert.equal(d.stageHistory.length, 2, 'REGRESSION (Q3): a body\'s history written');
    assert.deepEqual(d.stageHistory[0], H1, 'the stored history kept');
    assert.deepEqual({ ...d.stageHistory[1], timestamp: 't' }, { stage: 'Negotiation', date: today, prevStage: 'Proposal', author: KAREN.name, timestamp: 't' });
    const still = await put(A, KAREN, { id: DSTAGE, arr: 7, stageChangedDate: '2001-01-01', stageHistory: [] }, 'User');
    assert.equal(still.statusCode, 200, still.body);
    const e = await dealOf(DSTAGE);
    assert.equal(e.stageChangedDate, today, 'no move: the date as stored');
    assert.equal(e.stageHistory.length, 2, 'no move: the history as stored');
    const far = await put(A, KAREN, { id: DSTAGE, stage: 'Proposal', stageChangedDate: '2001-01-01' }, 'User');
    assert.equal(far.statusCode, 200, far.body);
    assert.equal((await dealOf(DSTAGE)).stageChangedDate, today, 'a date a day or more off the server\'s: the server\'s');
});

test('HISTORY: moves at once are each recorded — appended to what is stored, in its write', async () => {
    // Six at once, so their reads and writes overlap (two alone often ran one after the other — the read-then-write
    // mutant passed them, 9 Nov). Each names a stage no other does, so each is a move from whatever it read; each
    // must be in the history, however the writes interleave.
    const STAGES = ['Negotiation', 'Closed Won', 'Qualification', 'Discovery', 'Demo', 'Contracting'];
    const rs = await Promise.all(STAGES.map((stage, i) => put(A, i % 2 ? BOB : KAREN, { id: DRACE, stage }, i % 2 ? 'Admin' : 'User')));
    for (const r of rs) assert.equal(r.statusCode, 200, r.body);
    const h = (await dealOf(DRACE)).stageHistory;
    assert.deepEqual(h[0], H1, 'the stored history kept');
    const recorded = h.slice(1).map((e) => e.stage);
    for (const s of STAGES) assert.ok(recorded.includes(s), `REGRESSION (Q3): the move to ${s} dropped — recorded ${JSON.stringify(recorded)}`);
    assert.equal(recorded.length, STAGES.length, 'each once');
});

// ── ISOLATION ────────────────────────────────────────────────────────────────

test('ISOLATION: a note on another org\'s deal answers as missing; its notes untouched', async () => {
    const before = (await dealOf(DB_B, B)).comments;
    const r = await put(A, BOB, { id: DB_B, note: { op: 'add', text: 'From org A' } });
    assert.equal(r.statusCode, 404);
    const d = await put(A, BOB, { id: DB_B, note: { op: 'delete', id: OLD_NOTE.id } });
    assert.equal(d.statusCode, 404);
    assert.deepEqual((await dealOf(DB_B, B)).comments, before);
});

// ── RESTORE ──────────────────────────────────────────────────────────────────

const contact = (id, extra = {}) => ({ id, firstName: 'Itest', lastName: id, ...extra });
const contactOf = async (id, org = A) => (await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.orgId, org))))[0];

test('RESTORE: a contact\'s Undo keeps its stored owner by id — unassigned stays unassigned, another member\'s stays theirs, one gone since is none; never the caller', async () => {
    const un = await contactsFn(ev(A, KAREN, 'POST', { ...contact('ct_itest_dd_un'), ownerId: null, assignedRep: null, restore: true }, 'User'));
    assert.equal(un.statusCode, 201, un.body);
    assert.equal((await contactOf('ct_itest_dd_un')).ownerId, null, 'REGRESSION (Q4): a rep\'s Undo makes an unassigned contact hers');
    const theirs = await contactsFn(ev(A, BOB, 'POST', { ...contact('ct_itest_dd_k'), ownerId: KAREN.id, assignedRep: KAREN.name, restore: true }));
    assert.equal(theirs.statusCode, 201, theirs.body);
    const k = await contactOf('ct_itest_dd_k');
    assert.equal(k.ownerId, KAREN.id, 'an Admin\'s Undo keeps the rep\'s contact hers');
    assert.equal(k.assignedRep, KAREN.name);
    const gone = await contactsFn(ev(A, BOB, 'POST', { ...contact('ct_itest_dd_gone'), ownerId: GUS.id, assignedRep: GUS.name, restore: true }));
    assert.equal(gone.statusCode, 201, gone.body);
    const g = await contactOf('ct_itest_dd_gone');
    assert.equal(g.ownerId, null, 'another org\'s member is no owner here');
    assert.equal(g.assignedRep, null, 'and the name goes with the id');
    const made = await contactsFn(ev(A, KAREN, 'POST', contact('ct_itest_dd_new'), 'User'));
    assert.equal(made.statusCode, 201, made.body);
    assert.equal((await contactOf('ct_itest_dd_new')).ownerId, KAREN.id, 'a create with no mark: the caller owns what they create, as before');
});
