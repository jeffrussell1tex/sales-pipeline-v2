// tests/integration/quotes-access.itest.mjs
// Commit (C) — quotes belong to their deal, and the rules hold on the server
// (state §0.155) — against the real test database. Proves, on quotes.mjs,
// quote-email.mjs and quote-to-job.mjs:
//   READ   a rep receives the quotes on HER deals and no one else's (the
//          unassigned ones only where the org's switch shows them — off here);
//          Admin, Manager and a Dispatcher the org's; ReadOnly its own (none);
//          a Technician none; org B's never reach org A, nor A's B
//   WRITE  a quote is created only on a deal the caller may change, as a Draft,
//          by the roster's name; a PUT never creates, merges over the stored row,
//          keeps the stored deal; only a Manager or Admin approves (by name);
//          a discount that needs approval is not sent before it; an accepted
//          quote is final; an approved one that is edited returns to Draft; an
//          accept pushes the value to the STORED deal
//   EMAIL  the CRM's writers only, the deal's writer only, by the send rule;
//          every value escaped; the sender's signature found (by the Clerk id)
//   JOB    the quote card's read answers only for a quote the caller can see
//
// The auth mock fakes the SIGN-IN only and re-exports the REAL gate (_roleGate.mjs)
// and predicates (src/utils/roles.js); the deal rule (_dealAccess.mjs) and the quote
// rule (src/utils/quoteRules.js) are the real ones. Mail is captured, never sent.
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
            const userId = event.headers?.['x-test-user'] || 'clerk_itest_quotes_nobody';
            return { userId, orgId, userRole, managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: gate.requireWrite, requireRole: gate.requireRole,
    },
});
const mails = [];
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: { sendEmail: async (o) => { mails.push(o); return { success: true }; }, emailTemplates: new Proxy({}, { get: () => () => ({}) }) },
});
mock.module(new URL('../../netlify/functions/send-sms.mjs', import.meta.url).href, {
    namedExports: { sendSms: async () => ({ success: true }), smsTemplates: {}, normalizePhone: (p) => p },
});

const { handler: quotesFn } = await import('../../netlify/functions/quotes.mjs');
const { handler: emailFn }  = await import('../../netlify/functions/quote-email.mjs');
const { handler: toJobFn }  = await import('../../netlify/functions/quote-to-job.mjs');
const { db } = await import('../../db/index.js');
const { users, opportunities, quotes, auditLog, settings } = await import('../../db/schema.js');
const { eq, and } = await import('drizzle-orm');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');

