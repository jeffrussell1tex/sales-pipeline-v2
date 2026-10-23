// tests/integration/merged-away-cleanup.itest.mjs
//
// The cleanup batch's server step (state §0.210; design docs/design/cleanup-batch/DESIGN.md §5.3, P17, P27, P5),
// against the real test database: a record merged into another (Find & merge — merge_archived true, merged_into_id
// the survivor) is answered by no server path that lists, counts or mails:
//   - the public API's accounts and contacts leave it out, and their total, pages, totalPages and hasNextPage count
//     only what is listed (public-api.mjs — `merge_archived is not true`, so NULL reads as live);
//   - the report engine, run on the server's own read (report-deliveries.mjs loadReportData → runReport), counts
//     no merged-away account as a row; a deal on one is counted on its survivor, an id-less deal on the live
//     account of its name (src/utils/reportQuery.js);
//   - a quote emailed with no billing email goes to the LIVE contact of the deal's first named contact, never a
//     merged-away twin's old address; a name only a merged-away contact has is the existing 422 (quote-email.mjs).
// Org B holds every name A holds, all live: B's rows reach no answer of A's, and A's merges change nothing of B's.
//
// I1, I2, I4 and I5 each fail on the code before §0.210: the old handlers listed and counted the merged-away rows,
// the old engine counted "Resinall, Inc." as a row, and the old find mailed a merged-away contact (Kim Old, the only
// one of the name — whatever order the database reads; Lee Ng's twin where it reads first). I3, isolation, held
// before and is proved again on the new code.
//
// The auth mock fakes the SIGN-IN only (audit-close.itest.mjs's) and re-exports the REAL gate (_roleGate.mjs) and
// predicates (src/utils/roles.js); the mailer and Slack are stand-ins that record. Every handler, rule and query is
// the real one.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const roles = await import('../../src/utils/roles.js');
const roleGate = await import('../../netlify/functions/_roleGate.mjs');

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            const userRole = event.headers?.['x-test-role'] || 'Admin';
            const userId = event.headers?.['x-test-user'] || `clerk_itest_cleanup_${userRole}_${orgId}`;
            return { userId, orgId, userRole, managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: roleGate.requireWrite, requireRole: roleGate.requireRole,
    },
});
// The mailer records what it is handed, never sends. quote-email.mjs imports quotes.mjs → _approvalMail.mjs, which
// imports the templates too; report-deliveries.mjs imports both.
const mails = [];
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: {
        sendEmail: async (o) => { mails.push(o); return { success: true }; },
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

const { handler: apiFn } = await import('../../netlify/functions/public-api.mjs');
const { handler: emailFn } = await import('../../netlify/functions/quote-email.mjs');
const { loadReportData } = await import('../../netlify/functions/report-deliveries.mjs');
const { runReport } = await import('../../src/utils/reportQuery.js');
const { db } = await import('../../db/index.js');
const { users, accounts, contacts, opportunities, quotes, apiKeys, auditLog } = await import('../../db/schema.js');
const { eq, and, inArray } = await import('drizzle-orm');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');
const { assertTestSchema } = await import('./_schema-guard.mjs');

// ORG NAMESPACE: this file owns 'itest_cleanup_*'.
const A = 'itest_cleanup_A';
const B = 'itest_cleanup_B';
const ORGS = [A, B];

// The API keys are this file's alone (public-api.mjs takes the FIRST row of a hash, :96-99, and key_hash is a plain
// index — schema.ts api_keys_key_hash_idx — so a key another suite also seeded could answer for its org). The first
// test proves no other suite holds either text, and the test database holds each hash once, in this file's orgs.
const KEY_A = 'spt_live_' + 'c1'.repeat(32);
const KEY_B = 'spt_live_' + 'c2'.repeat(32);
const sha = (s) => createHash('sha256').update(s).digest('hex');

const CLERK = { admin: 'clerk_itest_cleanup_admin', rep: 'clerk_itest_cleanup_rep', bAdmin: 'clerk_itest_cleanup_b_admin' };
const USR = { admin: 'usr_itest_cleanup_admin', rep: 'usr_itest_cleanup_rep', bAdmin: 'usr_itest_cleanup_b_admin' };

// Ids are global keys: every row's id names its org. The Accounts source has no name dimension, so each account's
// `state` carries its own tag — a row of a report grouped by State is one account.
const acctId = (org, k) => `acct_itest_cleanup_${org === A ? 'a' : 'b'}_${k}`;
const conId = (org, k) => `con_itest_cleanup_${org === A ? 'a' : 'b'}_${k}`;
const ACC = {
    resinall:    { name: 'Resinall',           tag: 'RS' },
    resinallInc: { name: 'Resinall, Inc.',     tag: 'RI' },
    open:        { name: 'Open Co',            tag: 'OC' },
    undone:      { name: 'Undone Co',          tag: 'UC' },
    evonik:      { name: 'Evonik',             tag: 'EV' },
    lafLive:     { name: 'Evonik - Lafayette', tag: 'L1' },
    lafGone:     { name: 'Evonik - Lafayette', tag: 'L2' },
};
const EMAIL = {
    lee:     'lee.ng@resinall.example',          // A's live Lee Ng
    leeGone: 'lee.old@resinall-inc.example',     // A's Lee Ng merged into him — the old address
    kimGone: 'kim.old@open-co.example',          // A's Kim Old merged into Ana — the only "Kim Old" of A
    leeB:    'lee.ng@b-org.example',             // org B's Lee Ng, the first row of every Lee Ng written
};
const DEAL = { won: 'opp_itest_cleanup_a_won', laf: 'opp_itest_cleanup_a_laf' };
const QUOTE = { lee: 'q_itest_cleanup_lee', kim: 'q_itest_cleanup_kim' };

const allAccountIds = (org) => Object.keys(ACC).map((k) => acctId(org, k));
const allContactIds = (org) => ['leeGone', 'lee', 'ana', 'kimGone', 'leeFirst', 'lee2', 'kim'].map((k) => conId(org, k));
// What A's lists answer: the live rows, the NULL-marked one and the undone merge — never the two merged away.
const A_LIVE_ACCOUNTS = ['resinall', 'open', 'undone', 'evonik', 'lafLive'].map((k) => acctId(A, k)).sort();
const A_LIVE_CONTACTS = [conId(A, 'lee'), conId(A, 'ana')].sort();
const B_ACCOUNTS = allAccountIds(B).sort();
const B_CONTACTS = ['leeFirst', 'lee2', 'ana', 'kim'].map((k) => conId(B, k)).sort();

const api = async (key, qs) => {
    const r = await apiFn({ httpMethod: 'GET', headers: { authorization: 'Bearer ' + key }, queryStringParameters: qs });
    let body = {};
    try { body = JSON.parse(r.body || '{}'); } catch { /* not JSON */ }
    return { status: r.statusCode, body, raw: r.body };
};
const ids = (res) => (res.body.data || []).map((r) => r.id).sort();
const sendQuote = async (org, role, user, quoteId) => {
    const r = await emailFn({
        httpMethod: 'POST',
        headers: { 'x-test-org': org, 'x-test-role': role, 'x-test-user': user, 'content-type': 'application/json' },
        body: JSON.stringify({ quoteId }),
        queryStringParameters: {},
    });
    let body = {};
    try { body = JSON.parse(r.body || '{}'); } catch { /* not JSON */ }
    return { status: r.statusCode, body };
};
const byTag = (result) => Object.fromEntries(result.rows.map((r) => [r.keys[0], r.values]));
const ACCOUNTS_REPORT = {
    source: 'Accounts', period: 'all', dims: [{ id: 'state', label: 'State' }],
    metrics: [{ id: 'accounts', label: '# of accounts' }, { id: 'revenue', label: 'Revenue (won)' }, { id: 'open_pipeline', label: 'Open pipeline' }],
};

const cleanup = async () => {
    for (const t of [quotes, opportunities, contacts, accounts, apiKeys, auditLog, users]) {
        await db.delete(t).where(inArray(t.orgId, ORGS));
    }
};

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    const now = new Date();
    await db.insert(users).values([
        { id: USR.admin,  orgId: A, clerkUserId: CLERK.admin,  name: 'Ada Cleanup',  email: 'ada@itest-cleanup.local',  role: 'Admin' },
        { id: USR.rep,    orgId: A, clerkUserId: CLERK.rep,    name: 'Rita Cleanup', email: 'rita@itest-cleanup.local', role: 'User' },
        { id: USR.bAdmin, orgId: B, clerkUserId: CLERK.bAdmin, name: 'Bea Cleanup',  email: 'bea@itest-cleanup.local',  role: 'Admin' },
    ]);
    invalidateRoster();
    await db.insert(apiKeys).values([
        { id: 'key_itest_cleanup_a', orgId: A, name: 'itest cleanup A', keyHash: sha(KEY_A), keyPrefix: KEY_A.slice(0, 13) },
        { id: 'key_itest_cleanup_b', orgId: B, name: 'itest cleanup B', keyHash: sha(KEY_B), keyPrefix: KEY_B.slice(0, 13) },
    ]);

    // Accounts. In A: "Resinall, Inc." merged into Resinall; one Lafayette site merged into its twin (written AFTER
    // the live one, so a name map that keeps the later row, as the old engine's did, would take it); Open Co's mark
    // written NULL; Undone Co a merge undone (false, no survivor). In B: the same names, every one live.
    const acct = (org, k, extra = {}) => ({ id: acctId(org, k), orgId: org, name: ACC[k].name, state: ACC[k].tag, accountTier: 'account', ...extra });
    const site = (org, k, extra = {}) => acct(org, k, { accountTier: 'site', parentAccountId: acctId(org, 'evonik'), ...extra });
    await db.insert(accounts).values([
        acct(A, 'resinall',    { ownerId: USR.rep, accountOwner: 'Rita Cleanup', mergeArchived: false }),
        acct(A, 'resinallInc', { ownerId: USR.rep, accountOwner: 'Rita Cleanup', mergeArchived: true, mergedIntoId: acctId(A, 'resinall'), archivedAt: now }),
        acct(A, 'open',        { ownerId: null, mergeArchived: null }),
        acct(A, 'undone',      { ownerId: USR.admin, mergeArchived: false, mergedIntoId: null, archivedAt: null }),
        acct(A, 'evonik',      { ownerId: USR.admin, mergeArchived: false }),
        site(A, 'lafLive',     { ownerId: USR.admin, mergeArchived: false }),
        site(A, 'lafGone',     { ownerId: USR.admin, mergeArchived: true, mergedIntoId: acctId(A, 'lafLive'), archivedAt: now }),
        acct(B, 'resinall',    { ownerId: USR.bAdmin, mergeArchived: false }),
        acct(B, 'resinallInc', { ownerId: USR.bAdmin, mergeArchived: false }),
        acct(B, 'open',        { ownerId: null, mergeArchived: null }),
        acct(B, 'undone',      { ownerId: USR.bAdmin, mergeArchived: false }),
        acct(B, 'evonik',      { ownerId: USR.bAdmin, mergeArchived: false }),
        site(B, 'lafLive',     { ownerId: USR.bAdmin, mergeArchived: false }),
        site(B, 'lafGone',     { ownerId: USR.bAdmin, mergeArchived: false }),
    ]);

    // Contacts. Org B's "Lee Ng" is written FIRST of every Lee Ng, with another address: a recipient lookup that left
    // its org would meet it before A's. In A the merged-away Lee Ng (his company renamed "Resinall" by the merge) is
    // written before the live one, so a find by name alone takes the twin. Ana's mark written NULL. Kim Old, merged
    // into Ana, is the only "Kim Old" of A.
    const person = (org, k, firstName, lastName, extra = {}) => ({ id: conId(org, k), orgId: org, firstName, lastName, ...extra });
    await db.insert(contacts).values([
        person(B, 'leeFirst', 'Lee', 'Ng', { company: 'Resinall', accountId: acctId(B, 'resinall'), email: EMAIL.leeB, ownerId: USR.bAdmin, mergeArchived: false }),
    ]);
    await db.insert(contacts).values([
        person(A, 'leeGone', 'Lee', 'Ng', { company: 'Resinall', accountId: acctId(A, 'resinall'), email: EMAIL.leeGone, ownerId: USR.rep,
            mergeArchived: true, mergedIntoId: conId(A, 'lee'), archivedAt: now }),
        person(A, 'lee', 'Lee', 'Ng', { company: 'Resinall', accountId: acctId(A, 'resinall'), email: EMAIL.lee, ownerId: USR.rep, mergeArchived: false }),
        person(A, 'ana', 'Ana', null, { company: 'Open Co', accountId: acctId(A, 'open'), email: 'ana@open-co.example', ownerId: null, mergeArchived: null }),
        person(A, 'kimGone', 'Kim', 'Old', { company: 'Open Co', accountId: acctId(A, 'open'), email: EMAIL.kimGone, ownerId: null,
            mergeArchived: true, mergedIntoId: conId(A, 'ana'), archivedAt: now }),
    ]);
    await db.insert(contacts).values([
        person(B, 'lee2', 'Lee', 'Ng', { company: 'Resinall', accountId: acctId(B, 'resinall'), email: 'lee.two@b-org.example', ownerId: USR.bAdmin, mergeArchived: false }),
        person(B, 'ana', 'Ana', null, { company: 'Open Co', accountId: acctId(B, 'open'), email: 'ana@b-org.example', ownerId: null, mergeArchived: null }),
        person(B, 'kim', 'Kim', 'Old', { company: 'Open Co', accountId: acctId(B, 'open'), email: 'kim@b-org.example', ownerId: null, mergeArchived: false }),
    ]);

    // Deals, in A only: a won $50k still on "Resinall, Inc."'s id (a stale id — merge.mjs moves a deal's id, so this
    // is the edge), the rep's, its first named contact Lee Ng; an id-less open "Evonik - Lafayette", the Admin's,
    // naming only Kim Old.
    await db.insert(opportunities).values([
        { id: DEAL.won, orgId: A, pipelineId: 'default', opportunityName: 'Resinall expansion', account: 'Resinall, Inc.', accountId: acctId(A, 'resinallInc'),
          stage: 'Closed Won', wonDate: '2026-09-15', arr: '50000', salesRep: 'Rita Cleanup', ownerId: USR.rep, contacts: 'Lee Ng (Plant Manager), Ana (Buyer)' },
        { id: DEAL.laf, orgId: A, pipelineId: 'default', opportunityName: 'Lafayette retrofit', account: 'Evonik - Lafayette', accountId: null,
          stage: 'Proposal', forecastedCloseDate: '2026-12-15', arr: '20000', salesRep: 'Ada Cleanup', ownerId: USR.admin, contacts: 'Kim Old (Engineer)' },
    ]);
    // Approved quotes (quoteRules.js: Approved → Sent to Customer needs no approval check), no billing contact: the
    // recipient is found by the deal's first named contact.
    await db.insert(quotes).values([
        { id: QUOTE.lee, orgId: A, opportunityId: DEAL.won, quoteNumber: 'Q-ITEST-CLEANUP-1', version: 1, name: 'Resinall expansion', status: 'Approved', billingContact: null, createdBy: 'Rita Cleanup' },
        { id: QUOTE.kim, orgId: A, opportunityId: DEAL.laf, quoteNumber: 'Q-ITEST-CLEANUP-2', version: 1, name: 'Lafayette retrofit', status: 'Approved', billingContact: null, createdBy: 'Ada Cleanup' },
    ]);
});
after(cleanup);

