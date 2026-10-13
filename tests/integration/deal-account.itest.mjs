// tests/integration/deal-account.itest.mjs
//
// A deal keeps the account picked, by id (state §0.198 — OPEN_ITEMS §1 item 1; Jeff, 11 Oct:
// D2 "Yes, same batch", D13 "Check it now"). opportunities.mjs's sanitize had no accountId:
// a deal saved from the deal window was linked to its account by NAME alone, and a deal
// moved to another account kept its old id under the new name. Against the test database:
// the id is stored on a create and kept by a partial PUT; a new id must be one of the
// caller's org's accounts — another org's, or none, is refused — and never a site, and the
// deal takes that account's own name; an id the deal already holds is kept as sent (a site
// an older Save stored, a deleted account's id), on a single save and in a batch; a name
// sent without an id unlinks; a bulk write naming another org's account is refused whole;
// and org B neither sees nor changes org A's deals. A new id of an account merged into
// another links the account it was merged into, in this org (F2); an account merge renames
// only its own deals and those with no id — never a same-named twin's by id (F3). A walk that
// leads back to the account the deal holds is an untouched save: a screen loaded before a
// merge into a site, or into an account deleted since, still saves (G2). A merge into a site
// moves the merged-away account's deals up to the account above the site, Site Name the site,
// and its undo puts them back (D22). A CSV overwrite that renames a deal's account unlinks it
// (G6). Then (area 10): no id sent while the deal holds one never unlinks it — a stale list's
// save keeps a D22 lift (H4); a walk through a site the deal was lifted through saves untouched
// after the site has moved (H5); a merge that lifts its survivor to the top makes it an account
// (H6); the merge walks and the CSV overwrite leave org B's deals alone (H8). Then (area 11): a
// stale window's Site Name edit is saved, while a stale whole row from before a D22 lift still
// keeps the lift (J5); a site sent directly whose name the deal's Site Name holds keeps the
// link (H5, accepted).
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST — see TESTING.md)

if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database. See TESTING.md.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

// The stubs opportunities.itest.mjs uses: every name the endpoint imports from auth.mjs,
// and no outbound email, webhook or automation.
mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            const userRole = event.headers?.['x-test-role'] || 'Admin';
            return { userId: 'u_' + orgId, orgId, userRole, managedReps: [], error: null };
        },
        canSeeAll:    (role) => role === 'Admin' || role === 'Manager',
        isManager:    (role) => role === 'Manager',
        isReadOnly:   (role) => role === 'ReadOnly',
        isTechnician: (role) => role === 'Technician',
        requireRole: (auth, allowedRoles, headers) => (
            allowedRoles.includes(auth?.userRole)
                ? null
                : { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: insufficient role' }) }
        ),
        requireWrite: (auth, event, headers, opts = {}) => {
            if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(event?.httpMethod)) return null;
            if (auth?.userRole === 'ReadOnly') {
                return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: read-only access' }) };
            }
            if (auth?.userRole === 'Technician' && !opts.allowTechnician) {
                return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: technicians may only update their own assigned jobs' }) };
            }
            return null;
        },
    },
});
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: {
        sendEmail: async () => {},
        emailTemplates: new Proxy({}, { get: () => () => ({ subject: '', html: '' }) }),
    },
});
mock.module(new URL('../../netlify/functions/webhooks.mjs', import.meta.url).href, {
    namedExports: { dispatchWebhook: async () => {} },
});
mock.module(new URL('../../netlify/functions/dispatch-automations.mjs', import.meta.url).href, {
    namedExports: { dispatchAutomations: async () => {} },
});

const { handler } = await import('../../netlify/functions/opportunities.mjs');
const { handler: mergeFn } = await import('../../netlify/functions/merge.mjs');
const { db } = await import('../../db/index.js');
const { opportunities, accounts, mergeLog, auditLog } = await import('../../db/schema.js');
const { eq } = await import('drizzle-orm');

// ORG NAMESPACE: this file owns 'itest_dealacct_*' — its two orgs, and every account and
// deal id it writes (ids are global keys) — and ONLY this file writes to it (guide §18b25).
const A = 'itest_dealacct_A', B = 'itest_dealacct_B';
const ID = (s) => 'itest_dealacct_' + s;
const SHELL = ID('shell'), UNIT = ID('unit'), SITE = ID('site'), INEOS = ID('ineos'), B_ACCT = ID('b_acct');
const NOT_IN_ORG = 'That account is not in your organization — pick one from the list.';
const IS_SITE = 'A site can’t be a deal’s account — pick the account it belongs to.';