// ORG NAMESPACE: this file owns 'itest_quotes_*', and only this file writes to it.
const A = 'itest_quotes_A', B = 'itest_quotes_B';
const CLERK = {
    rep: 'clerk_itest_quotes_rep', other: 'clerk_itest_quotes_other', mgr: 'clerk_itest_quotes_mgr', admin: 'clerk_itest_quotes_admin',
    disp: 'clerk_itest_quotes_disp', ro: 'clerk_itest_quotes_ro', tech: 'clerk_itest_quotes_tech', repB: 'clerk_itest_quotes_rep_b',
};
const USR = {
    rep: 'usr_itest-quotes-rep', other: 'usr_itest-quotes-other', mgr: 'usr_itest-quotes-mgr', admin: 'usr_itest-quotes-admin',
    disp: 'usr_itest-quotes-disp', ro: 'usr_itest-quotes-ro', tech: 'usr_itest-quotes-tech', repB: 'usr_itest-quotes-rep-b',
};
const OPP = { mine: 'opp_itest_quotes_mine', other: 'opp_itest_quotes_other', none: 'opp_itest_quotes_none', b: 'opp_itest_quotes_b' };
const Q = {
    draft: 'q_itest_quotes_draft',           // mine, Draft, 5% — within the rep's discretion
    over: 'q_itest_quotes_over',             // mine, Draft, 25% — needs approval
    pending: 'q_itest_quotes_pending',       // mine, Pending Approval, 15%
    approvedSend: 'q_itest_quotes_appr_send',// mine, Approved — to be sent
    approvedEdit: 'q_itest_quotes_appr_edit',// mine, Approved — to be edited
    approvedMail: 'q_itest_quotes_appr_mail',// mine, Approved — to be emailed
    accepted: 'q_itest_quotes_accepted',     // mine, Accepted
    sent: 'q_itest_quotes_sent',             // mine, Sent to Customer — to be accepted
    other: 'q_itest_quotes_other',           // another rep's deal
    none: 'q_itest_quotes_none',             // the unassigned deal
    b: 'q_itest_quotes_b',                   // org B
};
const A_QUOTES = [Q.draft, Q.over, Q.pending, Q.approvedSend, Q.approvedEdit, Q.approvedMail, Q.accepted, Q.sent, Q.other, Q.none];
const MINE = [Q.draft, Q.over, Q.pending, Q.approvedSend, Q.approvedEdit, Q.approvedMail, Q.accepted, Q.sent];
const lines = (disc) => [{ productId: 'p_itest_quotes', productName: 'Itest Platform', productType: 'recurring', unit: 'month', listPrice: 100, quantity: 2, discountPct: disc }];
// An approved quote carries the approver's stamp — what an edit must clear.
const APPROVED = { approvedBy: 'Itest Quotes mgr', approvedAt: new Date('2026-09-30T12:00:00Z') };

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
const ids = (res) => (res.body.quotes || []).map(q => q.id).filter(id => id.startsWith('q_itest_quotes_')).sort();
const row = async (id) => (await db.select().from(quotes).where(eq(quotes.id, id)))[0];

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
    const u = (key, role, org = A, extra = {}) => ({ id: USR[key], clerkUserId: CLERK[key], orgId: org, name: `Itest Quotes ${key}`, email: `quotes-${key}@itest.local`, role, ...extra });
    await db.insert(users).values([
        u('rep', 'User', A, { profile: { emailSignature: 'Itest Rep <b>Sales</b>' } }), u('other', 'User'), u('mgr', 'Manager'), u('admin', 'Admin'),
        u('disp', 'Dispatcher'), u('ro', 'ReadOnly'), u('tech', 'Technician'), u('repB', 'User', B),
    ]);
    invalidateRoster();
    const opp = (id, org, ownerKey) => ({ id, orgId: org, ownerId: ownerKey ? USR[ownerKey] : null, salesRep: ownerKey ? `Itest Quotes ${ownerKey}` : '', opportunityName: id, account: 'Itest Co', pipelineId: 'default', stage: 'Proposal', arr: '1000.00' });
    await db.insert(opportunities).values([opp(OPP.mine, A, 'rep'), opp(OPP.other, A, 'other'), opp(OPP.none, A, null), opp(OPP.b, B, null)]);
    const q = (id, opportunityId, status, disc, extra = {}) => ({
        id, orgId: opportunityId === OPP.b ? B : A, opportunityId, quoteNumber: 'Q-2026-9' + (10 + Object.values(Q).indexOf(id)),
        version: 1, name: id, status, lineItems: lines(disc), createdBy: 'Itest Quotes rep', ...extra,
    });
    await db.insert(quotes).values([
        q(Q.draft, OPP.mine, 'Draft', 5), q(Q.over, OPP.mine, 'Draft', 25), q(Q.pending, OPP.mine, 'Pending Approval', 15),
        q(Q.approvedSend, OPP.mine, 'Approved', 15, APPROVED), q(Q.approvedEdit, OPP.mine, 'Approved', 15, APPROVED),
        q(Q.approvedMail, OPP.mine, 'Approved', 15, { ...APPROVED, billingContact: 'Pat Buyer <pat@itest.example.com>', notes: 'Terms <script>alert(1)</script> & more', paymentTerms: 'Net 30 <i>annual</i>' }),
        q(Q.accepted, OPP.mine, 'Accepted', 5), q(Q.sent, OPP.mine, 'Sent to Customer', 5),
        q(Q.other, OPP.other, 'Draft', 5), q(Q.none, OPP.none, 'Draft', 5), q(Q.b, OPP.b, 'Draft', 5),
    ]);
});
after(cleanup);