// ── the keys ─────────────────────────────────────────────────────────────────

test('the API keys are this file\'s alone: no other suite holds either key, and the test database holds each hash once, in this file\'s orgs', async () => {
    const dir = new URL('./', import.meta.url);
    const self = new URL(import.meta.url).pathname.split('/').pop();
    const others = readdirSync(dir).filter((f) => f.endsWith('.itest.mjs') && f !== self);
    assert.ok(others.length >= 40, `expected the other suites, found ${others.length}`);
    const texts = [KEY_A, KEY_B, "'c1'.repeat(32)", "'c2'.repeat(32)", '"c1".repeat(32)', '"c2".repeat(32)', sha(KEY_A), sha(KEY_B)];
    for (const f of others) {
        const s = readFileSync(new URL(f, dir), 'utf8');
        for (const t of texts) assert.ok(!s.includes(t), `${f} holds ${t} — this file's API keys must be its own`);
    }
    const rows = await db.select({ orgId: apiKeys.orgId, keyHash: apiKeys.keyHash }).from(apiKeys).where(inArray(apiKeys.keyHash, [sha(KEY_A), sha(KEY_B)]));
    assert.deepEqual(rows.map((r) => `${r.orgId}:${r.keyHash === sha(KEY_A) ? 'A' : 'B'}`).sort(), [`${A}:A`, `${B}:B`],
        'each hash once in the test database, in its own org');
});

