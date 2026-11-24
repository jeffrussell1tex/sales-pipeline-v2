// tests/integration/failed-reads.itest.mjs
// §0.292 against the real test database (OPEN_ITEMS §4.6; Jeff, 23 Nov: "Keep working"): a read the server decides on that
// FAILS is never an answer. The caller's own lookup (_lib.mjs resolveCaller) answered a database error as a caller with no
// roster row — a create stored with no owner, a rep's list answered short — and six reads beside it answered one as their
// default: an org's approval rules, its territory rules, its lead scoring rules, a lead's activities, whether a
// recommendation was acted on, and a first sign-in's link. Each is staged where it happens: the one statement rejected,
// every other statement the real database's. Each request is then a 500 with nothing written; the same request, its reads
// answering, lands.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, beforeEach, mock } from 'node:test';
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
// The mailer records what it is handed, never sends.
const mails = [];
const notices = [];
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: { sendEmail: async (o) => { mails.push(o); return { success: true }; }, emailTemplates: new Proxy({}, { get: () => () => ({ subject: '', html: '' }) }) },
});
mock.module(new URL('../../netlify/functions/_approvalMail.mjs', import.meta.url).href, {
    namedExports: { sendApprovalNotices: async (o) => { notices.push(o); } },
});
mock.module(new URL('../../netlify/functions/send-slack.mjs', import.meta.url).href, {
    namedExports: { sendSlack: async () => true, sendSlackToOrg: async () => true, postDealEvents: async () => {}, postBulkStageMove: async () => {}, slackTemplates: new Proxy({}, { get: () => () => ({ text: '' }) }) },
});
mock.module(new URL('../../netlify/functions/webhooks.mjs', import.meta.url).href, { namedExports: { dispatchWebhook: async () => {} } });
mock.module(new URL('../../netlify/functions/dispatch-automations.mjs', import.meta.url).href, { namedExports: { dispatchAutomations: async () => {} } });
// The person who signs in: the address is the one the roster's unlinked row holds.
let signsIn = { id: '', email: '' };
mock.module('@clerk/backend', {
    namedExports: {
        verifyToken: async () => ({}),
        createClerkClient: () => ({ users: { getUser: async (id) => ({ id, firstName: 'Itest', lastName: 'Failed New', emailAddresses: [{ emailAddress: signsIn.email }] }) } }),
    },
});

const FN = {};
for (const f of ['accounts', 'contacts', 'tasks', 'activities', 'leads', 'opportunities', 'quotes', 'quote-email', 'spiff-claims', 'recommendation-log', 'documents', 'users', 'lead-requests', 'lead-intake', 'saved-reports']) FN[f] = (await import(`../../netlify/functions/${f}.mjs`)).handler;
const { judgePending } = await import('../../netlify/functions/recommendation-log.mjs');
const { scoreOrg } = await import('../../netlify/functions/score-leads-batch.mjs');
const lib = await import('../../netlify/functions/_lib.mjs');
const { db } = await import('../../db/index.js');
const schema = await import('../../db/schema.js');
const { users, settings, quotes, opportunities, leads, activities, accounts, recommendationLog, spiffClaims } = schema;
const { eq, and } = await import('drizzle-orm');

// ORG NAMESPACE: this file owns 'itest_failed_reads_*', and only this file writes to it.
const A = 'itest_failed_reads_A';
const CLERK = { rep: 'clerk_itest_failed_reads_rep', mgr: 'clerk_itest_failed_reads_mgr', admin: 'clerk_itest_failed_reads_admin' };
const USR = { rep: 'usr_itest-failed-reads-rep', mgr: 'usr_itest-failed-reads-mgr', admin: 'usr_itest-failed-reads-admin' };
const NAME = 'Itest Failed Rep';

// The one statement that fails: `down(table, fields, kind)` says which; every other is the real database's.
let down = null, hits = 0;
const fails = (table, fields, kind) => { if (!down || !down(table, fields, kind)) return false; hits++; return true; };
const rejected = () => { const p = {}; for (const k of ['where', 'limit', 'orderBy', 'set', 'returning', 'values']) p[k] = () => p; p.then = (a, b) => Promise.reject(new Error('TEST made-up failure')).then(a, b); return p; };
const realSelect = db.select.bind(db), realUpdate = db.update.bind(db);
db.select = (fields) => { const q = realSelect(fields); const from = q.from.bind(q); q.from = (t) => (fails(t, fields, 'select') ? rejected() : from(t)); return q; };
db.update = (t) => (fails(t, null, 'update') ? rejected() : realUpdate(t));
const CALLER = (t, f) => t === users && !!f && Object.keys(f).sort().join() === 'id,name' && f.id === users.id;
const SETTINGS = (t, f) => t === settings && !f;   // the whole row: the approval, territory and lead scoring reads
async function failing(which, run, { once = false } = {}) {
    lib.invalidateRoster(A);
    hits = 0;
    down = once ? (...a) => hits === 0 && which(...a) : which;   // once: the first such read alone
    try { return await run(); } finally { down = null; lib.invalidateRoster(A); }
}