// ── READ ─────────────────────────────────────────────────────────────────────

test('READ: a rep receives her deals\' quotes and no one else\'s; the whole-org roles receive the org\'s; ReadOnly its own; a Technician none; org B never', async () => {
    assert.deepEqual(ids(await as.rep('GET')), [...MINE].sort(), 'the rep: her deal\'s quotes — not another rep\'s, not the unassigned deal\'s (the switch is off)');
    assert.deepEqual(ids(await as.other('GET')), [Q.other], 'the other rep: his');
    for (const [role, user] of [['Admin', CLERK.admin], ['Manager', CLERK.mgr], ['Dispatcher', CLERK.disp]]) {
        const got = ids(parse(await quotesFn(ev(A, role, user))));
        assert.deepEqual(got, [...A_QUOTES].sort(), `${role}: the org's quotes, and not org B's`);
    }
    assert.deepEqual(ids(parse(await quotesFn(ev(A, 'ReadOnly', CLERK.ro)))), [], 'ReadOnly reads its own — it owns none');
    const tech = parse(await quotesFn(ev(A, 'Technician', CLERK.tech)));
    assert.equal(tech.status, 200);
    assert.deepEqual(ids(tech), [], 'a Technician reads no quotes');
    assert.deepEqual(ids(parse(await quotesFn(ev(B, 'User', CLERK.repB)))), [], 'org B: the unassigned deal is hidden from its rep too');
    assert.deepEqual(ids(parse(await quotesFn(ev(B, 'Admin', CLERK.admin)))), [Q.b], 'org B\'s Admin: B\'s quote only');
    assert.deepEqual(ids(await as.rep('GET', undefined, { opportunityId: OPP.other })), [], 'another rep\'s deal, asked for by id: nothing');
    assert.deepEqual(ids(await as.rep('GET', undefined, { opportunityId: OPP.mine })), [...MINE].sort());
    assert.equal((await as.rep('GET', undefined, { approvalStats: 'true' })).status, 403, 'the approval statistics count every rep\'s quotes');
    assert.equal((await as.mgr('GET', undefined, { approvalStats: 'true' })).status, 200);
});

// ── WRITE ────────────────────────────────────────────────────────────────────

test('POST: a quote only on a deal the caller may change — as a Draft, by the roster\'s name; ReadOnly and a Dispatcher write none', async () => {
    assert.equal((await as.rep('POST', { id: 'q_itest_quotes_new_other', opportunityId: OPP.other })).status, 404, 'another rep\'s deal — not one she can see');
    assert.equal((await as.rep('POST', { id: 'q_itest_quotes_new_none', opportunityId: OPP.none })).status, 404, 'the unassigned deal the switch hides');
    assert.equal(parse(await quotesFn(ev(B, 'User', CLERK.repB, 'POST', { id: 'q_itest_quotes_new_b', opportunityId: OPP.mine }))).status, 404, 'org A\'s deal from org B');
    for (const [role, user] of [['ReadOnly', CLERK.ro], ['Dispatcher', CLERK.disp], ['Technician', CLERK.tech]]) {
        assert.equal(parse(await quotesFn(ev(A, role, user, 'POST', { id: `q_itest_quotes_new_${role}`, opportunityId: OPP.mine }))).status, 403, role);
    }
    const made = await as.rep('POST', { id: 'q_itest_quotes_new_mine', opportunityId: OPP.mine, status: 'Approved', createdBy: 'Someone Else', lineItems: lines(0) });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    assert.equal(made.body.quote.status, 'Draft', 'a POST is a Draft, whatever the body says');
    assert.equal(made.body.quote.createdBy, 'Itest Quotes rep', 'the author from the roster');
    for (const id of ['q_itest_quotes_new_other', 'q_itest_quotes_new_none', 'q_itest_quotes_new_b', 'q_itest_quotes_new_ReadOnly', 'q_itest_quotes_new_Dispatcher']) {
        assert.equal(await row(id), undefined, `${id} never written`);
    }
});