// ── I1 the public API: accounts ──────────────────────────────────────────────

test('I1 accounts: the public API answers only the live accounts — the NULL-marked one and the undone merge with them — and its total and pages count only those', async () => {
    const [open] = await db.select({ m: accounts.mergeArchived }).from(accounts).where(eq(accounts.id, acctId(A, 'open')));
    assert.equal(open.m, null, 'the fixture: Open Co\'s merge mark is NULL in the database');

    const all = await api(KEY_A, { resource: 'accounts' });
    assert.equal(all.status, 200, all.raw);
    assert.deepEqual(ids(all), A_LIVE_ACCOUNTS, 'live + NULL-marked + "Undone Co" — not "Resinall, Inc.", not the Lafayette twin merged away');
    assert.equal(all.body.meta.total, A_LIVE_ACCOUNTS.length, 'total counts what is listed');
    assert.equal(all.body.meta.totalPages, 1);
    assert.equal(all.body.meta.hasNextPage, false);

    const first = await api(KEY_A, { resource: 'accounts', limit: '1' });
    assert.equal(first.status, 200, first.raw);
    assert.equal(first.body.data.length, 1);
    assert.equal(first.body.meta.total, A_LIVE_ACCOUNTS.length);
    assert.equal(first.body.meta.totalPages, A_LIVE_ACCOUNTS.length, 'limit=1: one page per listed account');
    assert.equal(first.body.meta.hasNextPage, true);
    // Every page, one row each: the pages hold exactly the listed accounts, and the page after the last is empty.
    const paged = [];
    for (let p = 1; p <= first.body.meta.totalPages; p++) {
        const r = await api(KEY_A, { resource: 'accounts', limit: '1', page: String(p) });
        assert.equal(r.body.data.length, 1, `page ${p}`);
        assert.equal(r.body.meta.hasNextPage, p < first.body.meta.totalPages, `page ${p}: hasNextPage`);
        paged.push(r.body.data[0].id);
    }
    assert.deepEqual(paged.sort(), A_LIVE_ACCOUNTS, 'the pages walk the live accounts, no merged-away row on any');
    const beyond = await api(KEY_A, { resource: 'accounts', limit: '1', page: String(first.body.meta.totalPages + 1) });
    assert.deepEqual(beyond.body.data, [], 'nothing past the last page');

    const sites = await api(KEY_A, { resource: 'accounts', tier: 'site' });
    assert.equal(sites.status, 200, sites.raw);
    assert.deepEqual(ids(sites), [acctId(A, 'lafLive')], 'tier=site: the live Lafayette site only');
    assert.equal(sites.body.meta.total, 1);
    assert.equal(sites.body.data[0].parent_account_id, acctId(A, 'evonik'));
});

