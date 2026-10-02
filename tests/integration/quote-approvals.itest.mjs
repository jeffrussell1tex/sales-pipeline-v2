// tests/integration/quote-approvals.itest.mjs
// Batch (D) — the Approvals tab tells the truth (state §0.156) — against the real
// test database. Proves, on quotes.mjs and audit-log.mjs:
//   SEND BACK  an approver returns a quote waiting for approval to the rep as a
//              DRAFT with a note (Jeff, 2 Oct); the record names the approver and
//              keeps the note; a rep, a blank or overlong note, a quote not waiting,
//              or a send-back that edits the lines is refused and changes nothing
//   WITHDRAW   the rep takes her own quote out of the queue — recorded as such
//   HOLD       a quote waiting for approval keeps its lines; withdrawn, they change
//   NOTE       the note is the server's: a save cannot write it, a new quote starts
//              without one, a resubmission keeps it, the approval settles it
//   LOST       a quote waiting for approval is never marked Rejected / Lost
//   RECORD     the approval flow (90 days) and one quote's history reach a caller
//              for the quotes she can see, and no others; no Clerk id leaves
//   FORGERY    a member cannot post a quote event to the audit log
//   STATS      the tier statistics are the record's decisions and the quotes waiting
//
// The auth mock fakes the SIGN-IN only and re-exports the REAL gate and predicates;
// the deal rule, the quote rule and the stats arithmetic are the real ones.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const roles = await import('../../src/utils/roles.js');
const gate  = await import('../../netlify/functions/_roleGate.mjs');

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            const userRole = event.headers?.['x-test-role'] || 'Admin';
            const userId = event.headers?.['x-test-user'] || 'clerk_itest_qappr_nobody';
            return { userId, orgId, userRole, managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: gate.requireWrite, requireRole: gate.requireRole,
    },
});
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: { sendEmail: async () => ({ success: true }), emailTemplates: new Proxy({}, { get: () => () => ({}) }) },
});
mock.module(new URL('../../netlify/functions/send-sms.mjs', import.meta.url).href, {
    namedExports: { sendSms: async () => ({ success: true }), smsTemplates: {}, normalizePhone: (p) => p },
});

const { handler: quotesFn } = await import('../../netlify/functions/quotes.mjs');
const { handler: auditFn }  = await import('../../netlify/functions/audit-log.mjs');
const { APPROVAL_FLOW_ACTIONS, SENT_BACK_MARK, sendBackNoteOf } = await import('../../src/utils/approvalStats.js');
const { db } = await import('../../db/index.js');
const { users, opportunities, quotes, auditLog, settings } = await import('../../db/schema.js');
const { eq, and, asc } = await import('drizzle-orm');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');

// ORG NAMESPACE: this file owns 'itest_qappr_*', and only this file writes to it.
const A = 'itest_qappr_A', B = 'itest_qappr_B';
const CLERK = {
    rep: 'clerk_itest_qappr_rep', other: 'clerk_itest_qappr_other', mgr: 'clerk_itest_qappr_mgr',
    admin: 'clerk_itest_qappr_admin', ro: 'clerk_itest_qappr_ro', mgrB: 'clerk_itest_qappr_mgr_b',
};
const USR = {
    rep: 'usr_itest-qappr-rep', other: 'usr_itest-qappr-other', mgr: 'usr_itest-qappr-mgr',
    admin: 'usr_itest-qappr-admin', ro: 'usr_itest-qappr-ro', mgrB: 'usr_itest-qappr-mgr-b',
};
const OPP = { mine: 'opp_itest_qappr_mine', other: 'opp_itest_qappr_other', b: 'opp_itest_qappr_b' };
const Q = {
    back:  'q_itest_qappr_back',      // mine, waiting (VP tier) — sent back, resubmitted, approved
    lost:  'q_itest_qappr_lost',      // mine, waiting — "Rejected / Lost" from the queue is refused
    wd:    'q_itest_qappr_withdraw',  // mine, waiting — the rep's send-back refused; she withdraws it
    draft: 'q_itest_qappr_draft',     // mine, Draft — nothing to send back
    other: 'q_itest_qappr_other',     // another rep's deal, waiting — approved by the Manager
    statA: 'q_itest_qappr_stat_a',    // mine, Approved at the Mgr tier — seeded: approved 6 h after submission
    statB: 'q_itest_qappr_stat_b',    // mine, Draft at the Mgr tier — seeded: sent back 2 h after submission
    b:     'q_itest_qappr_b',         // org B, waiting
};
const H = 3600000;
const lines = (disc) => [{ productId: 'p_itest_qappr', productName: 'Itest Platform', productType: 'recurring', unit: 'month', listPrice: 100, quantity: 2, discountPct: disc }];