const ev = (org, method, body) => ({
    httpMethod: method,
    headers: { 'x-test-org': org, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    queryStringParameters: {},
});
const call = async (org, method, body) => {
    const r = await handler(ev(org, method, body));
    return { status: r.statusCode, body: JSON.parse(r.body || '{}') };
};
const rowOf = async (id) => (await db.select().from(opportunities).where(eq(opportunities.id, id)))[0];

const cleanup = async () => {
    for (const o of [A, B]) {
        await db.delete(opportunities).where(eq(opportunities.orgId, o));
        await db.delete(accounts).where(eq(accounts.orgId, o));
        await db.delete(mergeLog).where(eq(mergeLog.orgId, o));     // the merge test's undo record
        await db.delete(auditLog).where(eq(auditLog.orgId, o));     // and its audit lines
    }
};

before(async () => {
    await cleanup();
    // UKG's shape (read 9 Oct): Shell, and under it two "Shell - Port Allen" — a business
    // unit and a site; one more account in A, and one in B.
    await db.insert(accounts).values([
        { id: SHELL, name: 'Shell', accountTier: 'account', parentAccountId: null, orgId: A },
        { id: UNIT, name: 'Shell - Port Allen', accountTier: 'business_unit', parentAccountId: SHELL, orgId: A },
        { id: SITE, name: 'Shell - Port Allen', accountTier: 'site', parentAccountId: SHELL, orgId: A },
        { id: INEOS, name: 'INEOS Acetyls', accountTier: 'account', parentAccountId: null, orgId: A },
        { id: B_ACCT, name: 'B Corp', accountTier: 'account', parentAccountId: null, orgId: B },
    ]);
});
after(cleanup);

test("a create keeps the account picked, by id — under the account's own name", async () => {
    const r = await call(A, 'POST', { id: ID('d1'), opportunityName: 'D1', account: 'shell port allen', accountId: UNIT });
    assert.equal(r.status, 201);
    const row = await rowOf(ID('d1'));
    assert.equal(row.accountId, UNIT, 'the unit picked — not whichever "Shell - Port Allen" comes first');
    assert.equal(row.account, 'Shell - Port Allen', "the account's own name, whatever text came with the id");
    assert.equal(r.body.opportunity.accountId, UNIT, 'the answer is the row as stored (the list takes it)');
});

test('a partial PUT keeps the id — a stage move, and the notes alone', async () => {
    assert.equal((await call(A, 'PUT', { id: ID('d1'), stage: 'Proposal' })).status, 200);
    assert.equal((await rowOf(ID('d1'))).accountId, UNIT);
    assert.equal((await call(A, 'PUT', { id: ID('d1'), comments: [{ id: 'c1', text: 'note', timestamp: '2026-10-11T00:00:00Z' }] })).status, 200);
    const row = await rowOf(ID('d1'));
    assert.equal(row.accountId, UNIT, "saveDealComments' PUT names no account");
    assert.equal(row.account, 'Shell - Port Allen');
});

test('a re-pick moves the id with the name — the old id never stays under the new name', async () => {
    const r = await call(A, 'PUT', { id: ID('d1'), account: 'Ineos - Acetyls', accountId: INEOS });
    assert.equal(r.status, 200);
    const row = await rowOf(ID('d1'));
    assert.equal(row.accountId, INEOS);
    assert.equal(row.account, 'INEOS Acetyls', 'named after the account picked');
    assert.equal(r.body.opportunity.account, 'INEOS Acetyls', 'and the answer says so (the Closed Lost save puts it in the list)');
});

test("a new id must be one of this org's accounts: another org's, or none, is refused and nothing changes", async () => {
    const put = await call(A, 'PUT', { id: ID('d1'), account: 'B Corp', accountId: B_ACCT });
    assert.equal(put.status, 404);
    assert.equal(put.body.error, NOT_IN_ORG);
    const row = await rowOf(ID('d1'));
    assert.deepEqual([row.accountId, row.account], [INEOS, 'INEOS Acetyls'], 'unchanged');
    const post = await call(A, 'POST', { id: ID('d_foreign'), opportunityName: 'X', account: 'B Corp', accountId: B_ACCT });
    assert.equal(post.status, 404);
    assert.equal(await rowOf(ID('d_foreign')), undefined, 'nothing created');
    const ghost = await call(A, 'POST', { id: ID('d_ghost'), opportunityName: 'X', accountId: ID('no_such_account') });
    assert.equal(ghost.status, 404);
    assert.equal(await rowOf(ID('d_ghost')), undefined);
});

test("a site is never made a deal's account", async () => {
    const r = await call(A, 'PUT', { id: ID('d1'), account: 'Shell - Port Allen', accountId: SITE });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, IS_SITE);
    assert.equal((await rowOf(ID('d1'))).accountId, INEOS, 'unchanged');
    const post = await call(A, 'POST', { id: ID('d_site_new'), opportunityName: 'X', account: 'Shell - Port Allen', accountId: SITE });
    assert.equal(post.status, 400);
    assert.equal(await rowOf(ID('d_site_new')), undefined);
});

test('an id the deal already holds is kept as sent — a site an older Save stored, a deleted account (D13)', async () => {
    await db.insert(opportunities).values([
        { id: ID('d_site'), opportunityName: 'Old', account: 'Shell - Port Allen', accountId: SITE, pipelineId: 'default', stage: 'Discovery', orgId: A },
        { id: ID('d_gone'), opportunityName: 'Closed', account: 'Gone Co', accountId: ID('deleted_account'), pipelineId: 'default', stage: 'Closed Lost', orgId: A },
    ]);
    // the Kanban's whole-row PUT: the row as the list holds it, the stage moved
    const moved = await call(A, 'PUT', { id: ID('d_site'), opportunityName: 'Old', account: 'Shell - Port Allen', accountId: SITE, stage: 'Proposal' });
    assert.equal(moved.status, 200);
    const s = await rowOf(ID('d_site'));
    assert.deepEqual([s.accountId, s.account, s.stage], [SITE, 'Shell - Port Allen', 'Proposal']);
    const gone = await call(A, 'PUT', { id: ID('d_gone'), opportunityName: 'Closed', account: 'Gone Co', accountId: ID('deleted_account'), notes: 'kept' });
    assert.equal(gone.status, 200, 'an untouched link is not looked up again');
    assert.equal((await rowOf(ID('d_gone'))).accountId, ID('deleted_account'));
});