// ── I2 the public API: contacts ──────────────────────────────────────────────

test('I2 contacts: the same — and company=Resinall answers the live Lee Ng, not the merged-away one whose company is Resinall too', async () => {
    const [ana] = await db.select({ m: contacts.mergeArchived }).from(contacts).where(eq(contacts.id, conId(A, 'ana')));
    assert.equal(ana.m, null, 'the fixture: Ana\'s merge mark is NULL in the database');

    const all = await api(KEY_A, { resource: 'contacts' });
    assert.equal(all.status, 200, all.raw);
    assert.deepEqual(ids(all), A_LIVE_CONTACTS, 'the live Lee Ng and the NULL-marked Ana — not his twin, not Kim Old');
    assert.equal(all.body.meta.total, A_LIVE_CONTACTS.length);
    const lee = all.body.data.find((c) => c.id === conId(A, 'lee'));
    assert.equal(lee.email, EMAIL.lee);
    assert.equal(lee.full_name, 'Lee Ng');

    const first = await api(KEY_A, { resource: 'contacts', limit: '1' });
    assert.equal(first.body.data.length, 1);
    assert.equal(first.body.meta.total, A_LIVE_CONTACTS.length);
    assert.equal(first.body.meta.totalPages, A_LIVE_CONTACTS.length, 'limit=1: one page per listed contact');
    assert.equal(first.body.meta.hasNextPage, true);
    const last = await api(KEY_A, { resource: 'contacts', limit: '1', page: String(A_LIVE_CONTACTS.length) });
    assert.equal(last.body.data.length, 1);
    assert.equal(last.body.meta.hasNextPage, false, 'the last page says so');

    const resinall = await api(KEY_A, { resource: 'contacts', company: 'Resinall' });
    assert.equal(resinall.status, 200, resinall.raw);
    assert.deepEqual(ids(resinall), [conId(A, 'lee')], 'the live Lee only — the twin the merge renamed to Resinall is not answered');
    assert.equal(resinall.body.meta.total, 1);
    assert.ok(!resinall.raw.includes(EMAIL.leeGone), 'the merged-away address is nowhere in the answer');
});

