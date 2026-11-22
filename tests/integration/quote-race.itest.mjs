// tests/integration/quote-race.itest.mjs
// §0.277 against the real test database (OPEN_ITEMS §4.8, §0.275's found (2) and (4); Jeff, 20 Nov: "Quote Accept +
// email"): a quote's writes were decided on reads — its deal's owner (dealAccess), its status and terms — and then ran
// with only the id and the org in their filters. A rep's Accept wrote the deal's value and the quote after the deal was
// handed to another rep; a save landed over a quote another save had changed; a create landed on a deal no longer the
// rep's; and the quote email went out — it cannot be taken back — before anything was written. Staged where it happens:
// the real _dealAccess.mjs with dealAccess wrapped to make the other session's move — once, when armed — the moment the
// check answers yes.
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
            return { userId: event.headers['x-test-user'], orgId, userRole: event.headers['x-test-role'] || 'User', managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: gate.requireWrite, requireRole: gate.requireRole,
    },
});
// The mailer records what it is handed, never sends — and fails when told to.
const mails = [];
let mailFails = false;
let mailHook = null;   // another session's move while the email is out — once, when armed
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: {
        sendEmail: async (o) => { const h = mailHook; mailHook = null; if (h) await h(); if (mailFails) throw new Error('TEST made-up send failure'); mails.push(o); return { success: true }; },
        emailTemplates: new Proxy({}, { get: () => () => ({ subject: '', html: '' }) }),
    },
});
mock.module(new URL('../../netlify/functions/send-slack.mjs', import.meta.url).href, {
    namedExports: {
        sendSlack: async () => true, sendSlackToOrg: async () => true,
        postDealEvents: async () => {}, postBulkStageMove: async () => {},
        slackTemplates: new Proxy({}, { get: () => () => ({ text: '' }) }),
    },
});
// The other session's move, staged: once, when armed, the moment the deal check answers.
let armed = null;
const access = await import('../../netlify/functions/_dealAccess.mjs');
mock.module(new URL('../../netlify/functions/_dealAccess.mjs', import.meta.url).href, {
    namedExports: { ...access, dealAccess: async (...a) => { const r = await access.dealAccess(...a); const h = armed; armed = null; if (h) await h(); return r; } },
});

const { handler: quotesFn } = await import('../../netlify/functions/quotes.mjs');
const { handler: emailFn } = await import('../../netlify/functions/quote-email.mjs');
const { db } = await import('../../db/index.js');
const schema = await import('../../db/schema.js');
const { users, quotes, opportunities } = schema;
const { eq, and } = await import('drizzle-orm');
const lib = await import('../../netlify/functions/_lib.mjs');

// ORG NAMESPACE: this file owns 'itest_quote_race_*', and only this file writes to it.
const A = 'itest_quote_race_A';
const CLERK = { rep: 'clerk_itest_quote_race_rep', admin: 'clerk_itest_quote_race_admin' };
const USR = { rep: 'usr_itest-quote-race-rep', other: 'usr_itest-quote-race-other', admin: 'usr_itest-quote-race-admin' };
const LINES = [{ id: 'l1', name: 'Custom work', listPrice: 1000, quantity: 2 }];

const ev = (role, user, method, body) => ({
    httpMethod: method,
    headers: { 'x-test-org': A, 'x-test-role': role, 'x-test-user': user, 'content-type': 'application/json' },
    body: JSON.stringify(body), queryStringParameters: {},
});
const dealOf = async (id) => (await db.select().from(opportunities).where(and(eq(opportunities.id, id), eq(opportunities.orgId, A))))[0];
const quoteOf = async (id) => (await db.select().from(quotes).where(and(eq(quotes.id, id), eq(quotes.orgId, A))))[0];
const seed = async (tag, status) => {
    const deal = `itest_quote_race_deal_${tag}`, quote = `itest_quote_race_q_${tag}`;
    await db.delete(quotes).where(and(eq(quotes.id, quote), eq(quotes.orgId, A)));
    await db.delete(opportunities).where(and(eq(opportunities.id, deal), eq(opportunities.orgId, A)));
    await db.insert(opportunities).values({ id: deal, orgId: A, opportunityName: 'Deal ' + tag, account: 'Acct', pipelineId: 'default', stage: 'Proposal', arr: '5.00', ownerId: USR.rep, salesRep: 'Itest Quote Rep' });
    await db.insert(quotes).values({ id: quote, orgId: A, opportunityId: deal, quoteNumber: 'Q-RACE-' + tag, version: 1, name: 'Quote ' + tag, status, lineItems: LINES, billingContact: 'buyer@itest.local', notes: 'as filed' });
    return { deal, quote };
};
const reassign = (deal) => async () => { await db.update(opportunities).set({ ownerId: USR.other, salesRep: 'Itest Quote Other' }).where(and(eq(opportunities.id, deal), eq(opportunities.orgId, A))); };
const touch = (quote, set) => async () => { await db.update(quotes).set({ ...set, updatedAt: new Date() }).where(and(eq(quotes.id, quote), eq(quotes.orgId, A))); };
const said = (res) => JSON.parse(res.body).error;

