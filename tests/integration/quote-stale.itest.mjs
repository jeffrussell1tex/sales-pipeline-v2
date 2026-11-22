// tests/integration/quote-stale.itest.mjs
// §0.280 against the real test database (OPEN_ITEMS §4.8, §0.277's found (a); Jeff, 21 Nov: "Refuse if changed"): a
// Quotes screen acted on a quote it never saw — its copy loaded before another member's press. A rep's Withdraw from a
// screen still showing "waiting for approval" turned an approved quote back to Draft; a Save from a screen loaded before
// another tab's save wrote its copy of the lines back; an Approve went over lines changed since. Staged as it happens: the
// screen's GET (the quote with its stamp), the other press through the handler, then the stale press naming the stamp
// its copy holds.
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
// No mail leaves: an approval's notice is recorded, never sent.
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: {
        sendEmail: async () => ({ success: true }),
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
// The save's own window (§0.277's claim), staged as there: once, when armed, the moment the deal check answers.
let armed = null;
const access = await import('../../netlify/functions/_dealAccess.mjs');
mock.module(new URL('../../netlify/functions/_dealAccess.mjs', import.meta.url).href, {
    namedExports: { ...access, dealAccess: async (...a) => { const r = await access.dealAccess(...a); const h = armed; armed = null; if (h) await h(); return r; } },
});

const { handler: quotesFn } = await import('../../netlify/functions/quotes.mjs');
const { db } = await import('../../db/index.js');
const schema = await import('../../db/schema.js');
const { users, quotes, opportunities, auditLog } = schema;
const { eq, and, sql } = await import('drizzle-orm');
const lib = await import('../../netlify/functions/_lib.mjs');

// ORG NAMESPACE: this file owns 'itest_quote_stale_*', and only this file writes to it.
const A = 'itest_quote_stale_A';
const CLERK = { rep: 'clerk_itest_quote_stale_rep', admin: 'clerk_itest_quote_stale_admin', admin2: 'clerk_itest_quote_stale_admin2' };
const USR = { rep: 'usr_itest-quote-stale-rep', admin: 'usr_itest-quote-stale-admin', admin2: 'usr_itest-quote-stale-admin2' };
const LINES = [{ productId: null, productName: 'Custom work', listPrice: 1000, quantity: 2, discountPct: 0 }];
const THEIR_LINES = [{ productId: null, productName: 'Custom work', listPrice: 1000, quantity: 5, discountPct: 0 }];

const ev = (role, user, method, body, qs = {}) => ({
    httpMethod: method,
    headers: { 'x-test-org': A, 'x-test-role': role, 'x-test-user': user, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), queryStringParameters: qs,
});
const rep = (method, body, qs) => quotesFn(ev('User', CLERK.rep, method, body, qs));
const admin = (method, body, qs) => quotesFn(ev('Admin', CLERK.admin, method, body, qs));
const admin2 = (method, body, qs) => quotesFn(ev('Admin', CLERK.admin2, method, body, qs));
const quoteOf = async (id) => (await db.select().from(quotes).where(and(eq(quotes.id, id), eq(quotes.orgId, A))))[0];
const stampOf = async (id) => (await db.select({ s: sql`${quotes.updatedAt}::text` }).from(quotes).where(and(eq(quotes.id, id), eq(quotes.orgId, A))))[0].s;
// The screen's load: the GET's list, as the Quotes tab holds it.
const loaded = async (who, id) => { const res = await who('GET', undefined, {}); assert.equal(res.statusCode, 200, res.body); return JSON.parse(res.body).quotes.find((q) => q.id === id); };
const body = (res) => JSON.parse(res.body);
const seed = async (tag, status, extra = {}) => {
    const deal = `itest_quote_stale_deal_${tag}`, quote = `itest_quote_stale_q_${tag}`;
    await db.delete(quotes).where(and(eq(quotes.id, quote), eq(quotes.orgId, A)));
    await db.delete(opportunities).where(and(eq(opportunities.id, deal), eq(opportunities.orgId, A)));
    await db.insert(opportunities).values({ id: deal, orgId: A, opportunityName: 'Deal ' + tag, account: 'Acct', pipelineId: 'default', stage: 'Proposal', arr: '5.00', ownerId: USR.rep, salesRep: 'Itest Stale Rep' });
    await db.insert(quotes).values({ id: quote, orgId: A, opportunityId: deal, quoteNumber: 'Q-STALE-' + tag, version: 1, name: 'Quote ' + tag, status, lineItems: LINES, billingContact: 'buyer@itest.local', notes: 'as filed', ...extra });
    return { deal, quote };
};
const audits = async (id, action) => (await db.select().from(auditLog).where(and(eq(auditLog.orgId, A), eq(auditLog.entityId, id), eq(auditLog.action, action)))).length;

const cleanup = async () => {
    await db.delete(quotes).where(eq(quotes.orgId, A));
    await db.delete(opportunities).where(eq(opportunities.orgId, A));
    await db.delete(users).where(eq(users.orgId, A));
    await db.delete(auditLog).where(eq(auditLog.orgId, A));
};
before(async () => {
    await cleanup();
    await db.insert(users).values([
        { id: USR.rep,   clerkUserId: CLERK.rep,   orgId: A, name: 'Itest Stale Rep',   email: 'quote-stale-rep@itest.local',   role: 'User' },
        { id: USR.admin, clerkUserId: CLERK.admin, orgId: A, name: 'Itest Stale Admin', email: 'quote-stale-admin@itest.local', role: 'Admin' },
        { id: USR.admin2, clerkUserId: CLERK.admin2, orgId: A, name: 'Itest Stale Admin Two', email: 'quote-stale-admin2@itest.local', role: 'Admin' },
    ]);
    lib.invalidateRoster();
});
after(async () => { armed = null; await cleanup(); });

test('§0.280 every quote is handed out with its stamp — its last edit as text, as stored: the list, a create, a save', async () => {
    const { deal, quote } = await seed('stamp', 'Draft');
    const listed = await loaded(rep, quote);
    assert.equal(listed.stamp, await stampOf(quote), 'the list');
    const made = await rep('POST', { id: 'itest_quote_stale_q_made', opportunityId: deal, name: 'Made', lineItems: LINES });
    assert.equal(made.statusCode, 201, made.body);
    assert.equal(body(made).quote.stamp, await stampOf('itest_quote_stale_q_made'), "a create's, the database's own default to the microsecond");
    // A press on the create's stamp lands — its own text, never a rounded copy.
    const saved = await rep('PUT', { id: 'itest_quote_stale_q_made', notes: 'first edit', ifStamp: body(made).quote.stamp });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.equal(body(saved).quote.stamp, await stampOf('itest_quote_stale_q_made'), "a save's");
    assert.notEqual(body(saved).quote.stamp, body(made).quote.stamp);
});

test("§0.280 a rep's Withdraw from a screen loaded before an approval moves nothing — 409 stale with the quote as it stands; still approved, its approver kept", async () => {
    const { quote } = await seed('withdraw', 'Pending Approval');
    const screen = await loaded(rep, quote);   // the rep's tab: waiting for approval
    const approved = await admin('PUT', { id: quote, status: 'Approved', ifStamp: (await loaded(admin, quote)).stamp });
    assert.equal(approved.statusCode, 200, approved.body);
    const res = await rep('PUT', { id: quote, status: 'Draft', ifStamp: screen.stamp });
    assert.equal(res.statusCode, 409, res.body);
    assert.equal(body(res).code, 'stale');
    assert.equal(body(res).error, 'This quote changed since it was opened — it is Approved now. Nothing was saved.');
    assert.equal(body(res).quote.status, 'Approved', 'the quote as it stands, for the screen to show');
    assert.equal(body(res).quote.stamp, await stampOf(quote));
    const now = await quoteOf(quote);
    assert.equal(now.status, 'Approved');
    assert.equal(now.approvedBy, 'Itest Stale Admin');
    assert.equal(await audits(quote, 'quote.updated'), 0, 'no move recorded');
});

test("§0.280 a save from a screen loaded before another tab's save writes nothing — 409 stale; the other save's lines and notes stand", async () => {
    const { quote } = await seed('lines', 'Draft');
    const tabA = await loaded(rep, quote);
    const tabB = await rep('PUT', { id: quote, lineItems: THEIR_LINES, notes: 'tab B', ifStamp: tabA.stamp });
    assert.equal(tabB.statusCode, 200, tabB.body);
    const res = await rep('PUT', { id: quote, lineItems: [{ ...LINES[0], quantity: 3 }], ifStamp: tabA.stamp });
    assert.equal(res.statusCode, 409, res.body);
    assert.equal(body(res).code, 'stale');
    assert.equal(body(res).quote.notes, 'tab B');
    const now = await quoteOf(quote);
    assert.equal(now.lineItems[0].quantity, 5, "tab B's lines");
    assert.equal(now.notes, 'tab B');
});

test("§0.280 an Approve from a screen loaded before the lines changed approves nothing — 409 stale; still waiting, no approver", async () => {
    const { quote } = await seed('approve', 'Pending Approval');
    const screen = await loaded(admin, quote);
    // Another writer's change since — the rep withdrew, changed the lines and submitted again; one stamped edit here.
    await db.update(quotes).set({ lineItems: THEIR_LINES, updatedAt: new Date() }).where(and(eq(quotes.id, quote), eq(quotes.orgId, A)));
    const res = await admin('PUT', { id: quote, status: 'Approved', ifStamp: screen.stamp });
    assert.equal(res.statusCode, 409, res.body);
    assert.equal(body(res).code, 'stale');
    const now = await quoteOf(quote);
    assert.equal(now.status, 'Pending Approval');
    assert.equal(now.approvedBy, null);
});

test("§0.280 a Save draft's whole copy — the old screen's body — turns no approval back: refused stale (the button is gone; a stale body naming its stamp is refused)", async () => {
    const { quote } = await seed('copy', 'Pending Approval');
    const screen = await loaded(rep, quote);
    assert.equal((await admin('PUT', { id: quote, status: 'Approved', ifStamp: (await loaded(admin, quote)).stamp })).statusCode, 200);
    const { stamp, ...copy } = screen;
    const res = await rep('PUT', { ...copy, status: 'Draft', ifStamp: stamp });
    assert.equal(res.statusCode, 409, res.body);
    assert.equal((await quoteOf(quote)).status, 'Approved');
});

test("§0.280 a press sent again over the quote it already made is done — 409 'already', one move recorded; a save of the same terms likewise", async () => {
    const { quote } = await seed('again', 'Pending Approval');
    const screen = await loaded(admin, quote);
    assert.equal((await admin('PUT', { id: quote, status: 'Approved', ifStamp: screen.stamp })).statusCode, 200);
    const again = await admin('PUT', { id: quote, status: 'Approved', ifStamp: screen.stamp });   // its answer lost, pressed again
    assert.equal(again.statusCode, 409, again.body);
    assert.equal(body(again).code, 'already');
    assert.equal(await audits(quote, 'quote.approved'), 1, 'approved once');
    const { quote: draft } = await seed('again2', 'Draft');
    const s = (await loaded(rep, draft)).stamp;
    assert.equal((await rep('PUT', { id: draft, notes: 'mine', taxRate: 8.25, ifStamp: s })).statusCode, 200);
    const twice = await rep('PUT', { id: draft, notes: 'mine', taxRate: 8.25, ifStamp: s });
    assert.equal(twice.statusCode, 409, twice.body);
    assert.equal(body(twice).code, 'already');
    // Part of it held is not done: refused stale.
    const part = await rep('PUT', { id: draft, notes: 'mine', taxRate: 9, ifStamp: s });
    assert.equal(body(part).code, 'stale');
    assert.equal((await quoteOf(draft)).taxRate, '8.25');
});

test('§0.280 a press naming the stamp it holds lands, and each answer\'s stamp carries the next; a body naming none is decided as before (the public API)', async () => {
    const { quote } = await seed('fresh', 'Draft');
    let s = (await loaded(rep, quote)).stamp;
    for (const notes of ['one', 'two', 'three']) {
        const res = await rep('PUT', { id: quote, notes, ifStamp: s });
        assert.equal(res.statusCode, 200, res.body);
        s = body(res).quote.stamp;
    }
    assert.equal((await quoteOf(quote)).notes, 'three');
    const api = await rep('PUT', { id: quote, notes: 'by the API' });
    assert.equal(api.statusCode, 200, api.body);
    assert.equal((await quoteOf(quote)).notes, 'by the API');
});

test("§0.280 a change inside the save's own window answers the same — 409 stale with the quote as it stands (§0.277's claim)", async () => {
    const { quote } = await seed('window', 'Draft');
    const s = (await loaded(rep, quote)).stamp;
    armed = async () => { await db.update(quotes).set({ notes: 'the other save', updatedAt: new Date() }).where(and(eq(quotes.id, quote), eq(quotes.orgId, A))); };
    const res = await rep('PUT', { id: quote, notes: 'rep edit', ifStamp: s });
    assert.equal(armed, null, 'the move ran');
    assert.equal(res.statusCode, 409, res.body);
    assert.equal(body(res).code, 'stale');
    assert.equal(body(res).quote.notes, 'the other save');
    assert.equal(body(res).error, 'This quote changed since it was opened — it is Draft now. Nothing was saved.');
});

test("§0.280 review: another member's same move is a change since, never 'already' — a second approver's stale Approve over the first's, a rep's stale Withdraw over a send-back", async () => {
    const { quote } = await seed('theirs', 'Pending Approval');
    const second = await loaded(admin2, quote);   // the second approver's tab
    assert.equal((await admin('PUT', { id: quote, status: 'Approved', ifStamp: (await loaded(admin, quote)).stamp })).statusCode, 200);
    const res = await admin2('PUT', { id: quote, status: 'Approved', ifStamp: second.stamp });
    assert.equal(res.statusCode, 409, res.body);
    assert.equal(body(res).code, 'stale', 'the approval was the first approver\'s, on what they read');
    assert.equal((await quoteOf(quote)).approvedBy, 'Itest Stale Admin');
    const { quote: back } = await seed('sentback', 'Pending Approval');
    const repTab = await loaded(rep, back);
    assert.equal((await admin('PUT', { id: back, status: 'Draft', sendBack: true, sendBackNote: 'Lower the discount', ifStamp: (await loaded(admin, back)).stamp })).statusCode, 200);
    const withdraw = await rep('PUT', { id: back, status: 'Draft', ifStamp: repTab.stamp });
    assert.equal(body(withdraw).code, 'stale', 'sent back by the approver — the rep is shown it, never told their Withdraw landed');
    assert.equal(body(withdraw).quote.approvalNote, 'Lower the discount');
});

test("§0.280 review: a save sent again whose first send landed inside its own window is done — 409 'already', never 'not saved'", async () => {
    const { quote } = await seed('resend', 'Draft');
    const s = (await loaded(rep, quote)).stamp;
    // The first send lands while the second is between its check and its write.
    armed = async () => { const first = await rep('PUT', { id: quote, notes: 'mine', ifStamp: s }); assert.equal(first.statusCode, 200, first.body); };
    const res = await rep('PUT', { id: quote, notes: 'mine', ifStamp: s });
    assert.equal(armed, null, 'the first send ran');
    assert.equal(res.statusCode, 409, res.body);
    assert.equal(body(res).code, 'already');
    assert.equal(await audits(quote, 'quote.updated'), 1, 'saved once');
});

test("§0.280 review: a reminder is no change — the caller's own press sent again after one is still done", async () => {
    const { quote } = await seed('reminded', 'Pending Approval');
    const screen = await loaded(admin, quote);
    assert.equal((await admin('PUT', { id: quote, status: 'Approved', ifStamp: screen.stamp })).statusCode, 200);
    // A reminder written since, as quote-reminders.mjs writes one (no member; it changes nothing on the quote).
    await db.insert(auditLog).values({ id: 'audit_itest_quote_stale_reminded', orgId: A, action: 'quote.reminded', entityType: 'quote', entityId: quote, userId: null, userName: 'Approval reminders', timestamp: new Date(Date.now() + 1000) });
    const again = await admin('PUT', { id: quote, status: 'Approved', ifStamp: screen.stamp });
    assert.equal(body(again).code, 'already');
});

test("§0.280 review: the caller's own last change does not make every stale press done — only one that asks what the quote holds", async () => {
    // A Submit from a tab loaded before the rep's own save in another tab: the quote is still a Draft — not done, stale.
    const { quote } = await seed('ownmove', 'Draft');
    const tabA = await loaded(rep, quote);
    assert.equal((await rep('PUT', { id: quote, notes: 'tab B', ifStamp: tabA.stamp })).statusCode, 200);
    const submit = await rep('PUT', { id: quote, status: 'Pending Approval', ifStamp: tabA.stamp });
    assert.equal(body(submit).code, 'stale');
    assert.equal((await quoteOf(quote)).status, 'Draft');
    // A body asking nothing (the API's) over the rep's own save: stale, never done.
    assert.equal(body(await rep('PUT', { id: quote, ifStamp: tabA.stamp })).code, 'stale');
    // An approver's own submit, then their send-back from before it: the quote still waits — stale, never done.
    const { quote: held } = await seed('ownsubmit', 'Draft');
    const before = await loaded(admin, held);
    assert.equal((await admin('PUT', { id: held, status: 'Pending Approval', ifStamp: before.stamp })).statusCode, 200);
    const back = await admin('PUT', { id: held, status: 'Draft', sendBack: true, sendBackNote: 'Lower the discount', ifStamp: before.stamp });
    assert.equal(body(back).code, 'stale');
    assert.equal((await quoteOf(held)).status, 'Pending Approval');
});