test('a name sent without an id unlinks; an empty id never does — the link kept whole (H4)', async () => {
    await call(A, 'PUT', { id: ID('d1'), account: 'Free Text Co' });
    let row = await rowOf(ID('d1'));
    assert.deepEqual([row.account, row.accountId], ['Free Text Co', null], 'the id goes with the old name');
    await call(A, 'PUT', { id: ID('d1'), accountId: UNIT });
    row = await rowOf(ID('d1'));
    assert.deepEqual([row.account, row.accountId], ['Shell - Port Allen', UNIT], 'relinked, and named after it');
    const r = await call(A, 'PUT', { id: ID('d1'), accountId: '' });
    assert.equal(r.status, 200);
    row = await rowOf(ID('d1'));
    assert.deepEqual([row.account, row.accountId], ['Shell - Port Allen', UNIT], "a key sent empty never unlinks: no screen clears a deal's account (H4)");
    await call(A, 'PUT', { id: ID('d1'), account: 'SHELL - port  allen' });
    row = await rowOf(ID('d1'));
    assert.deepEqual([row.account, row.accountId], ['Shell - Port Allen', UNIT], 'the same name in another case and spacing, sent without an id: the link kept, and the stored spelling (the pre-ship round)');
});

test("org isolation: B never sees A's deals, cannot relink one, and cannot link to A's accounts", async () => {
    const ids = (await call(B, 'GET')).body.opportunities.map((o) => o.id);
    assert.ok(!ids.some((id) => id.startsWith('itest_dealacct_')), "none of A's deals reach B");
    const r = await call(B, 'PUT', { id: ID('d_site'), accountId: B_ACCT });
    assert.equal(r.status, 404, "A's deal is not found in B");
    const s = await rowOf(ID('d_site'));
    assert.deepEqual([s.accountId, s.orgId], [SITE, A], "A's row unchanged");
    const post = await call(B, 'POST', { id: ID('d_b'), opportunityName: 'B', accountId: SHELL });
    assert.equal(post.status, 404, "A's account is not B's");
    assert.equal(await rowOf(ID('d_b')), undefined);
});

test("bulk: a row naming another org's account refuses the batch; this org's is stored and kept; an id a deal holds is not asked again", async () => {
    const bad = await call(A, 'POST', [{ id: ID('bulk1'), opportunityName: 'B1', accountId: B_ACCT }]);
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, NOT_IN_ORG);
    assert.deepEqual(bad.body.accountIds, [B_ACCT]);
    assert.equal(await rowOf(ID('bulk1')), undefined, 'nothing imported');
    const ok = await call(A, 'POST', [{ id: ID('bulk2'), opportunityName: 'B2', account: 'INEOS Acetyls', accountId: INEOS }]);
    assert.equal(ok.status, 201);
    assert.equal((await rowOf(ID('bulk2'))).accountId, INEOS);
    assert.equal((await call(A, 'PUT', [{ id: ID('bulk2'), notes: 'imported' }])).status, 200);
    assert.equal((await rowOf(ID('bulk2'))).accountId, INEOS, 'an overwrite naming no id keeps it (partialRows)');
    const badPut = await call(A, 'PUT', [{ id: ID('bulk2'), accountId: B_ACCT }]);
    assert.equal(badPut.status, 400);
    assert.equal((await rowOf(ID('bulk2'))).accountId, INEOS, 'unchanged');
    const held = await call(A, 'PUT', [{ id: ID('d_gone'), accountId: ID('deleted_account'), notes: 'still kept' }]);
    assert.equal(held.status, 200, "a deleted account's id the deal already holds is kept, as on a single save");
    assert.equal((await rowOf(ID('d_gone'))).accountId, ID('deleted_account'));
});

test("G6: a CSV overwrite that renames a deal's account, naming no id, unlinks it — as a single save does — and the batch's other rows keep their ids", async () => {
    await db.insert(opportunities).values([
        { id: ID('g6_a'), opportunityName: 'G6 A', account: 'INEOS Acetyls', accountId: INEOS, pipelineId: 'default', stage: 'Discovery', orgId: A },
        { id: ID('g6_b'), opportunityName: 'G6 B', account: 'Shell', accountId: SHELL, pipelineId: 'default', stage: 'Discovery', orgId: A },
        { id: ID('g6_c'), opportunityName: 'G6 C', account: 'Shell', accountId: SHELL, pipelineId: 'default', stage: 'Discovery', orgId: A },
    ]);
    // org B's deal, named in A's batch (H8): the batch is A's alone
    await db.insert(opportunities).values({ id: ID('g6_borg'), opportunityName: 'G6 B Org', account: 'Shell', accountId: null, pipelineId: 'default', stage: 'Discovery', orgId: B });
    // a CSV's rows carry the same mapped columns (importRows.js): every row names an Account
    const r = await call(A, 'PUT', [{ id: ID('g6_a'), account: 'Renamed Co', notes: 'imported' }, { id: ID('g6_b'), account: 'Shell', notes: 'imported' }, { id: ID('g6_c'), account: 'shell', notes: 'imported' }, { id: ID('g6_borg'), account: 'Renamed Co', notes: 'imported' }]);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const now = async (id) => { const x = await rowOf(id); return [x.account, x.accountId]; };
    assert.deepEqual(await now(ID('g6_a')), ['Renamed Co', null], 'renamed: the id goes with the old name');
    assert.deepEqual(await now(ID('g6_b')), ['Shell', SHELL], 'the name it holds: its id kept, though another row unlinked');
    assert.deepEqual(await now(ID('g6_c')), ['Shell', SHELL], "the same name in another case — the CSV's duplicate rule matched it so: the same account, kept, under its stored spelling, as on a single save (the pre-ship round)");
    const b = await rowOf(ID('g6_borg'));
    assert.deepEqual([b.account, b.accountId, b.notes, b.orgId], ['Shell', null, null, B], "org B's deal named in A's batch: untouched — its name, its id, its notes");
    assert.ok((r.body.notFound || []).includes(ID('g6_borg')), "and reported not found: A's batch reaches only A's deals");
    assert.equal(r.body.updated, 3, "A's three rows, no more");
});