// ── I3 isolation ─────────────────────────────────────────────────────────────

test('I3 isolation: org B\'s key answers B\'s rows only — its "Resinall, Inc." live there — and A\'s key none of B\'s', async () => {
    const bAccounts = await api(KEY_B, { resource: 'accounts' });
    assert.equal(bAccounts.status, 200, bAccounts.raw);
    assert.deepEqual(ids(bAccounts), B_ACCOUNTS, 'all seven of B\'s — "Resinall, Inc." and both Lafayette sites live in B');
    assert.equal(bAccounts.body.meta.total, B_ACCOUNTS.length);
    assert.ok(bAccounts.body.data.some((a) => a.name === 'Resinall, Inc.'), 'B\'s "Resinall, Inc." is answered: A\'s merge is A\'s');
    const bSites = await api(KEY_B, { resource: 'accounts', tier: 'site' });
    assert.deepEqual(ids(bSites), [acctId(B, 'lafGone'), acctId(B, 'lafLive')].sort(), 'B\'s two Lafayette sites');
    const bContacts = await api(KEY_B, { resource: 'contacts' });
    assert.deepEqual(ids(bContacts), B_CONTACTS, 'B\'s four contacts');
    assert.equal(bContacts.body.meta.total, B_CONTACTS.length);
    const bResinall = await api(KEY_B, { resource: 'contacts', company: 'Resinall' });
    assert.deepEqual(ids(bResinall), [conId(B, 'lee2'), conId(B, 'leeFirst')].sort(), 'B\'s two live Lee Ngs');

    const aIds = new Set([...allAccountIds(A), ...allContactIds(A)]);
    for (const r of [bAccounts, bSites, bContacts, bResinall]) {
        assert.ok(!(r.body.data || []).some((x) => aIds.has(x.id)), 'none of A\'s rows reach B\'s key');
    }
    const bIds = new Set([...allAccountIds(B), ...allContactIds(B)]);
    for (const qs of [{ resource: 'accounts' }, { resource: 'accounts', tier: 'site' }, { resource: 'contacts' }, { resource: 'contacts', company: 'Resinall' }]) {
        const r = await api(KEY_A, qs);
        assert.equal(r.status, 200, r.raw);
        assert.ok(!(r.body.data || []).some((x) => bIds.has(x.id)), `A's key, ${JSON.stringify(qs)}: none of B's rows`);
        assert.ok(!r.raw.includes(EMAIL.leeB), 'nor B\'s Lee Ng\'s address');
    }
});