test('PUT: never creates; another rep\'s quote is a 404; the stored deal stays; a partial save keeps what it leaves out', async () => {
    const ghost = await as.rep('PUT', { id: 'q_itest_quotes_ghost', opportunityId: OPP.mine, status: 'Accepted' });
    assert.equal(ghost.status, 404);
    assert.equal(await row('q_itest_quotes_ghost'), undefined, 'the upsert that created any quote in any status is gone');
    assert.equal((await as.other('PUT', { id: Q.draft, notes: 'mine now' })).status, 404, 'a quote on a deal he cannot see');
    assert.equal(parse(await quotesFn(ev(B, 'Admin', CLERK.admin, 'PUT', { id: Q.draft, notes: 'from B' }))).status, 404, 'org B');
    const moved = await as.rep('PUT', { id: Q.draft, opportunityId: OPP.other, name: 'renamed' });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    const r = await row(Q.draft);
    assert.equal(r.opportunityId, OPP.mine, 'the body\'s deal is ignored — the quote stays on its own');
    assert.equal(r.lineItems.length, 1, 'a PUT without lineItems keeps them (it used to write [] and zero totals)');
    assert.equal(Number(r.totalValue), 190, 'and the totals: 2 × 100 at 5%');
});

test('APPROVAL: only a Manager or an Admin approves — by name; a rep\'s "Approved" is refused and changes nothing', async () => {
    const rep = await as.rep('PUT', { id: Q.pending, status: 'Approved' });
    assert.equal(rep.status, 403);
    assert.match(rep.body.error, /Only an Admin or a Manager approves/);
    assert.equal((await row(Q.pending)).status, 'Pending Approval');
    const mgr = await as.mgr('PUT', { id: Q.pending, status: 'Approved' });
    assert.equal(mgr.status, 200, JSON.stringify(mgr.body));
    const r = await row(Q.pending);
    assert.equal(r.status, 'Approved');
    assert.equal(r.approvedBy, 'Itest Quotes mgr', 'the approver\'s name, not a Clerk id');
    assert.ok(r.approvedAt);
    const audit = await db.select().from(auditLog).where(and(eq(auditLog.orgId, A), eq(auditLog.entityId, Q.pending), eq(auditLog.action, 'quote.approved')));
    assert.equal(audit.length, 1);
});