const ev = (role, user, method, body, qs) => ({
    httpMethod: method,
    headers: { 'x-test-org': A, 'x-test-role': role, 'x-test-user': user, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, queryStringParameters: qs || {},
});
const rep = (m, b, q) => ev('User', CLERK.rep, m, b, q);
const admin = (m, b, q) => ev('Admin', CLERK.admin, m, b, q);
const rowOf = async (table, id) => (await db.select().from(table).where(and(eq(table.id, id), eq(table.orgId, A))))[0];
const is500 = (res, what) => {
    assert.ok(hits > 0, `${what}: the failing read was asked`);
    assert.equal(res.statusCode, 500, `${what}: ${res.statusCode} ${res.body}`);
    assert.equal(JSON.parse(res.body).error, 'Internal server error', what);
};
const OWNED = [schema.contacts, schema.tasks, schema.activities, schema.leads, schema.opportunities, schema.accounts, quotes, recommendationLog, spiffClaims, schema.auditLog, schema.leadClaimRequests, schema.savedReports, users, settings];
const cleanup = async () => { for (const t of OWNED) await db.delete(t).where(eq(t.orgId, A)); };
const setExtra = (extra) => db.update(settings).set({ extra }).where(eq(settings.orgId, A));

before(async () => {
    await cleanup();
    await db.insert(users).values([
        { id: USR.rep,   clerkUserId: CLERK.rep,   orgId: A, name: NAME, email: 'failed-rep@itest.local', role: 'User' },
        { id: USR.mgr,   clerkUserId: CLERK.mgr,   orgId: A, name: 'Itest Failed Mgr', email: 'failed-mgr@itest.local', role: 'Manager' },
        { id: USR.admin, clerkUserId: CLERK.admin, orgId: A, name: 'Itest Failed Admin', email: 'failed-admin@itest.local', role: 'Admin' },
    ]);
    await db.insert(settings).values({ id: A, orgId: A, extra: {} });
    lib.invalidateRoster();
});
beforeEach(async () => { down = null; mails.length = 0; notices.length = 0; await setExtra({}); });
after(async () => { down = null; await cleanup(); });

const CREATES = {
    accounts: [accounts, { name: 'Failed Acct' }], contacts: [schema.contacts, { firstName: 'Failed', lastName: 'Con' }],
    tasks: [schema.tasks, { title: 'Failed task', dueDate: '2026-11-30', status: 'Open', type: 'Call' }], activities: [activities, { type: 'Call', notes: 'Failed act', date: '2026-11-23' }],
    leads: [leads, { firstName: 'Failed', lastName: 'Lead' }], opportunities: [opportunities, { opportunityName: 'Failed deal', account: 'Acct', pipelineId: 'default', stage: 'Qualification' }],
};

test('§0.292 a create whose caller cannot be read is a 500 and stores nothing — never a record nobody owns — and the same create, the caller read, is theirs', async () => {
    for (const [fn, [table, body]] of Object.entries(CREATES)) for (const [who, ask, owner] of [['rep', rep, USR.rep], ['admin', admin, USR.admin]]) {
        const id = `itest_failed_reads_${fn}_${who}`;
        const res = await failing(CALLER, () => FN[fn](ask('POST', { id, ...body, ...(fn === 'accounts' || fn === 'contacts' ? (body.name ? { name: body.name + who } : { lastName: 'Con' + who }) : {}) })));
        is500(res, `${fn} ${who}`);
        assert.equal(await rowOf(table, id), undefined, `${fn} ${who}: nothing stored`);
        const again = await FN[fn](ask('POST', { id, ...body, ...(body.name ? { name: body.name + who } : {}) }));
        assert.equal(again.statusCode, 201, again.body);
        assert.equal((await rowOf(table, id)).ownerId, owner, `${fn} ${who}: the caller owns it`);
    }
});

test("§0.292 a rep's list, save and delete whose caller cannot be read are a 500 with nothing written — never a short list, never 'not yours'", async () => {
    for (const [fn, [table, body]] of Object.entries(CREATES)) {
        const id = `itest_failed_reads_own_${fn}`;
        await db.insert(table).values({ id, orgId: A, ownerId: USR.rep, ...body });
        is500(await failing(CALLER, () => FN[fn](rep('GET'))), `${fn} GET`);
        const [key, value] = fn === 'activities' ? ['notes', 'Edited'] : fn === 'opportunities' ? ['notes', 'Edited'] : fn === 'tasks' ? ['title', 'Edited'] : fn === 'accounts' ? ['phone', '555'] : ['lastName', 'Edited'];
        is500(await failing(CALLER, () => FN[fn](rep('PUT', { id, [key]: value }))), `${fn} PUT`);
        assert.notEqual((await rowOf(table, id))[key], value, `${fn}: unchanged`);
        if (['contacts', 'tasks', 'activities'].includes(fn)) {
            is500(await failing(CALLER, () => FN[fn](rep('DELETE', null, { id }))), `${fn} DELETE`);
            assert.ok(await rowOf(table, id), `${fn}: still stored`);
        }
    }
    const list = JSON.parse((await FN.contacts(rep('GET'))).body);
    assert.ok((list.contacts || list).some((c) => c.id === 'itest_failed_reads_own_contacts'), 'the same list, the caller read, holds their own');
});

test('§0.292 the other reads of the caller: documents, a lead request, a SPIFF claim and the recommendation log are a 500 — never an empty list, never "not on the team list"', async () => {
    is500(await failing(CALLER, () => FN.documents(rep('GET'))), 'documents');
    is500(await failing(CALLER, () => FN['lead-requests'](rep('GET'))), 'lead requests GET');
    const claim = { id: 'itest_failed_reads_claim', spiffId: 'sp1', amount: 5 };
    await setExtra({ spiffs: [{ id: 'sp1', name: 'Spiff' }] });
    is500(await failing(CALLER, () => FN['spiff-claims'](rep('POST', claim))), 'spiff POST');
    assert.equal(await rowOf(spiffClaims, claim.id), undefined);
    await db.insert(spiffClaims).values({ id: claim.id, orgId: A, spiffId: 'sp1', repName: NAME, status: 'pending', note: 'as filed' });
    is500(await failing(CALLER, () => FN['spiff-claims'](rep('PUT', { id: claim.id, note: 'Edited' }))), 'spiff PUT');
    assert.equal((await rowOf(spiffClaims, claim.id)).note, 'as filed');
    assert.equal((await FN['spiff-claims'](rep('PUT', { id: claim.id, note: 'Edited' }))).statusCode, 200, 'their own claim, the caller read');
    await db.insert(recommendationLog).values({ id: 'itest_failed_reads_rec_own', orgId: A, repName: NAME, actionType: 'stale' });
    for (const [m, b] of [['GET'], ['PUT'], ['POST', { id: 'itest_failed_reads_rec_new', repName: NAME, actionType: 'stale' }]]) is500(await failing(CALLER, () => FN['recommendation-log'](rep(m, b))), `recommendation log ${m}`);
    assert.equal(await rowOf(recommendationLog, 'itest_failed_reads_rec_new'), undefined);
    assert.equal(JSON.parse((await FN['recommendation-log'](rep('GET'))).body).logs.length, 1, 'their own log, the caller read');
});

test('§0.292 a name read only to show is still none on a failed read, and what it names still lands', async () => {
    const id = 'itest_failed_reads_named';
    const res = await failing(CALLER, () => FN['saved-reports'](admin('POST', { id, name: 'Named', config: {} })));
    assert.ok(hits > 0);
    assert.equal(res.statusCode, 201, res.body);
    assert.equal((await rowOf(schema.savedReports, id)).ownerName, null, "the maker's name");
    // A deal's maker decides who is told of it, so it is read before the deal is written.
    const deal = 'itest_failed_reads_maker';
    is500(await failing(CALLER, () => FN.opportunities(rep('POST', { id: deal, opportunityName: 'Named', account: 'Acct', pipelineId: 'default', stage: 'Qualification', salesRep: NAME }))), 'a deal naming its rep');
    assert.equal(await rowOf(opportunities, deal), undefined);
    assert.equal(mails.length, 0);
});

const TIERS = [{ maxDiscount: 0.05, label: 'Rep', approver: null }, { maxDiscount: 1, label: 'Boss', approver: 'Boss', approverRole: 'Admin' }];
const seedQuote = async (tag, status) => {
    const deal = `itest_failed_reads_deal_${tag}`, quote = `itest_failed_reads_q_${tag}`;
    await db.insert(opportunities).values({ id: deal, orgId: A, opportunityName: 'Deal ' + tag, account: 'Acct', pipelineId: 'default', stage: 'Proposal', ownerId: USR.rep, salesRep: NAME });
    await db.insert(quotes).values({ id: quote, orgId: A, opportunityId: deal, quoteNumber: 'Q-FAIL-' + tag, version: 1, name: 'Quote ' + tag, status, dealDiscount: '8', lineItems: [{ id: 'l1', name: 'Work', listPrice: 1000, quantity: 1 }], billingContact: 'buyer@itest.local' });
    return quote;
};

test("§0.292 a quote the org's own rules hold for approval is not sent, accepted or approved by the default rules when the org's cannot be read — 500, nothing written, no email", async () => {
    await setExtra({ approvalTiers: TIERS });
    const draft = await seedQuote('send', 'Draft');
    const held = await FN['quote-email'](admin('POST', { quoteId: draft }));
    assert.equal(held.statusCode, 422, 'the rules read: held — ' + held.body);
    is500(await failing(SETTINGS, () => FN['quote-email'](admin('POST', { quoteId: draft })), { once: true }), 'email');
    is500(await failing(SETTINGS, () => FN.quotes(rep('PUT', { id: draft, status: 'Sent to Customer' }))), 'mark sent');
    assert.equal(mails.length, 0, 'no email');
    assert.equal((await rowOf(quotes, draft)).status, 'Draft');
    const pending = await seedQuote('approve', 'Pending Approval');
    is500(await failing(SETTINGS, () => FN.quotes(ev('Manager', CLERK.mgr, 'PUT', { id: pending, status: 'Approved' }))), 'approve');
    assert.equal((await rowOf(quotes, pending)).status, 'Pending Approval');
    assert.equal((await FN.quotes(ev('Manager', CLERK.mgr, 'PUT', { id: pending, status: 'Approved' }))).statusCode, 403, "the rules read: the Boss's alone");
    is500(await failing(SETTINGS, () => FN.quotes(admin('GET', null, { approvalStats: 'true' }))), 'the approval numbers');
});

test('§0.292 a submitted quote whose submitter cannot be read is a 500 with nothing written; read, its notice names them', async () => {
    await setExtra({ approvalTiers: TIERS });
    const q = await seedQuote('submit', 'Draft');
    is500(await failing(CALLER, () => FN.quotes(admin('PUT', { id: q, status: 'Pending Approval' }))), 'submit');
    assert.equal((await rowOf(quotes, q)).status, 'Draft');
    assert.equal(notices.length, 0);
    const ok = await FN.quotes(admin('PUT', { id: q, status: 'Pending Approval' }));
    assert.equal(ok.statusCode, 200, ok.body);
    assert.deepEqual(notices.map((n) => [n.actorId, n.actorName]), [[USR.admin, 'Itest Failed Admin']]);
});

test("§0.292 an account whose territory rules cannot be read is a 500, not stored with no territory", async () => {
    await setExtra({ assignmentRules: [{ field: 'name', contains: 'west', territory: 'West', rep: NAME }] });
    const id = 'itest_failed_reads_terr';
    is500(await failing(SETTINGS, () => FN.accounts(admin('POST', { id, name: 'West Wing Failed' }))), 'single');
    is500(await failing(SETTINGS, () => FN.accounts(admin('POST', [{ id, name: 'West Wing Failed' }]))), 'bulk');
    assert.equal(await rowOf(accounts, id), undefined);
    assert.equal((await FN.accounts(admin('POST', { id, name: 'West Wing Failed' }))).statusCode, 201);
    assert.equal((await rowOf(accounts, id)).assignedTerritory, 'West');
    const bare = 'itest_failed_reads_terr_put';
    await db.insert(accounts).values({ id: bare, orgId: A, name: 'West Bare Failed', accountTier: 'account', ownerId: USR.admin });
    is500(await failing(SETTINGS, () => FN.accounts(admin('PUT', { id: bare, name: 'West Bare Failed', phone: '555' }))), 'PUT');
    assert.equal((await rowOf(accounts, bare)).phone, null);
});

test("§0.292 a lead is never scored by the default rules, or as having no activity, when the org's rules or its activities cannot be read", async () => {
    await setExtra({ leadScoring: { enabled: false } });   // this org turned scoring off: nothing may score its leads
    const id = 'itest_failed_reads_lead_s';
    const body = { id, firstName: 'Score', lastName: 'Me', company: 'C', email: 's@itest.local', phone: '555' };
    is500(await failing(SETTINGS, () => FN.leads(admin('POST', body))), 'create');
    is500(await failing(SETTINGS, () => FN.leads(admin('POST', [body]))), 'bulk');
    assert.equal(await rowOf(leads, id), undefined);
    assert.equal((await FN.leads(admin('POST', body))).statusCode, 201);
    const scored = async () => { const r = await rowOf(leads, id); return [r.score, r.scoreUpdatedAt]; };
    const asMade = await scored();
    assert.equal(asMade[1], null, 'scoring off: not scored');
    is500(await failing(SETTINGS, () => FN.leads(admin('PUT', { id, phone: '556' }))), 'save');
    const act = await failing(SETTINGS, () => FN.activities(admin('POST', { id: 'itest_failed_reads_act_s', type: 'Call', notes: 'n', date: '2026-11-23', leadId: id })));
    assert.ok(hits > 0);
    assert.equal(act.statusCode, 201, 'the activity lands — ' + act.body);
    assert.deepEqual(await scored(), asMade, 'and its lead is left as it was');
    await assert.rejects(failing((t) => t === settings, () => scoreOrg(A)), /TEST made-up failure/, "the nightly pass's org");
    assert.ok(hits > 0);
    assert.deepEqual(await scored(), asMade);
    await setExtra({});
    is500(await failing((t, f) => t === activities && !f, () => FN.leads(admin('PUT', { id, phone: '557' }))), 'its activities');
    assert.deepEqual(await scored(), asMade);
});

test('§0.292 a recommendation whose outcome cannot be read stays pending — never judged ignored for good', async () => {
    const id = 'itest_failed_reads_rec_judge', deal = 'itest_failed_reads_rec_deal';
    await db.insert(opportunities).values({ id: deal, orgId: A, opportunityName: 'Judged', account: 'Acct', pipelineId: 'default', stage: 'Proposal', stageChangedDate: '2026-11-22' });
    const now = new Date('2026-11-23T12:00:00Z');
    await db.insert(recommendationLog).values({ id, orgId: A, repName: 'Itest Judged Rep', actionType: 'stuck', opportunityId: deal, dismissedAt: new Date('2026-11-18T12:00:00Z') });
    await assert.rejects(failing((t) => t === opportunities, () => judgePending(A, 'Itest Judged Rep', now)), /1 of 1 recommendations could not be judged/);
    assert.ok(hits > 0);
    assert.equal((await rowOf(recommendationLog, id)).outcome, 'pending');
    assert.deepEqual(await judgePending(A, 'Itest Judged Rep', now), [{ id, outcome: 'resolved' }], 'read: the deal moved');
});

test('§0.292 a first sign-in whose link or row cannot be written or read is a 500 — never the row answered unlinked, never no profile', async () => {
    const pending = 'usr_itest-failed-reads-pending', who = 'clerk_itest_failed_reads_new';
    signsIn = { id: who, email: 'failed-new@itest.local' };
    await db.insert(users).values({ id: pending, orgId: A, name: 'Itest Failed Invited', email: signsIn.email, role: 'User', profile: { status: 'Invited' } });
    const me = () => FN.users(ev('User', who, 'GET', null, { me: 'true' }));
    is500(await failing((t, f, k) => k === 'update' && t === users, me), 'the link');
    assert.equal((await rowOf(users, pending)).clerkUserId, null);
    const linked = await me();
    assert.equal(linked.statusCode, 200, linked.body);
    assert.equal((await rowOf(users, pending)).clerkUserId, who);

    const other = 'clerk_itest_failed_reads_none';
    signsIn = { id: other, email: 'failed-none@itest.local' };
    const me2 = () => FN.users(ev('User', other, 'GET', null, { me: 'true' }));
    // The provisioning's own read of the roster's names (memberNamesOf), not the two lookups before it.
    is500(await failing((t, f) => t === users && !!f?.clerkUserId && !!f?.email, me2), 'the new row');
    const made = JSON.parse((await me2()).body);
    assert.ok(made.user?.id, 'read: their row made');
});

test("§0.292 a web form whose org cannot be read says something went wrong, not that the form is turned off", async () => {
    const token = 'wf_' + 'failedreads0123456789abcdef';
    await setExtra({ webToLead: { enabled: true, token, source: 'Web form' } });
    const ask = () => FN['lead-intake']({ httpMethod: 'GET', path: '/lead-form/' + token, headers: {}, queryStringParameters: {} });
    const bad = await failing((t) => t === settings, ask);
    assert.ok(hits > 0);
    assert.equal(bad.statusCode, 500, bad.body.slice(0, 200));
    assert.match(bad.body, /Something went wrong/);
});