const ev = (org, role, user, method = 'GET', body, qs) => ({
    httpMethod: method,
    headers: { 'x-test-org': org, 'x-test-role': role, 'x-test-user': user, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    queryStringParameters: qs || {},
});
const parse = (r) => ({ status: r.statusCode, body: (() => { try { return JSON.parse(r.body || '{}'); } catch { return {}; } })() });
const as = {
    rep:   (m, b, qs) => quotesFn(ev(A, 'User', CLERK.rep, m, b, qs)).then(parse),
    other: (m, b, qs) => quotesFn(ev(A, 'User', CLERK.other, m, b, qs)).then(parse),
    mgr:   (m, b, qs) => quotesFn(ev(A, 'Manager', CLERK.mgr, m, b, qs)).then(parse),
};
const row = async (id) => (await db.select().from(quotes).where(eq(quotes.id, id)))[0];
const audits = (quoteId, action) => db.select().from(auditLog)
    .where(and(eq(auditLog.orgId, A), eq(auditLog.entityId, quoteId), eq(auditLog.action, action)))
    .orderBy(asc(auditLog.timestamp));

const cleanup = async () => {
    for (const o of [A, B]) {
        await db.delete(quotes).where(eq(quotes.orgId, o));
        await db.delete(opportunities).where(eq(opportunities.orgId, o));
        await db.delete(auditLog).where(eq(auditLog.orgId, o));
        await db.delete(settings).where(eq(settings.orgId, o));
        await db.delete(users).where(eq(users.orgId, o));
    }
};

before(async () => {
    await cleanup();
    const u = (key, role, org = A) => ({ id: USR[key], clerkUserId: CLERK[key], orgId: org, name: `Itest Qappr ${key}`, email: `qappr-${key}@itest.local`, role });
    await db.insert(users).values([u('rep', 'User'), u('other', 'User'), u('mgr', 'Manager'), u('admin', 'Admin'), u('ro', 'ReadOnly'), u('mgrB', 'Manager', B)]);
    invalidateRoster();
    const opp = (id, org, ownerKey) => ({ id, orgId: org, ownerId: ownerKey ? USR[ownerKey] : null, salesRep: ownerKey ? `Itest Qappr ${ownerKey}` : '', opportunityName: id, account: 'Itest Co', pipelineId: 'default', stage: 'Proposal', arr: '1000.00' });
    await db.insert(opportunities).values([opp(OPP.mine, A, 'rep'), opp(OPP.other, A, 'other'), opp(OPP.b, B, null)]);
    const q = (id, opportunityId, status, disc, tier) => ({
        id, orgId: opportunityId === OPP.b ? B : A, opportunityId, quoteNumber: 'Q-2026-8' + (10 + Object.values(Q).indexOf(id)),
        version: 1, name: id, status, lineItems: lines(disc), createdBy: 'Itest Qappr rep', approvalTier: tier,
    });
    await db.insert(quotes).values([
        q(Q.back, OPP.mine, 'Pending Approval', 25, 'VP approval'), q(Q.lost, OPP.mine, 'Pending Approval', 25, 'VP approval'),
        q(Q.wd, OPP.mine, 'Pending Approval', 25, 'VP approval'), q(Q.draft, OPP.mine, 'Draft', 5, null),
        q(Q.other, OPP.other, 'Pending Approval', 25, 'VP approval'),
        q(Q.statA, OPP.mine, 'Approved', 15, 'Mgr approval'), q(Q.statB, OPP.mine, 'Draft', 15, 'Mgr approval'),
        q(Q.b, OPP.b, 'Pending Approval', 25, 'VP approval'),
    ]);
    // The seeded record: what the statistics must read — and one decision too old.
    const audit = (key, action, quoteId, hoursAgo, by, org = A, detail = null) => ({
        id: `audit_itest_qappr_${key}`, orgId: org, action, entityType: 'quote', entityId: quoteId, entityName: quoteId,
        detail, userId: CLERK[by], userName: `Itest Qappr ${by}`, timestamp: new Date(Date.now() - hoursAgo * H),
    });
    await db.insert(auditLog).values([
        audit('s1', 'quote.submitted', Q.statA, 10, 'rep'),
        audit('s2', 'quote.approved',  Q.statA, 4, 'mgr'),
        audit('s3', 'quote.submitted', Q.statB, 30, 'rep'),
        audit('s4', 'quote.sentback',  Q.statB, 28, 'mgr', A, `Q-2026-816 v1 · Pending Approval → Draft${SENT_BACK_MARK}Too deep`),
        audit('s5', 'quote.approved',  Q.statA, 24 * 100, 'mgr'),          // 100 days ago — outside the record's 90
        audit('b1', 'quote.submitted', Q.b, 5, 'mgrB', B),
    ]);
});
after(cleanup);

// ── SEND BACK ────────────────────────────────────────────────────────────────

test('SEND BACK: a Manager returns a quote waiting for approval to the rep as a Draft, with the note — the record names her and keeps it', async () => {
    const res = await as.mgr('PUT', { id: Q.back, status: 'Draft', sendBack: true, sendBackNote: '  Bring it under 20%  ' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const r = await row(Q.back);
    assert.equal(r.status, 'Draft');
    assert.equal(r.approvalNote, 'Bring it under 20%', 'trimmed');
    assert.equal(r.approvedBy, null);
    const [sent] = await audits(Q.back, 'quote.sentback');
    assert.ok(sent, 'the send-back is in the record');
    assert.equal(sent.userName, 'Itest Qappr mgr', 'by the approver\'s name');
    assert.match(sent.detail, /Pending Approval → Draft/);
    assert.equal(sendBackNoteOf(sent.detail), 'Bring it under 20%', 'its note ends the detail');
});

test('SEND BACK is refused — a rep (403); a blank, missing or overlong note (400); a quote not waiting (409); a send-back that edits the lines (409) — and nothing changes', async () => {
    const before = await row(Q.wd);
    assert.equal((await as.rep('PUT', { id: Q.wd, status: 'Draft', sendBack: true, sendBackNote: 'mine' })).status, 403);
    assert.equal((await as.mgr('PUT', { id: Q.wd, status: 'Draft', sendBack: true, sendBackNote: '   ' })).status, 400);
    assert.equal((await as.mgr('PUT', { id: Q.wd, status: 'Draft', sendBack: true })).status, 400);
    assert.equal((await as.mgr('PUT', { id: Q.wd, status: 'Draft', sendBack: true, sendBackNote: 'x'.repeat(1001) })).status, 400);
    assert.equal((await as.mgr('PUT', { id: Q.draft, status: 'Draft', sendBack: true, sendBackNote: 'x' })).status, 409, 'a draft is not waiting');
    assert.equal((await as.mgr('PUT', { id: Q.wd, sendBack: true, sendBackNote: 'x', lineItems: lines(5) })).status, 409, 'the approver does not edit the quote');
    assert.equal(parse(await quotesFn(ev(A, 'ReadOnly', CLERK.ro, 'PUT', { id: Q.wd, status: 'Draft', sendBack: true, sendBackNote: 'x' }))).status, 403, 'ReadOnly writes nothing');
    const after = await row(Q.wd);
    assert.equal(after.status, 'Pending Approval');
    assert.equal(after.approvalNote, null);
    assert.equal(JSON.stringify(after.lineItems), JSON.stringify(before.lineItems));
    assert.equal((await audits(Q.wd, 'quote.sentback')).length, 0, 'nothing in the record');
});

test('WITHDRAW: the rep takes her own quote out of the queue — no note, recorded as a withdrawal, not a decision', async () => {
    const res = await as.rep('PUT', { id: Q.wd, status: 'Draft' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal((await row(Q.wd)).status, 'Draft');
    const [w] = await audits(Q.wd, 'quote.withdrawn');
    assert.ok(w, 'a withdrawal in the record');
    assert.equal(w.userName, 'Itest Qappr rep');
});

test('HOLD: a quote waiting for approval keeps its lines and terms — the rep withdraws it to change them (Jeff, 2 Oct)', async () => {
    const before = await row(Q.lost);
    const held = await as.rep('PUT', { id: Q.lost, lineItems: lines(5) });
    assert.equal(held.status, 409);
    assert.match(held.body.error, /waiting for approval — withdraw it to change it/);
    assert.equal((await as.mgr('PUT', { id: Q.lost, notes: 'tightened' })).status, 409, 'not the approver either — they decide on what they read');
    const r = await row(Q.lost);
    assert.equal(r.status, 'Pending Approval');
    assert.equal(JSON.stringify(r.lineItems), JSON.stringify(before.lineItems));
    assert.equal(r.notes, before.notes);
    assert.equal((await as.rep('PUT', { id: Q.wd, lineItems: lines(5) })).status, 200, 'withdrawn, it is hers to change');
});

test('THE NOTE is the server\'s: a save cannot write it, a new quote starts without one; a resubmission keeps it; the approval settles it', async () => {
    assert.equal((await as.rep('PUT', { id: Q.back, approvalNote: 'forged — all fine' })).status, 200);
    assert.equal((await row(Q.back)).approvalNote, 'Bring it under 20%', 'a save does not write it');
    const made = await as.rep('POST', { id: 'q_itest_qappr_new', opportunityId: OPP.mine, approvalNote: 'forged', lineItems: lines(0) });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    assert.equal((await row('q_itest_qappr_new')).approvalNote, null, 'a new quote carries none');
    assert.equal((await as.rep('PUT', { id: Q.back, status: 'Pending Approval' })).status, 200);
    assert.equal((await row(Q.back)).approvalNote, 'Bring it under 20%', 'the approver sees why it came back');
    const ok = await as.mgr('PUT', { id: Q.back, status: 'Approved' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const r = await row(Q.back);
    assert.equal(r.status, 'Approved');
    assert.equal(r.approvalNote, null, 'settled');
    assert.equal(r.approvedBy, 'Itest Qappr mgr');
});

test('LOST: a quote waiting for approval is not marked Rejected / Lost — the approver sends it back, the rep withdraws it', async () => {
    const res = await as.mgr('PUT', { id: Q.lost, status: 'Rejected / Lost' });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /sent back to the rep, not marked lost/);
    assert.equal((await row(Q.lost)).status, 'Pending Approval');
});

test('A DECISION names only its status: the stored quote is what is approved — every line kept', async () => {
    const res = await as.mgr('PUT', { id: Q.other, status: 'Approved' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const r = await row(Q.other);
    assert.equal(r.status, 'Approved');
    assert.equal(r.lineItems.length, 1);
    assert.equal(Number(r.lineItems[0].discountPct), 25);
});

// ── THE RECORD ───────────────────────────────────────────────────────────────

test('RECORD: the approval flow of 90 days, and one quote\'s history, reach a caller for the quotes she can see — never another rep\'s or another org\'s; no Clerk id leaves', async () => {
    const repFlow = await as.rep('GET', undefined, { activity: 'true' });
    assert.equal(repFlow.status, 200, JSON.stringify(repFlow.body));
    const repIds = new Set(repFlow.body.events.map(e => e.quoteId));
    for (const id of [Q.back, Q.wd, Q.statA, Q.statB]) assert.ok(repIds.has(id), `hers: ${id}`);
    assert.ok(!repIds.has(Q.other), 'not another rep\'s');
    assert.ok(!repIds.has(Q.b), 'not org B\'s');
    assert.ok(repFlow.body.events.every(e => APPROVAL_FLOW_ACTIONS.includes(e.action)), 'the approval flow only');
    assert.ok(repFlow.body.events.every(e => Date.parse(e.at) >= Date.now() - 91 * 24 * H), 'nothing older than the 90 days');
    assert.ok(repFlow.body.events.every(e => !('userId' in e)), 'the Clerk id stays on the server');
    assert.equal(repFlow.body.events.filter(e => e.quoteId === Q.statA && e.action === 'quote.approved').length, 1, 'the 100-day-old approval is not read');

    const mgrIds = new Set((await as.mgr('GET', undefined, { activity: 'true' })).body.events.map(e => e.quoteId));
    assert.ok(mgrIds.has(Q.other), 'a Manager reads the org\'s');
    assert.ok(!mgrIds.has(Q.b));
    const bFlow = parse(await quotesFn(ev(B, 'Manager', CLERK.mgrB, 'GET', undefined, { activity: 'true' })));
    assert.deepEqual([...new Set(bFlow.body.events.map(e => e.quoteId))], [Q.b], 'org B: its own');

    const hist = await as.rep('GET', undefined, { activity: 'true', quoteId: Q.back });
    assert.equal(hist.status, 200);
    assert.deepEqual(hist.body.events.map(e => e.action).filter(a => a !== 'quote.updated'), ['quote.sentback', 'quote.submitted', 'quote.approved'], 'oldest first');
    assert.equal(sendBackNoteOf(hist.body.events.find(e => e.action === 'quote.sentback').detail), 'Bring it under 20%');
    assert.equal((await as.other('GET', undefined, { activity: 'true', quoteId: Q.back })).status, 404, 'another rep: as if it did not exist');
    assert.equal(parse(await quotesFn(ev(B, 'Admin', CLERK.mgrB, 'GET', undefined, { activity: 'true', quoteId: Q.back }))).status, 404, 'org B');
    assert.equal((await as.rep('GET', undefined, { activity: 'true', quoteId: 'q_itest_qappr_nope' })).status, 404);
});

test('FORGERY: a member cannot post a quote event to the audit log — not even an Admin; the app\'s own entries still post', async () => {
    const post = (body, role = 'User', user = CLERK.rep) => auditFn(ev(A, role, user, 'POST', body)).then(parse);
    const forged = [
        { id: 'audit_itest_qappr_forge1', action: 'quote.approved', entityType: 'quote', entityId: Q.lost },
        { id: 'audit_itest_qappr_forge2', action: ' Quote.Approved ', entityType: 'account', entityId: Q.lost },
        { id: 'audit_itest_qappr_forge3', action: 'update', entityType: 'Quote', entityId: Q.lost },
    ];
    for (const body of forged) assert.equal((await post(body)).status, 403, JSON.stringify(body));
    assert.equal((await post({ id: 'audit_itest_qappr_forge4', action: 'quote.sentback', entityType: 'quote', entityId: Q.lost }, 'Admin', CLERK.admin)).status, 403);
    for (const id of ['audit_itest_qappr_forge1', 'audit_itest_qappr_forge2', 'audit_itest_qappr_forge3', 'audit_itest_qappr_forge4']) {
        assert.equal((await db.select().from(auditLog).where(eq(auditLog.id, id))).length, 0, `${id} not written`);
    }
    const fine = await post({ id: 'audit_itest_qappr_ok', action: 'update', entityType: 'account', entityId: 'acct_itest_qappr', entityName: 'Itest account' });
    assert.equal(fine.status, 201, JSON.stringify(fine.body));
});

test('STATS: the tier statistics are the record\'s — the decisions of 90 days and the quotes waiting now; for the roles that approve', async () => {
    assert.equal((await as.rep('GET', undefined, { approvalStats: 'true' })).status, 403);
    const res = await as.mgr('GET', undefined, { approvalStats: 'true' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const by = Object.fromEntries(res.body.approvalStats.map(s => [s.tier, s]));
    assert.deepEqual(by['Mgr approval'], { tier: 'Mgr approval', quotes: 2, approved: 1, sentBack: 1, pending: 0, avgHours: 4 },
        'approved after 6 h, sent back after 2 h; the approval 100 days ago not counted');
    assert.equal(by['VP approval'].approved, 2, 'Q.back and Q.other');
    assert.equal(by['VP approval'].sentBack, 1, 'Q.back');
    assert.equal(by['VP approval'].pending, 1, 'Q.lost waits');
    assert.ok(res.body.approvalStats.every(s => !('declined' in s)), 'no status nothing sets');
});