// ── I4 the report engine on the server's read ────────────────────────────────

test('I4 the report engine on the server\'s read: "# of accounts" counts the live; the won $50k lands on Resinall, the id-less Lafayette deal on the live site; a rep\'s run is her own rows; B\'s rows never', async (t) => {
    const [admin] = await db.select().from(users).where(eq(users.id, USR.admin));
    const [rep] = await db.select().from(users).where(eq(users.id, USR.rep));
    const [bAdmin] = await db.select().from(users).where(eq(users.id, USR.bAdmin));
    const today = new Date();

    // The Admin: the whole org, as loadReportData reads it — the merged-away rows are in the data; the engine drops them.
    const data = await loadReportData(A, admin);
    assert.ok([...data.accounts, ...data.opportunities].every((r) => r.orgId === A), 'the Admin\'s read is A\'s rows only — B\'s never');
    assert.deepEqual(data.accounts.map((a) => a.id).sort(), allAccountIds(A).sort(), 'the read holds every A account, the merged-away two among them');
    assert.deepEqual(data.opportunities.map((o) => o.id).sort(), [DEAL.laf, DEAL.won].sort());
    const lafOrder = data.accounts.filter((a) => a.name === 'Evonik - Lafayette').map((a) => a.id);
    t.diagnostic(`fixture premise (not asserted — the database's read order): the Lafayette twin merged away is ${lafOrder.at(-1) === acctId(A, 'lafGone') ? 'LATER' : 'EARLIER'} in the read, so the old later-wins name map ${lafOrder.at(-1) === acctId(A, 'lafGone') ? 'would' : 'would not'} have taken it`);

    const res = runReport(ACCOUNTS_REPORT, data, { fiscalStart: data.fiscalStart, today });
    assert.deepEqual(res.dropped, [], 'every field resolved');
    assert.deepEqual(res.metrics.map((m) => m.label), ['# of accounts', 'Revenue (won)', 'Open pipeline']);
    assert.equal(res.scanned, 5, 'the five live accounts — the NULL-marked and the undone merge counted');
    assert.equal(res.count, 5);
    assert.deepEqual(byTag(res), {
        RS: { accounts: 1, revenue: 50000, open_pipeline: 0 },        // the won deal on "Resinall, Inc."'s id, counted on its survivor
        OC: { accounts: 1, revenue: 0, open_pipeline: 0 },
        UC: { accounts: 1, revenue: 0, open_pipeline: 0 },
        EV: { accounts: 1, revenue: 0, open_pipeline: 0 },
        L1: { accounts: 1, revenue: 0, open_pipeline: 20000 },        // the id-less deal by name, on the live site
    }, 'no row for "Resinall, Inc." (RI) or the Lafayette twin merged away (L2)');
    assert.deepEqual(res.totals, { accounts: 5, revenue: 50000, open_pipeline: 20000 }, 'no money leaves the totals');

    // The rep: her own rows only (loadReportData: ownerId = her app id) — Resinall and the "Resinall, Inc." merged into
    // it, and her won deal; nothing of the Admin's or the unassigned.
    const repData = await loadReportData(A, rep);
    assert.ok([...repData.accounts, ...repData.opportunities].every((r) => r.orgId === A && r.ownerId === USR.rep), 'the rep\'s read: her own A rows');
    assert.deepEqual(repData.accounts.map((a) => a.id).sort(), [acctId(A, 'resinall'), acctId(A, 'resinallInc')].sort());
    assert.deepEqual(repData.opportunities.map((o) => o.id), [DEAL.won]);
    const repRes = runReport(ACCOUNTS_REPORT, repData, { fiscalStart: repData.fiscalStart, today });
    assert.equal(repRes.scanned, 1);
    assert.deepEqual(byTag(repRes), { RS: { accounts: 1, revenue: 50000, open_pipeline: 0 } }, 'her live account, her won deal on it');
    assert.deepEqual(repRes.totals, { accounts: 1, revenue: 50000, open_pipeline: 0 });

    // Org B: its own read, every name live — "Resinall, Inc." and both Lafayette sites are rows there.
    const bData = await loadReportData(B, bAdmin);
    assert.ok([...bData.accounts, ...bData.opportunities].every((r) => r.orgId === B), 'B\'s read is B\'s rows only');
    const bRes = runReport(ACCOUNTS_REPORT, bData, { fiscalStart: bData.fiscalStart, today });
    assert.equal(bRes.scanned, 7);
    assert.deepEqual(Object.keys(byTag(bRes)).sort(), ['EV', 'L1', 'L2', 'OC', 'RI', 'RS', 'UC']);
    assert.deepEqual(bRes.totals, { accounts: 7, revenue: 0, open_pipeline: 0 }, 'none of A\'s deals in B\'s report');
});