const cleanup = async () => {
    await db.delete(quotes).where(eq(quotes.orgId, A));
    await db.delete(opportunities).where(eq(opportunities.orgId, A));
    await db.delete(users).where(eq(users.orgId, A));
    await db.delete(schema.auditLog).where(eq(schema.auditLog.orgId, A));
};
before(async () => {
    await cleanup();
    await db.insert(users).values([
        { id: USR.rep,   clerkUserId: CLERK.rep,   orgId: A, name: 'Itest Quote Rep',   email: 'quote-race-rep@itest.local',   role: 'User' },
        { id: USR.other, clerkUserId: 'clerk_itest_quote_race_other', orgId: A, name: 'Itest Quote Other', email: 'quote-race-other@itest.local', role: 'User' },
        { id: USR.admin, clerkUserId: CLERK.admin, orgId: A, name: 'Itest Quote Admin', email: 'quote-race-admin@itest.local', role: 'Admin' },
    ]);
    lib.invalidateRoster();
});
after(async () => { armed = null; mailFails = false; await cleanup(); });

test("§0.277 a rep's Accept of a quote whose deal was handed to another rep after the check passed writes nothing — 404, as a quote on a deal the rep cannot see answers (never 'it is not yours'); the deal's value and the quote as they were", async () => {
    const { deal, quote } = await seed('accept', 'Sent to Customer');
    armed = reassign(deal);
    const res = await quotesFn(ev('User', CLERK.rep, 'PUT', { id: quote, status: 'Accepted' }));
    assert.equal(armed, null, 'the move ran');
    assert.equal(res.statusCode, 404, res.body);
    assert.equal(said(res), 'Quote not found');
    assert.equal((await dealOf(deal)).arr, '5.00', "the other rep's deal value untouched");
    assert.equal((await quoteOf(quote)).status, 'Sent to Customer');
});

test("§0.277 a rep's save of a quote another save changed after it was read writes nothing — 409 naming what it is now; the other save stands", async () => {
    const { quote } = await seed('edit', 'Draft');
    armed = touch(quote, { notes: 'the other save' });
    const res = await quotesFn(ev('User', CLERK.rep, 'PUT', { id: quote, notes: 'rep edit' }));
    assert.equal(res.statusCode, 409, res.body);
    // Moved in §0.280: the quote as it stands comes with the refusal, for the screen to show — no "reload it to see it".
    assert.equal(said(res), 'This quote changed since it was opened — it is Draft now. Nothing was saved.');
    assert.equal(JSON.parse(res.body).code, 'stale');
    assert.equal(JSON.parse(res.body).quote.notes, 'the other save');
    assert.equal((await quoteOf(quote)).notes, 'the other save');
});

test("§0.277 a rep's new quote on a deal handed to another rep after the check passed is not made — 404, the deal no longer one the rep sees", async () => {
    const { deal } = await seed('create', 'Draft');
    armed = reassign(deal);
    const id = 'itest_quote_race_q_created';
    const res = await quotesFn(ev('User', CLERK.rep, 'POST', { id, opportunityId: deal, name: 'New', lineItems: LINES }));
    assert.equal(res.statusCode, 404, res.body);
    assert.equal(said(res), 'Deal not found');
    assert.equal(await quoteOf(id), undefined);
});

test("§0.277 the quote email: a deal handed to another rep after the check passed — no email, 404 (a deal the rep cannot see), the quote as it was", async () => {
    const { deal, quote } = await seed('mail1', 'Approved');
    const before = mails.length;
    armed = reassign(deal);
    const res = await emailFn(ev('User', CLERK.rep, 'POST', { quoteId: quote }));
    assert.equal(res.statusCode, 404, res.body);
    assert.equal(mails.length, before, 'no email went out');
    assert.equal((await quoteOf(quote)).status, 'Approved');
});

test('§0.277 the quote email: a quote sent back (Draft again) after the check passed — no email, 409 saying what it is now', async () => {
    const { quote } = await seed('mail2', 'Approved');
    const before = mails.length;
    armed = touch(quote, { status: 'Draft' });
    const res = await emailFn(ev('User', CLERK.rep, 'POST', { quoteId: quote }));
    assert.equal(res.statusCode, 409, res.body);
    assert.equal(said(res), 'This quote is Draft now — it changed since it was opened. Nothing was sent.');
    assert.equal(mails.length, before);
    assert.equal((await quoteOf(quote)).status, 'Draft');
});