test('SEND: a discount that needs approval is not sent before it; an approved quote is — stamped and audited as sent', async () => {
    const early = await as.rep('PUT', { id: Q.over, status: 'Sent to Customer' });
    assert.equal(early.status, 409);
    assert.match(early.body.error, /needs approval before the quote is sent/);
    assert.equal((await row(Q.over)).status, 'Draft');
    const ok = await as.rep('PUT', { id: Q.approvedSend, status: 'Sent to Customer' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const r = await row(Q.approvedSend);
    assert.equal(r.status, 'Sent to Customer');
    assert.ok(r.sentAt, 'sentAt stamped — the old word map never matched the stored word');
    const audit = await db.select().from(auditLog).where(and(eq(auditLog.orgId, A), eq(auditLog.entityId, Q.approvedSend), eq(auditLog.action, 'quote.sent')));
    assert.equal(audit.length, 1, 'audited as a send, not a plain update');
    const again = await as.rep('PUT', { id: Q.approvedSend, lineItems: lines(40) });
    assert.equal(again.status, 409, 'a sent quote\'s lines are final');
    assert.match(again.body.error, /lines and terms are final/);
});

test('FINAL and RE-APPROVAL: an accepted quote refuses a change and a move; an approved one that is edited returns to Draft without its approval', async () => {
    const lineChange = await as.rep('PUT', { id: Q.accepted, lineItems: lines(30) });
    assert.equal(lineChange.status, 409);
    assert.match(lineChange.body.error, /accepted quote is final/);
    const back = await as.mgr('PUT', { id: Q.accepted, status: 'Sent to Customer' });
    assert.equal(back.status, 409, 'not even a Manager sends an accepted quote back');
    assert.equal((await row(Q.accepted)).status, 'Accepted');
    const edited = await as.rep('PUT', { id: Q.approvedEdit, lineItems: lines(40) });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    const r = await row(Q.approvedEdit);
    assert.equal(r.status, 'Draft', 'the approval no longer matches what would be sent');
    assert.equal(r.approvedBy, null);
    assert.equal(r.approvedAt, null);
});

test('ACCEPT: the value goes to the STORED deal — never the body\'s', async () => {
    const before = Number((await db.select().from(opportunities).where(eq(opportunities.id, OPP.other)))[0].arr);
    const res = await as.rep('PUT', { id: Q.sent, status: 'Accepted', opportunityId: OPP.other });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const [mine] = await db.select().from(opportunities).where(eq(opportunities.id, OPP.mine));
    const [other] = await db.select().from(opportunities).where(eq(opportunities.id, OPP.other));
    assert.equal(Number(mine.arr), 190, 'the quote\'s own deal carries the accepted value');
    assert.equal(Number(other.arr), before, 'the deal named in the body is untouched');
    assert.ok((await row(Q.sent)).acceptedAt);
});

// ── EMAIL ────────────────────────────────────────────────────────────────────

test('EMAIL: the CRM\'s writers only, the deal\'s writer only, by the send rule; every value escaped; the signature found by the Clerk id', async () => {
    const send = (org, role, user, quoteId) => emailFn(ev(org, role, user, 'POST', { quoteId })).then(parse);
    // The approval notices the tests above sent (§0.158 — an approval tells the rep) are
    // not this test's to count: only the customer's email is.
    mails.length = 0;
    for (const [role, user] of [['ReadOnly', CLERK.ro], ['Technician', CLERK.tech], ['Dispatcher', CLERK.disp]]) {
        assert.equal((await send(A, role, user, Q.approvedMail)).status, 403, role);
    }
    assert.equal((await send(A, 'User', CLERK.other, Q.approvedMail)).status, 404, 'another rep\'s quote');
    assert.equal((await send(B, 'Admin', CLERK.admin, Q.approvedMail)).status, 404, 'org B');
    const early = await send(A, 'User', CLERK.rep, Q.over);
    assert.equal(early.status, 422, 'the send rule: approval first');
    assert.equal(mails.length, 0, 'nothing went out');
    const ok = await send(A, 'User', CLERK.rep, Q.approvedMail);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(mails.length, 1);
    const html = mails[0].html;
    assert.ok(!html.includes('<script>') && html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; more'), 'the notes, escaped');
    assert.ok(html.includes('Net 30 &lt;i&gt;annual&lt;/i&gt;'), 'the terms, escaped');
    assert.ok(html.includes('Itest Rep &lt;b&gt;Sales&lt;/b&gt;'), 'the sender\'s signature — found by the Clerk id, escaped');
    assert.equal(mails[0].to, 'pat@itest.example.com');
    const r = await row(Q.approvedMail);
    assert.equal(r.status, 'Sent to Customer');
    assert.ok(r.sentAt, 'sentAt stamped');
});

// ── JOB ──────────────────────────────────────────────────────────────────────

test('JOB: the quote card\'s read answers only for a quote the caller can see', async () => {
    const card = (org, role, user, quoteId) => toJobFn(ev(org, role, user, 'GET', undefined, { quoteId })).then(parse);
    const mine = await card(A, 'User', CLERK.rep, Q.accepted);
    assert.equal(mine.status, 200, JSON.stringify(mine.body));
    assert.deepEqual(mine.body, { job: null });
    assert.equal((await card(A, 'User', CLERK.other, Q.accepted)).status, 404, 'another rep\'s quote');
    assert.equal((await card(A, 'Dispatcher', CLERK.disp, Q.accepted)).status, 200, 'the Dispatch roles read the org\'s');
    assert.equal((await card(A, 'Technician', CLERK.tech, Q.accepted)).status, 403, 'a Technician reads no quotes');
    assert.equal((await card(B, 'Admin', CLERK.admin, Q.accepted)).status, 404, 'org B');
});