// ── I5 the quote email ───────────────────────────────────────────────────────

test('I5 the quote email: no billing contact — sent to the live Lee Ng\'s address, never his merged-away twin\'s, never org B\'s namesake\'s; a name only a merged-away contact has is the 422, nothing sent', async (t) => {
    // The org's contacts read as quote-email.mjs reads them (no order): which "Lee Ng" a find by name alone would take.
    const read = await db.select().from(contacts).where(eq(contacts.orgId, A));
    const firstLee = read.find((c) => `${c.firstName || ''} ${c.lastName || ''}`.trim() === 'Lee Ng');
    t.diagnostic(`fixture premise (not asserted — the database's read order): the first "Lee Ng" of A's read is ${firstLee?.id === conId(A, 'leeGone') ? 'the merged-away twin, so the old find would have mailed the old address' : 'the live one'}`);

    mails.length = 0;
    const sent = await sendQuote(A, 'User', CLERK.rep, QUOTE.lee);
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.equal(sent.body.customerEmail, EMAIL.lee, 'the live Lee Ng');
    assert.equal(sent.body.customerName, 'Lee Ng');
    assert.equal(mails.length, 1, 'one email');
    assert.equal(mails[0].to, EMAIL.lee, 'to the live Lee Ng\'s address');
    assert.notEqual(mails[0].to, EMAIL.leeGone, 'never the merged-away twin\'s old address');
    assert.notEqual(mails[0].to, EMAIL.leeB, 'never org B\'s Lee Ng, the first written');
    const [q] = await db.select().from(quotes).where(eq(quotes.id, QUOTE.lee));
    assert.equal(q.status, 'Sent to Customer');
    assert.ok(q.sentAt, 'sentAt stamped');
    const audit = await db.select().from(auditLog).where(and(eq(auditLog.orgId, A), eq(auditLog.entityId, QUOTE.lee), eq(auditLog.action, 'quote.emailed')));
    assert.equal(audit.length, 1, 'one quote.emailed row, in A');
    assert.ok(audit[0].detail.startsWith(`To ${EMAIL.lee} · `), audit[0].detail);
    assert.equal((await db.select().from(auditLog).where(eq(auditLog.orgId, B))).length, 0, 'nothing written to B\'s log');

    // Kim Old is only a merged-away contact of A (B's live Kim Old is B's): no recipient — the existing 422.
    mails.length = 0;
    const none = await sendQuote(A, 'Admin', CLERK.admin, QUOTE.kim);
    assert.equal(none.status, 422, JSON.stringify(none.body));
    assert.match(none.body.error, /^No customer email found/);
    assert.equal(mails.length, 0, 'nothing sent — not to the merged-away Kim Old\'s old address, not to B\'s Kim Old');
    const [k] = await db.select().from(quotes).where(eq(quotes.id, QUOTE.kim));
    assert.equal(k.status, 'Approved', 'the quote is not marked sent');
    assert.equal(k.sentAt, null);
    const kimAudit = await db.select().from(auditLog).where(and(eq(auditLog.orgId, A), eq(auditLog.entityId, QUOTE.kim)));
    assert.equal(kimAudit.length, 0, 'no audit row for a send that did not happen');
});