test('§0.277 the quote email: a send that fails puts the quote back as it was — never left Sent with no email', async () => {
    const { quote } = await seed('mail3', 'Approved');
    mailFails = true;
    try {
        const res = await emailFn(ev('User', CLERK.rep, 'POST', { quoteId: quote }));
        assert.equal(res.statusCode, 500, res.body);
    } finally { mailFails = false; }
    const back = await quoteOf(quote);
    assert.equal(back.status, 'Approved');
    assert.equal(back.sentAt, null);
});

test('§0.277 with no move: a rep\'s email goes and marks the quote Sent (a sent quote sent again is a resend the rules allow — not a move); a rep\'s Accept writes the deal\'s value and the quote together', async () => {
    const { quote } = await seed('mail4', 'Approved');
    const before = mails.length;
    const res = await emailFn(ev('User', CLERK.rep, 'POST', { quoteId: quote }));
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(mails.length, before + 1);
    assert.equal((await quoteOf(quote)).status, 'Sent to Customer');
    const { deal, quote: q2 } = await seed('accept2', 'Sent to Customer');
    const ok = await quotesFn(ev('User', CLERK.rep, 'PUT', { id: q2, status: 'Accepted' }));
    assert.equal(ok.statusCode, 200, ok.body);
    assert.equal((await quoteOf(q2)).status, 'Accepted');
    assert.equal((await dealOf(deal)).arr, '2000.00', 'the accepted value is the deal\'s');
});

test('§0.277 the review: a Draft whose terms another save changed after the email read it — no email, 409; the edit stands, still Draft', async () => {
    const { quote } = await seed('mail5', 'Draft');
    const before = mails.length;
    armed = touch(quote, { notes: 'edited meanwhile', lineItems: [{ id: 'l1', name: 'Custom work', listPrice: 9000, quantity: 1 }] });
    const res = await emailFn(ev('User', CLERK.rep, 'POST', { quoteId: quote }));
    assert.equal(res.statusCode, 409, res.body);
    assert.equal(said(res), 'This quote is Draft now — it changed since it was opened. Nothing was sent.');
    assert.equal(mails.length, before, 'the old terms never reached the customer');
    const back = await quoteOf(quote);
    assert.equal(back.status, 'Draft');
    assert.equal(back.notes, 'edited meanwhile');
});

test('§0.277 the review: two sends in flight — the one that lands first emails; the other is 409 `already`, no second email', async () => {
    const { quote } = await seed('mail6', 'Approved');
    const before = mails.length;
    let other = null;
    armed = async () => { other = await emailFn(ev('User', CLERK.rep, 'POST', { quoteId: quote })); };
    const res = await emailFn(ev('User', CLERK.rep, 'POST', { quoteId: quote }));
    assert.equal(other?.statusCode, 200, other?.body);
    assert.equal(res.statusCode, 409, res.body);
    assert.equal(JSON.parse(res.body).code, 'already');
    assert.equal(mails.length, before + 1, 'one email');
});

test("§0.277 the review: a failed send's put-back holds its mark — an Accept that landed while the email was out stands", async () => {
    const { quote } = await seed('mail7', 'Approved');
    mailFails = true;
    mailHook = touch(quote, { status: 'Accepted' });
    try {
        const res = await emailFn(ev('User', CLERK.rep, 'POST', { quoteId: quote }));
        assert.equal(res.statusCode, 500, res.body);
    } finally { mailFails = false; mailHook = null; }
    assert.equal((await quoteOf(quote)).status, 'Accepted', 'never put back over a move that landed since');
});

test('§0.277 the review: the same Accept in flight twice — the one that lands writes; the other is 409 `already` (read by the screen as done)', async () => {
    const { deal, quote } = await seed('accept3', 'Sent to Customer');
    let other = null;
    armed = async () => { other = await quotesFn(ev('User', CLERK.rep, 'PUT', { id: quote, status: 'Accepted' })); };
    const res = await quotesFn(ev('User', CLERK.rep, 'PUT', { id: quote, status: 'Accepted' }));
    assert.equal(other?.statusCode, 200, other?.body);
    assert.equal(res.statusCode, 409, res.body);
    assert.equal(JSON.parse(res.body).code, 'already');
    assert.equal((await dealOf(deal)).arr, '2000.00');
});

test("§0.277 an Admin is not held to the deal's owner — the same move does not stop their Accept", async () => {
    const { deal, quote } = await seed('admin', 'Sent to Customer');
    armed = reassign(deal);
    const res = await quotesFn(ev('Admin', CLERK.admin, 'PUT', { id: quote, status: 'Accepted' }));
    assert.equal(res.statusCode, 200, res.body);
    assert.equal((await dealOf(deal)).arr, '2000.00');
});