test("F2: a NEW id of an account merged into another links the account it was merged into, in this org, and takes its name — a screen loaded before the merge cannot put a deal back on the merged-away account", async () => {
    await db.insert(accounts).values([
        { id: ID('oil'), name: 'Shell Oil', accountTier: 'account', parentAccountId: null, mergeArchived: true, mergedIntoId: SHELL, orgId: A },
        { id: ID('oil_co'), name: 'Shell Oil Co', accountTier: 'account', parentAccountId: null, mergeArchived: true, mergedIntoId: ID('oil'), orgId: A },
        { id: ID('to_b'), name: 'Into B', accountTier: 'account', parentAccountId: null, mergeArchived: true, mergedIntoId: B_ACCT, orgId: A },
        { id: ID('loop1'), name: 'Loop One', accountTier: 'account', parentAccountId: null, mergeArchived: true, mergedIntoId: ID('loop2'), orgId: A },
        { id: ID('loop2'), name: 'Loop Two', accountTier: 'account', parentAccountId: null, mergeArchived: true, mergedIntoId: ID('loop1'), orgId: A },
        { id: ID('to_site'), name: 'Into Site', accountTier: 'account', parentAccountId: null, mergeArchived: true, mergedIntoId: SITE, orgId: A },
    ]);
    const post = await call(A, 'POST', { id: ID('d_oil'), opportunityName: 'Oil', account: 'Shell Oil', accountId: ID('oil') });
    assert.equal(post.status, 201, JSON.stringify(post.body));
    let row = await rowOf(ID('d_oil'));
    assert.deepEqual([row.accountId, row.account], [SHELL, 'Shell'], 'the account it was merged into, under its own name');
    // a whole-row PUT from a list loaded before the merge (a Kanban drag): the merged-away id comes back
    const stale = await call(A, 'PUT', { id: ID('d_oil'), opportunityName: 'Oil', account: 'Shell Oil Co', accountId: ID('oil_co'), stage: 'Proposal' });
    assert.equal(stale.status, 200, JSON.stringify(stale.body));
    row = await rowOf(ID('d_oil'));
    assert.deepEqual([row.accountId, row.account, row.stage], [SHELL, 'Shell', 'Proposal'], 'merged into one merged since: followed to Shell — the deal stays on the survivor');
    for (const [id, why] of [[ID('to_b'), "merged into another org's account: not this org's"], [ID('loop1'), 'a loop of merges: no live account'], [ID('no_such'), 'none at all']]) {
        const r = await call(A, 'PUT', { id: ID('d_oil'), accountId: id });
        assert.equal(r.status, 404, `${why}: ${JSON.stringify(r.body)}`);
        assert.equal(r.body.error, NOT_IN_ORG, 'the answer a missing id gets');
    }
    const held = await call(A, 'PUT', { id: ID('d_oil'), accountId: ID('to_site'), stage: 'Negotiation' });
    assert.equal(held.status, 200, `merged into a site whose account the deal holds: the link as stored (G2, D22) — ${JSON.stringify(held.body)}`);
    row = await rowOf(ID('d_oil'));
    assert.deepEqual([row.accountId, row.account, row.stage], [SHELL, 'Shell', 'Negotiation'], 'nothing changed by the refusals, and the untouched save stood');
    const ineos = await call(A, 'POST', { id: ID('d_ineos'), opportunityName: 'Ineos', accountId: INEOS });
    assert.equal(ineos.status, 201);
    const site = await call(A, 'PUT', { id: ID('d_ineos'), accountId: ID('to_site') });
    assert.equal(site.status, 400, "merged into a site the deal's account is not over: a site is never a deal's account");
    assert.equal(site.body.error, IS_SITE);
    assert.equal((await rowOf(ID('d_ineos'))).accountId, INEOS, 'unchanged');
    const fromB = await call(B, 'POST', { id: ID('d_b_oil'), opportunityName: 'B Oil', accountId: ID('oil') });
    assert.equal(fromB.status, 404, "org B naming A's merged-away account: not found — the walk is A's");
    assert.equal(await rowOf(ID('d_b_oil')), undefined);
});

test("G2: a screen loaded before a merge sends the merged-away id, and the walk leads back to the account the deal holds — an untouched save: 200, the stage moved, the link as stored — after a merge into a site (D22 moved the deal up), into an account deleted since, and into a site with no account above it, deleted since", async () => {
    const G = (s) => ID('g2_' + s);
    await db.insert(accounts).values([
        { id: G('site'), name: 'G2 Port Site', accountTier: 'site', parentAccountId: SHELL, orgId: A },
        { id: G('unit'), name: 'G2 Port Unit', accountTier: 'business_unit', parentAccountId: SHELL, orgId: A },
        { id: G('a'), name: 'G2 Alpha', accountTier: 'account', parentAccountId: null, orgId: A },
        { id: G('b'), name: 'G2 Beta', accountTier: 'account', parentAccountId: null, orgId: A },
        { id: G('x'), name: 'G2 Xray', accountTier: 'account', parentAccountId: null, orgId: A },
        { id: G('top_site'), name: 'G2 Top Site', accountTier: 'site', parentAccountId: null, orgId: A },
    ]);
    const make = async (id, accountId) => assert.equal((await call(A, 'POST', { id, opportunityName: id, accountId })).status, 201);
    const merge = async (survivorId, archivedId) => { const m = await mergeFn(ev(A, 'POST', { entityType: 'account', survivorId, archivedId })); assert.equal(m.statusCode, 200, m.body); };
    // org B's deal of the same shape (H8) — holding A's unit's id, stored before batch 4's checks
    await db.insert(opportunities).values({ id: G('b_d1'), opportunityName: 'G2 B Deal', account: 'G2 Port Unit', accountId: G('unit'), site: null, pipelineId: 'default', stage: 'Discovery', orgId: B });
    // into a site: the deal goes up to Shell, Site Name the site (D22); a stale Kanban drag carries the unit
    await make(G('d1'), G('unit'));
    await merge(G('site'), G('unit'));
    let row = await rowOf(G('d1'));
    assert.deepEqual([row.accountId, row.account, row.site], [SHELL, 'Shell', 'G2 Port Site'], 'merged into a site: up to the account above it, Site Name the site');
    const bDeal = async () => { const x = await rowOf(G('b_d1')); return [x.accountId, x.account, x.site, x.stage, x.orgId]; };
    assert.deepEqual(await bDeal(), [G('unit'), 'G2 Port Unit', null, 'Discovery', B], "org B's deal of the same shape: untouched by A's merge");
    let r = await call(A, 'PUT', { id: G('d1'), opportunityName: G('d1'), account: 'G2 Port Unit', accountId: G('unit'), site: null, stage: 'Proposal' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    row = await rowOf(G('d1'));
    assert.deepEqual([row.accountId, row.account, row.site, row.stage], [SHELL, 'Shell', 'G2 Port Site', 'Proposal'], 'the stage moved; the link and its Site Name as stored');
    r = await call(B, 'PUT', { id: G('d1'), accountId: G('unit'), stage: 'Negotiation' });
    assert.equal(r.status, 404, "org B's stale save of A's deal: not found in B");
    assert.deepEqual([(await rowOf(G('d1'))).stage, (await rowOf(G('d1'))).orgId], ['Proposal', A], "A's deal unchanged");
    r = await call(B, 'PUT', { id: G('b_d1'), opportunityName: 'G2 B Deal', account: 'G2 Port Unit', accountId: G('unit'), site: null, stage: 'Proposal' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(await bDeal(), [G('unit'), 'G2 Port Unit', null, 'Proposal', B], "org B's own stale save: the id it holds kept as sent — A's walk never runs for it");
    // into an account deleted since
    await make(G('d2'), G('a'));
    await merge(G('b'), G('a'));
    assert.equal((await rowOf(G('d2'))).accountId, G('b'));
    await db.delete(accounts).where(eq(accounts.id, G('b')));
    r = await call(A, 'PUT', { id: G('d2'), opportunityName: G('d2'), account: 'G2 Alpha', accountId: G('a'), stage: 'Proposal' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    row = await rowOf(G('d2'));
    assert.deepEqual([row.accountId, row.account, row.stage], [G('b'), 'G2 Beta', 'Proposal'], 'the survivor the deal holds, gone since: never looked up — kept');
    // into a site with no account above it (stored before the rule: nothing to move the deal up to), deleted since
    await make(G('d3'), G('x'));
    await merge(G('top_site'), G('x'));
    assert.equal((await rowOf(G('d3'))).accountId, G('top_site'), 'no account above the site: the deal stays where the merge put it');
    await db.delete(accounts).where(eq(accounts.id, G('top_site')));
    r = await call(A, 'PUT', { id: G('d3'), opportunityName: G('d3'), account: 'G2 Xray', accountId: G('x'), stage: 'Proposal' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    row = await rowOf(G('d3'));
    assert.deepEqual([row.accountId, row.stage], [G('top_site'), 'Proposal']);
});

test("D22: a merge into a site moves the merged-away account's deals — by id, and by name where a deal has none and no other account has the name — up to the account above the site, Site Name the site, in the merge's own batch; another account's deals and org B's are untouched; the undo puts each back exactly", async () => {
    const M = (s) => ID('d22_' + s);
    await db.insert(accounts).values([
        { id: M('dock'), name: 'D22 Dock', accountTier: 'site', parentAccountId: SHELL, orgId: A },
        { id: M('plant'), name: 'D22 Plant', accountTier: 'business_unit', parentAccountId: SHELL, orgId: A },
        { id: M('other'), name: 'D22 Other', accountTier: 'account', parentAccountId: null, orgId: A },
    ]);
    const deal = (id, accountId, account, site = null, orgId = A) => ({ id, opportunityName: id, account, accountId, site, pipelineId: 'default', stage: 'Discovery', orgId });
    await db.insert(opportunities).values([
        deal(M('by_id'), M('plant'), 'D22 Plant', 'North Gate'),
        deal(M('by_name'), null, 'D22 Plant'),
        deal(M('other_deal'), M('other'), 'D22 Other'),
        deal(M('b_deal'), null, 'D22 Plant', null, B),
    ]);
    const m = await mergeFn(ev(A, 'POST', { entityType: 'account', survivorId: M('dock'), archivedId: M('plant') }));
    assert.equal(m.statusCode, 200, m.body);
    const now = async (id) => { const r = await rowOf(id); return [r.accountId, r.account, r.site]; };
    assert.deepEqual(await now(M('by_id')), [SHELL, 'Shell', 'D22 Dock'], "by id: up to Shell, Shell's name, Site Name the site");
    assert.deepEqual(await now(M('by_name')), [SHELL, 'Shell', 'D22 Dock'], 'by name, no id: the same');
    assert.deepEqual(await now(M('other_deal')), [M('other'), 'D22 Other', null], "another account's deal: untouched");
    assert.deepEqual(await now(M('b_deal')), [null, 'D22 Plant', null], "org B's deal of the name: never touched");
    const u = await mergeFn(ev(A, 'POST', { reverse: true, mergeLogId: JSON.parse(m.body).mergeLogId }));
    assert.equal(u.statusCode, 200, u.body);
    assert.deepEqual(await now(M('by_id')), [M('plant'), 'D22 Plant', 'North Gate'], 'undone: its account, id and Site Name as they were');
    assert.deepEqual(await now(M('by_name')), [null, 'D22 Plant', null]);
    // a name another account shares (a twin): a deal with no id is no one's by name
    await db.insert(accounts).values({ id: M('twin'), name: 'D22 Plant', accountTier: 'business_unit', parentAccountId: INEOS, orgId: A });
    const m2 = await mergeFn(ev(A, 'POST', { entityType: 'account', survivorId: M('dock'), archivedId: M('plant') }));
    assert.equal(m2.statusCode, 200, m2.body);
    assert.deepEqual(await now(M('by_id')), [SHELL, 'Shell', 'D22 Dock'], 'by id: moved up');
    assert.deepEqual((await now(M('by_name'))).slice(0, 1), [null], "a name the twin shares: not moved up by name (F3's rename still names it after the survivor)");
});

test("H4: a list loaded before a D22 lift by name — the Kanban's drag (the stage alone, now) and the whole row a stale list sends (no account id: Reports' contact edit, the drag before) — keeps the lift; an empty or null id never unlinks a deal: the link kept whole", async () => {
    const H = (s) => ID('h4_' + s);
    await db.insert(accounts).values([
        { id: H('unit'), name: 'H4 Port Allen', accountTier: 'business_unit', parentAccountId: SHELL, orgId: A },
        { id: H('site'), name: 'H4 Port Allen Site', accountTier: 'site', parentAccountId: SHELL, orgId: A },
    ]);
    // an id-less deal named after the unit (28 of 85 deals carry no id; UKG 2 of 17 — SELECT 12 Oct)
    await db.insert(opportunities).values({ id: H('d'), opportunityName: 'H4 Deal', account: 'H4 Port Allen', accountId: null, site: null, pipelineId: 'default', stage: 'Discovery', orgId: A });
    const loaded = await rowOf(H('d'));   // the list as it was loaded
    const m = await mergeFn(ev(A, 'POST', { entityType: 'account', survivorId: H('site'), archivedId: H('unit') }));
    assert.equal(m.statusCode, 200, m.body);
    const now = async () => { const x = await rowOf(H('d')); return [x.accountId, x.account, x.site, x.stage]; };
    assert.deepEqual(await now(), [SHELL, 'Shell', 'H4 Port Allen Site', 'Discovery'], 'D22: moved up by its name');
    // the Kanban's drag: the stage, its date and its history alone
    let r = await call(A, 'PUT', { id: H('d'), stage: 'Proposal', stageChangedDate: '2026-10-12', stageHistory: [{ stage: 'Proposal', date: '2026-10-12', prevStage: 'Discovery' }] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(await now(), [SHELL, 'Shell', 'H4 Port Allen Site', 'Proposal'], 'the lift kept');
    // the whole row a stale list sends: no id, the old name, no Site Name
    r = await call(A, 'PUT', { ...loaded, createdAt: undefined, updatedAt: undefined, stage: 'Negotiation', contactIds: [] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(await now(), [SHELL, 'Shell', 'H4 Port Allen Site', 'Negotiation'], 'no id sent while the deal holds one: the link, its name and its Site Name kept; the stage saved');
    for (const empty of ['', null]) {
        r = await call(A, 'PUT', { id: H('d'), accountId: empty, account: 'Something Else', site: 'Elsewhere' });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.deepEqual((await now()).slice(0, 3), [SHELL, 'Shell', 'H4 Port Allen Site'], `accountId ${JSON.stringify(empty)}: never an unlink`);
    }
});

test("J5: a save that sends no account id while the deal holds one keeps the id and the name — and the Site Name it sends where its Account text is the stored one (a deal window opened from a list loaded before the deal was linked: its Site Name edit saved), the stored Site Name where it is not (a whole row from before a D22 lift by name: the lift kept)", async () => {
    const W = (s) => ID('j5_' + s);
    await db.insert(accounts).values({ id: W('unit'), name: 'J5 Port Allen', accountTier: 'business_unit', parentAccountId: SHELL, orgId: A });
    await db.insert(accounts).values({ id: W('site'), name: 'J5 Port Allen Site', accountTier: 'site', parentAccountId: SHELL, orgId: A });
    // the server critic's C4: linked to Shell, Site Name "J5 Gate 1"; a window from a list that held no id
    await db.insert(opportunities).values({ id: W('d'), opportunityName: 'J5 Deal', account: 'Shell', accountId: SHELL, site: 'J5 Gate 1', pipelineId: 'default', stage: 'Discovery', orgId: A });
    const now = async (id) => { const x = await rowOf(id); return [x.accountId, x.account, x.site, x.stage]; };
    let r = await call(A, 'PUT', { id: W('d'), opportunityName: 'J5 Deal', account: 'Shell', accountId: '', site: 'J5 Tank 4', stage: 'Discovery' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(await now(W('d')), [SHELL, 'Shell', 'J5 Tank 4', 'Discovery'], 'the id and name kept; the Site Name typed in the window saved');
    r = await call(A, 'PUT', { id: W('d'), account: 'Shell', accountId: null, site: '' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual((await now(W('d'))).slice(0, 3), [SHELL, 'Shell', null], 'a Site Name cleared there is cleared');
    // a deal saved by name alone, lifted by a merge into the site (D22), then saved from a list loaded before the lift
    await db.insert(opportunities).values({ id: W('old'), opportunityName: 'J5 Old', account: 'J5 Port Allen', accountId: null, site: null, pipelineId: 'default', stage: 'Discovery', orgId: A });
    const loaded = await rowOf(W('old'));
    const m = await mergeFn(ev(A, 'POST', { entityType: 'account', survivorId: W('site'), archivedId: W('unit') }));
    assert.equal(m.statusCode, 200, m.body);
    assert.deepEqual(await now(W('old')), [SHELL, 'Shell', 'J5 Port Allen Site', 'Discovery'], 'D22: moved up by its name');
    r = await call(A, 'PUT', { ...loaded, createdAt: undefined, updatedAt: undefined, stage: 'Proposal' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(await now(W('old')), [SHELL, 'Shell', 'J5 Port Allen Site', 'Proposal'], 'the stale whole row: its Account text not the stored one — the lift and its Site Name kept, the stage saved');
});

test("H5: a stale screen's walk that ends on a site whose name the deal's Site Name holds, the account it holds no site — the site the deal was lifted through — saves untouched after the site has moved to another account; a Site Name that matches a site sent directly keeps the link too (accepted, OPEN_ITEMS §4.2); a Site Name that does not match, or a deal held on a site, is still refused", async () => {
    const Q = (s) => ID('h5_' + s);
    await db.insert(accounts).values([
        { id: Q('dow'), name: 'H5 Dow', accountTier: 'account', parentAccountId: null, orgId: A },
        { id: Q('unit'), name: 'H5 Unit', accountTier: 'business_unit', parentAccountId: SHELL, orgId: A },
        { id: Q('dock'), name: 'H5 Dock', accountTier: 'site', parentAccountId: SHELL, orgId: A },
    ]);
    assert.equal((await call(A, 'POST', { id: Q('d'), opportunityName: 'H5 Deal', accountId: Q('unit') })).status, 201);
    const m = await mergeFn(ev(A, 'POST', { entityType: 'account', survivorId: Q('dock'), archivedId: Q('unit') }));
    assert.equal(m.statusCode, 200, m.body);
    const now = async () => { const x = await rowOf(Q('d')); return [x.accountId, x.account, x.site, x.stage]; };
    assert.deepEqual(await now(), [SHELL, 'Shell', 'H5 Dock', 'Discovery'], 'D22: up to Shell, Site Name the dock');
    // another session moves the dock to Dow: still a site (D21), no deal moved (D22 moves deals only from what a move makes a site)
    await db.update(accounts).set({ parentAccountId: Q('dow') }).where(eq(accounts.id, Q('dock')));
    // a screen loaded before the merge drags the deal: its old id walks to the dock, under Dow now
    let r = await call(A, 'PUT', { id: Q('d'), opportunityName: 'H5 Deal', account: 'H5 Unit', accountId: Q('unit'), stage: 'Proposal' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(await now(), [SHELL, 'Shell', 'H5 Dock', 'Proposal'], 'untouched: the link and its Site Name as stored, the stage moved');
    // the lens critic's L6: a deal on INEOS whose Site Name is the dock's, never lifted through it — the dock's id sent
    // directly reads as the site its Site Name names: the link kept untouched, the rest of the save stands (accepted)
    await db.insert(opportunities).values({ id: Q('match'), opportunityName: 'H5 Match', account: 'INEOS Acetyls', accountId: INEOS, site: 'H5 Dock', pipelineId: 'default', stage: 'Discovery', orgId: A });
    r = await call(A, 'PUT', { id: Q('match'), accountId: Q('dock'), stage: 'Proposal' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const match = await rowOf(Q('match'));
    assert.deepEqual([match.accountId, match.account, match.site, match.stage], [INEOS, 'INEOS Acetyls', 'H5 Dock', 'Proposal'], 'a matching Site Name keeps the link');
    // a deal on INEOS whose Site Name is another: no lift — a site is never a deal's account
    await db.insert(opportunities).values({ id: Q('other'), opportunityName: 'H5 Other', account: 'INEOS Acetyls', accountId: INEOS, site: 'Elsewhere', pipelineId: 'default', stage: 'Discovery', orgId: A });
    r = await call(A, 'PUT', { id: Q('other'), accountId: Q('unit') });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, IS_SITE);
    // a deal held on a site (an older Save; UKG's 6), its Site Name the dock's: the account it holds is a site — no lift either
    await db.insert(opportunities).values({ id: Q('on_site'), opportunityName: 'H5 On Site', account: 'Shell - Port Allen', accountId: SITE, site: 'H5 Dock', pipelineId: 'default', stage: 'Discovery', orgId: A });
    r = await call(A, 'PUT', { id: Q('on_site'), accountId: Q('unit') });
    assert.equal(r.status, 400);
    assert.equal((await rowOf(Q('on_site'))).accountId, SITE, 'unchanged');
});

test("H6: a merge that lifts its survivor to the top level makes it an account — a top-level account merged into its own site: the deals it hands over are on an account, not a site at the top; the undo puts the stored tier back", async () => {
    const P = (s) => ID('h6_' + s);
    await db.insert(accounts).values([
        { id: P('plant'), name: 'H6 Plant', accountTier: 'account', parentAccountId: null, orgId: A },
        { id: P('dock'), name: 'H6 Dock', accountTier: 'site', parentAccountId: P('plant'), orgId: A },
    ]);
    await db.insert(opportunities).values({ id: P('d'), opportunityName: 'H6 Deal', account: 'H6 Plant', accountId: P('plant'), pipelineId: 'default', stage: 'Discovery', orgId: A });
    const m = await mergeFn(ev(A, 'POST', { entityType: 'account', survivorId: P('dock'), archivedId: P('plant') }));
    assert.equal(m.statusCode, 200, m.body);
    const acct = async (id) => { const x = (await db.select().from(accounts).where(eq(accounts.id, id)))[0]; return [x.parentAccountId, x.accountTier]; };
    assert.deepEqual(await acct(P('dock')), [null, 'account'], 'lifted to the top: an account — not a site at the top');
    const d = await rowOf(P('d'));
    assert.deepEqual([d.accountId, d.account], [P('dock'), 'H6 Dock'], 'the deal on the survivor, an account now');
    const u = await mergeFn(ev(A, 'POST', { reverse: true, mergeLogId: JSON.parse(m.body).mergeLogId }));
    assert.equal(u.statusCode, 200, u.body);
    assert.deepEqual(await acct(P('dock')), [P('plant'), 'site'], 'undone: under the plant, a site again');
    const back = await rowOf(P('d'));
    assert.deepEqual([back.accountId, back.account], [P('plant'), 'H6 Plant']);
});

test("F3: an account merge renames only its own deals and those with no account id — a same-named twin's deals keep their name; the undo puts back exactly what it renamed", async () => {
    const TU = ID('twin_unit'), TS = ID('twin_site'), CHEM = ID('chem');
    await db.insert(accounts).values([
        { id: TU, name: 'Port Allen Twin', accountTier: 'business_unit', parentAccountId: SHELL, orgId: A },
        { id: TS, name: 'Port Allen Twin', accountTier: 'site', parentAccountId: SHELL, orgId: A },
        { id: CHEM, name: 'Shell Chemicals', accountTier: 'business_unit', parentAccountId: SHELL, orgId: A },
    ]);
    const deal = (id, accountId, account, orgId = A) => ({ id, opportunityName: id, account, accountId, pipelineId: 'default', stage: 'Discovery', orgId });
    await db.insert(opportunities).values([
        deal(ID('m_unit'), TU, 'Port Allen Twin'),
        deal(ID('m_site'), TS, 'Port Allen Twin'),
        deal(ID('m_none'), null, 'Port Allen Twin'),
        deal(ID('m_chem'), CHEM, 'Shell Chemicals'),
        deal(ID('m_b'), null, 'Port Allen Twin', B),
    ]);
    const m = await mergeFn(ev(A, 'POST', { entityType: 'account', survivorId: CHEM, archivedId: TU }));
    assert.equal(m.statusCode, 200, m.body);
    const now = async (id) => { const r = await rowOf(id); return [r.accountId, r.account]; };
    assert.deepEqual(await now(ID('m_unit')), [CHEM, 'Shell Chemicals'], "the merged-away twin's deal: the survivor's id and name (D14)");
    assert.deepEqual(await now(ID('m_site')), [TS, 'Port Allen Twin'], "the OTHER twin's deal: untouched — its id names the site, so its name stays the site's");
    assert.deepEqual(await now(ID('m_none')), [null, 'Shell Chemicals'], 'a deal with no id, named as the merged-away account: renamed, as before');
    assert.deepEqual(await now(ID('m_chem')), [CHEM, 'Shell Chemicals']);
    assert.deepEqual(await now(ID('m_b')), [null, 'Port Allen Twin'], "org B's deal of the name: never touched");
    const u = await mergeFn(ev(A, 'POST', { reverse: true, mergeLogId: JSON.parse(m.body).mergeLogId }));
    assert.equal(u.statusCode, 200, u.body);
    assert.deepEqual(await now(ID('m_unit')), [TU, 'Port Allen Twin'], 'undone: back on its twin, its name with it');
    assert.deepEqual(await now(ID('m_none')), [null, 'Port Allen Twin']);
    assert.deepEqual(await now(ID('m_site')), [TS, 'Port Allen Twin'], 'the twin\'s deal: still untouched');
});

test("§0.198, the pre-ship round — the deal window leaves an untouched Account and Site Name out of an edit: a PUT naming none of account, accountId and site keeps all three, and answers them", async () => {
    assert.equal((await call(A, 'POST', { id: ID('left'), opportunityName: 'Left out', account: 'Shell', accountId: SHELL, site: 'Plant B' })).status, 201);
    const r = await call(A, 'PUT', { id: ID('left'), opportunityName: 'Left out', nextSteps: 'Call Tuesday', stage: 'Proposal' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const row = await rowOf(ID('left'));
    assert.deepEqual([row.account, row.accountId, row.site, row.stage], ['Shell', SHELL, 'Plant B', 'Proposal'], 'the stage moved; the link and its Site Name as stored');
    assert.deepEqual([r.body.opportunity.account, r.body.opportunity.accountId, r.body.opportunity.site], ['Shell', SHELL, 'Plant B'], 'the answer is the row as stored: the list shows it');
});

test('§0.198 (the re-check) — an unlinked deal takes the spelling sent: a case or spacing difference is kept as typed, and links nothing', async () => {
    assert.equal((await call(A, 'POST', { id: ID('loose'), opportunityName: 'Loose', account: 'Loose Co' })).status, 201);
    assert.equal((await call(A, 'PUT', { id: ID('loose'), account: 'LOOSE  co' })).status, 200);
    const row = await rowOf(ID('loose'));
    assert.deepEqual([row.account, row.accountId], ['LOOSE  co', null]);
});
